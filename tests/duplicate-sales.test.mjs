import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

let db;
const uid = '00000000-0000-0000-0000-000000000001';
const otherUid = '00000000-0000-0000-0000-000000000002';
const sqlFile = name => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const row = async (sql, args = []) => (await db.query(sql, args)).rows[0];
const washPayload = (overrides = {}) => ({customer_id: 1, vehicle_plate: 'M123', vehicle_type_id: 3,
  membership_id: null, reward_id: null, loyalty_original_amount: 0, use_legacy_reward: false, exchange_rate: 36.5,
  items: [{service_id: 1, service_name: 'Premium', price: 250, discount_percent: 0, business_line: 'car_wash'}],
  payment: {method: 'cash', currency: 'NIO', amount: 250, received: 300, change: 50}, ...overrides});
const barberPayload = (overrides = {}) => ({customer_id: 1, exchange_rate: 36.5,
  items: [{item_type: 'service', service_id: 2, name: 'Corte', quantity: 1, line_total: 150}],
  payment: {method: 'cash', currency: 'NIO', amount: 150, received: 150, change: 0}, ...overrides});
const call = async (area, payload, id = randomUUID()) => (await row(
  `SELECT public.complete_${area}_sale($1,$2::jsonb) result`, [id, JSON.stringify(payload)])).result;
const counts = () => row(`SELECT (SELECT count(*)::int FROM tickets) tickets,
  (SELECT count(*)::int FROM payments) payments, (SELECT count(*)::int FROM ticket_items) items,
  (SELECT count(*)::int FROM inventory_test) inventory, (SELECT count(*)::int FROM membership_washes) membership_washes,
  (SELECT count(*)::int FROM loyalty_private.sale_requests) requests`);
const ageGuard = () => db.exec("UPDATE loyalty_private.recent_sale_guards SET confirmed_at=clock_timestamp()-interval '31 seconds'");
const duplicate = async promise => {
  await assert.rejects(promise, error => {
    assert.equal(error.code, 'P0001');
    const detail = JSON.parse(error.detail);
    assert.equal(detail.code, 'DUPLICATE_SALE');
    assert.ok(detail.ticket_id > 0);
    assert.ok(detail.retry_after_seconds >= 1 && detail.retry_after_seconds <= 30);
    return true;
  });
};

before(async () => {
  db = new PGlite();
  await db.exec(await readFile(new URL('./fixtures/barbershop-sale.sql', import.meta.url), 'utf8'));
  const inventory = await sqlFile('20260621000000_car_wash_inventory.sql');
  await db.exec(inventory.slice(inventory.indexOf('CREATE OR REPLACE FUNCTION public.check_service_inventory'), inventory.indexOf('GRANT EXECUTE ON FUNCTION public.check_service_inventory')));
  await db.exec(await sqlFile('20261027044324_report_ticket_loyalty_sync.sql'));
  await db.exec(await sqlFile('20261027195417_require_car_wash_ticket_service.sql'));
  await db.exec(await sqlFile('20261028020848_atomic_barbershop_sale.sql'));
  await db.exec(await sqlFile('20261028024444_validate_car_wash_mixed_payment_parts.sql'));
  await db.exec(await sqlFile('20261029062838_prevent_duplicate_pos_sales.sql'));
});
after(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`RESET ROLE;
    TRUNCATE tickets,customers,services,profiles,customer_memberships,membership_plans,loyalty_private.sale_requests,
      loyalty_private.recent_sale_guards,inventory_test CASCADE;
    SELECT set_config('test.uid','${uid}',false);
    INSERT INTO profiles VALUES('${uid}','cajero',true),('${otherUid}','cajero',true);
    INSERT INTO customers(id,is_general) VALUES(1,false),(2,false),(3,true);
    INSERT INTO services(id,name,business_line) VALUES(1,'Premium','car_wash'),(2,'Corte','barbershop'),(3,'Breve','car_wash');`);
});

for (const [area, payload] of [['car_wash', washPayload], ['barbershop', barberPayload]]) {
  test(`${area}: same UUID stays idempotent; a new equivalent UUID rolls back completely`, async () => {
    const id = randomUUID(), first = await call(area, payload(), id), before = await counts();
    assert.deepEqual(await call(area, payload(), id), first);
    await duplicate(call(area, payload()));
    assert.deepEqual(await counts(), before);
    await ageGuard();
    assert.deepEqual(await call(area, payload(), id), first);
    const next = await call(area, payload());
    assert.notEqual(next.ticket.id, first.ticket.id);
  });

  test(`${area}: the guard is shared across cashiers for identified customers`, async () => {
    await call(area, payload());
    await db.exec(`SELECT set_config('test.uid','${otherUid}',false)`);
    await duplicate(call(area, payload()));
    await call(area, payload({customer_id: 2}));
    assert.equal((await counts()).tickets, 2);
  });

  test(`${area}: walk-ins are scoped to their cashier and do not stop another cashier`, async () => {
    await call(area, payload({customer_id: 3}));
    await duplicate(call(area, payload({customer_id: 3})));
    await db.exec(`SELECT set_config('test.uid','${otherUid}',false)`);
    await call(area, payload({customer_id: 3}));
    assert.equal((await counts()).tickets, 2);
  });
}

test('membership usage catches changing remaining-washes captions and restores the balance on rejection', async () => {
  await db.exec(`INSERT INTO membership_plans VALUES(1,28);
    INSERT INTO customer_memberships(id,customer_id,service_id,washes_used,total_washes_allowed,active,expires_at,plan_id)
      VALUES(1,1,1,1,8,true,now()+interval '1 day',1)`);
  const payload = remaining => washPayload({membership_id: 1,
    payment: {method: 'cash', currency: 'NIO', amount: 0, received: 0, change: 0},
    items: [{...washPayload().items[0], price: 0, service_name: `Premium (Membresía - ${remaining} lavados restantes)`}]});
  await call('car_wash', payload(6));
  await duplicate(call('car_wash', payload(5)));
  assert.equal((await row('SELECT washes_used FROM customer_memberships WHERE id=1')).washes_used, 2);
  assert.equal((await counts()).membership_washes, 1);
  assert.equal((await counts()).tickets, 1);
});

test('changing cash received, payment method or currency does not bypass equivalent-sale detection', async () => {
  await call('car_wash', washPayload());
  for (const payment of [
    {method: 'cash', currency: 'NIO', amount: 250, received: 500, change: 250},
    {method: 'card', currency: 'NIO', amount: 250, received: 250, change: 0},
    {method: 'transfer', currency: 'USD', amount: 6.85, received: 6.85, change: 0},
  ]) await duplicate(call('car_wash', washPayload({payment})));
  assert.equal((await counts()).tickets, 1);
});

test('item order, split quantities and catalog captions normalize to the same sale', async () => {
  const one = {item_type: 'service', service_id: 2, name: 'Corte', quantity: 1, line_total: 150};
  const custom = {item_type: 'service', name: '  Arreglo   de barba  ', quantity: 1, line_total: 50};
  const payment = {method: 'cash', currency: 'NIO', amount: 350, received: 350, change: 0};
  await call('barbershop', barberPayload({items: [one, custom, one], payment}));
  await duplicate(call('barbershop', barberPayload({items: [
    {...custom, name: 'ARREGLO DE BARBA'}, {...one, name: 'Corte actualizado', quantity: 2, line_total: 300},
  ], payment})));
});

test('different vehicles, concepts, totals and business areas can continue immediately', async () => {
  await call('car_wash', washPayload());
  await call('car_wash', washPayload({vehicle_plate: 'M124'}));
  await call('car_wash', washPayload({items: [{...washPayload().items[0], service_id: 3}]}));
  await call('car_wash', washPayload({items: [{...washPayload().items[0], price: 200}],
    payment: {method: 'card', currency: 'NIO', amount: 200, received: 200, change: 0}}));
  await call('barbershop', barberPayload());
  assert.equal((await counts()).tickets, 5);
});

test('a duplicate in the barber portion of a mixed-area sale rolls back the entire new sale', async () => {
  await call('barbershop', barberPayload());
  const before = await counts();
  const payload = washPayload({payment: {method: 'cash', currency: 'NIO', amount: 400, received: 400, change: 0}});
  payload.items.push({service_id: 2, service_name: 'Corte', price: 150, discount_percent: 0, business_line: 'barbershop'});
  await duplicate(call('car_wash', payload));
  assert.deepEqual(await counts(), before);
});

test('membership purchases and renewals are protected even with their current multi-request flow', async () => {
  const insert = number => db.query(`INSERT INTO tickets(ticket_number,user_id,customer_id,vehicle_type_id,total,status)
    VALUES($1,$2,1,3,1200,'paid')`, [number, uid]);
  await insert('M-ONE');
  await duplicate(insert('M-TWO'));
  await duplicate(insert('MR-THREE'));
  assert.equal((await counts()).tickets, 1);
});

test('private guard state and helper functions cannot be accessed by clients', async () => {
  const permissions = await row(`SELECT
    has_table_privilege('authenticated','loyalty_private.recent_sale_guards','SELECT') AS readable,
    has_table_privilege('authenticated','loyalty_private.recent_sale_guards','INSERT') AS writable,
    has_function_privilege('authenticated','loyalty_private.sale_fingerprint(bigint)','EXECUTE') AS callable,
    (SELECT relrowsecurity FROM pg_class WHERE oid='loyalty_private.recent_sale_guards'::regclass) AS rls`);
  assert.deepEqual(permissions, {readable: false, writable: false, callable: false, rls: true});
});

test('a second paid transition on the same ticket and report edits do not extend the window', async () => {
  const first = await call('barbershop', barberPayload());
  await ageGuard();
  const before = await row('SELECT confirmed_at FROM loyalty_private.recent_sale_guards');
  await db.exec("UPDATE profiles SET role='admin'");
  await db.query("UPDATE tickets SET status='paid',vehicle_plate='CORRECTED' WHERE id=$1", [first.ticket.id]);
  assert.deepEqual(await row('SELECT confirmed_at FROM loyalty_private.recent_sale_guards'), before);
});

test('two equivalent sales inside one transaction reject both instead of leaking partial writes', async () => {
  await db.exec('BEGIN');
  await call('car_wash', washPayload());
  await call('car_wash', washPayload());
  await duplicate(db.exec('COMMIT'));
  assert.equal((await counts()).tickets, 0);
  assert.equal((await counts()).requests, 0);
});
