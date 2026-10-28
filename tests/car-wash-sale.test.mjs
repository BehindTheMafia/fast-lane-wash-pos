import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

let db;
const uid='00000000-0000-0000-0000-000000000001';
const migration=name=>readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8');
const row=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
const payload=(overrides={})=>({customer_id:1,vehicle_plate:'TEST001',vehicle_type_id:1,membership_id:null,reward_id:null,
  loyalty_original_amount:0,use_legacy_reward:false,exchange_rate:36.5,
  payment:{method:'cash',currency:'NIO',amount:250,received:300,change:50},
  items:[{service_id:1,service_name:'Servicio Premium',price:250,discount_percent:0,business_line:'car_wash',is_loyalty_redemption:false}],...overrides});
const sale=async(p=payload(),id=randomUUID())=>(await row('SELECT complete_car_wash_sale($1,$2::jsonb) result',[id,JSON.stringify(p)])).result;
const counts=()=>row(`SELECT (SELECT count(*)::int FROM tickets) tickets,(SELECT count(*)::int FROM payments) payments,
  (SELECT count(*)::int FROM ticket_items) items,(SELECT count(*)::int FROM stock_movements) stock,
  (SELECT count(*)::int FROM loyalty_visits) visits,(SELECT count(*)::int FROM loyalty_wash_log) washes,
  (SELECT count(*)::int FROM loyalty_private.sale_requests) requests`);
const inventory=()=>row('SELECT stock_quantity,usage_count FROM products WHERE id=1');

before(async()=>{
  db=new PGlite();
  await db.exec(await readFile(new URL('./fixtures/barbershop-sale.sql',import.meta.url),'utf8'));
  await db.exec(`ALTER TABLE stock_movements ADD COLUMN notes text;
    ALTER TABLE payments ALTER COLUMN payment_method SET NOT NULL;
    ALTER TABLE payments ADD CHECK(payment_method IN ('cash','card','transfer','mixed'));
    ALTER TABLE ticket_mixed_payments ALTER COLUMN method SET NOT NULL;
    ALTER TABLE ticket_mixed_payments ALTER COLUMN amount SET NOT NULL;
    ALTER TABLE ticket_mixed_payments ALTER COLUMN amount_nio SET NOT NULL;
    ALTER TABLE ticket_mixed_payments ALTER COLUMN applied_nio SET NOT NULL;
    ALTER TABLE ticket_mixed_payments ALTER COLUMN change_nio SET NOT NULL;`);
  // Replace the fixture stubs with the real check, consumption and reversal functions.
  const stock=await migration('20260621000000_car_wash_inventory.sql');
  await db.exec(stock.slice(stock.indexOf('CREATE OR REPLACE FUNCTION public.check_service_inventory'),stock.indexOf('-- ── Seed car_wash products')));
  const rewards=await migration('20260825000000_loyalty_reward_choices.sql');
  await db.exec(rewards.slice(rewards.indexOf('CREATE OR REPLACE FUNCTION public.validate_loyalty_redemption'),rewards.indexOf('GRANT EXECUTE ON FUNCTION public.select_reward_option')));
  await db.exec(await migration('20261027044324_report_ticket_loyalty_sync.sql'));
  await db.exec(await migration('20261027195417_require_car_wash_ticket_service.sql'));
  await db.exec(await migration('20261028020848_atomic_barbershop_sale.sql'));
  await db.exec(await migration('20261028024444_validate_car_wash_mixed_payment_parts.sql'));
});
after(async()=>{await db?.close();});
beforeEach(async()=>{
  await db.exec(`RESET ROLE;
    TRUNCATE tickets,customers,services,profiles,products,stock_movements,loyalty_programs,customer_memberships,membership_plans,loyalty_private.sale_requests CASCADE;
    SELECT set_config('test.uid','${uid}',false);
    INSERT INTO profiles VALUES('${uid}','cajero',true);
    INSERT INTO customers(id,is_general) VALUES(1,false),(2,true);
    INSERT INTO services(id,name,business_line) VALUES(1,'Servicio Premium','car_wash'),(2,'Corte','barbershop'),(99,'Lavado sin stock','car_wash');
    INSERT INTO products(id,name,stock_quantity,services_per_unit,usage_count,business_line) VALUES(1,'Shampoo',2,2,1,'car_wash'),(2,'Cera',0,2,0,'car_wash');
    INSERT INTO service_products(service_id,product_id) VALUES(1,1),(99,2);
    INSERT INTO loyalty_programs VALUES(1,'Premium','premium',9,'[]',true);`);
});

test('cashier retry preserves the exact receipt and consumes a physical stock unit and loyalty visit only once',async()=>{
  await db.exec('SET ROLE authenticated');
  const id=randomUUID(),first=await sale(payload(),id);
  const results=await Promise.all(Array.from({length:6},()=>sale(payload(),id)));
  results.forEach(result=>assert.deepEqual(result,first));
  await db.exec('RESET ROLE');
  assert.deepEqual(await counts(),{tickets:1,payments:1,items:1,stock:1,visits:1,washes:1,requests:1});
  assert.deepEqual(await inventory(),{stock_quantity:1,usage_count:0});
  assert.equal(first.ticket.status,'paid');
});

test('cash, card and transfer in NIO and USD record a valid method and conserve amount and change',async()=>{
  for(const currency of ['NIO','USD']) for(const method of ['cash','card','transfer']) {
    // Give every independent sale enough consumable stock.
    await db.exec('UPDATE products SET stock_quantity=10 WHERE id=1');
    const amount=currency==='USD'?6.85:250,change=method==='cash'?5:0;
    const result=await sale(payload({payment:{method,currency,amount,received:amount+change,change}}));
    const pay=await row('SELECT * FROM payments WHERE ticket_id=$1',[result.ticket.id]);
    assert.equal(pay.payment_method,method);assert.equal(pay.currency,currency);
    assert.equal(Number(pay.amount),amount);assert.equal(Number(pay.change_amount),change);
    assert.equal(Number(pay.amount_received),amount+change);
  }
});

test('mixed cross-sales conserve payment allocation and change in NIO and USD without duplicating loyalty',async()=>{
  for(const currency of ['NIO','USD']) {
    const amount=currency==='USD'?9.59:350,card=currency==='USD'?5:200,cash=Number((amount-card).toFixed(2));
    const payment={method:'mixed',currency,amount,received:amount+1,change:1,mixedPayments:[
      {method:'card',amount:card,received:card,change:0},{method:'cash',amount:cash,received:cash+1,change:1}]};
    const p=payload({payment});p.items.push({service_id:2,service_name:'Corte',price:100,discount_percent:0,business_line:'barbershop'});
    const id=randomUUID(),first=await sale(p,id),before=await counts();
    assert.deepEqual(await sale(p,id),first);assert.deepEqual(await counts(),before);
    const totals=await row(`SELECT sum(p.amount) amount,sum(p.change_amount) change,sum(p.amount_received) received
      FROM payments p JOIN tickets t ON t.id=p.ticket_id WHERE t.ticket_number LIKE $1`,[`%-${id.replaceAll('-','').toUpperCase()}`]);
    assert.equal(Number(totals.amount),amount);assert.equal(Number(totals.change),1);assert.equal(Number(totals.received),amount+1);
    const split=await row(`SELECT sum(mp.amount) amount,sum(mp.change_nio) change FROM ticket_mixed_payments mp JOIN tickets t ON t.id=mp.ticket_id WHERE t.ticket_number LIKE $1`,[`%-${id.replaceAll('-','').toUpperCase()}`]);
    assert.equal(Number(split.amount),amount);assert.equal(Number(split.change),currency==='USD'?36.5:1);
    assert.equal((await row('SELECT count(*)::int n FROM loyalty_visits')).n,currency==='USD'?2:1);
  }
});

test('missing or invalid payment method rejects the complete sale',async()=>{
  for(const method of [null,undefined,'','unknown']) await assert.rejects(sale(payload({payment:{...payload().payment,method}})),/Pago inválido/);
  assert.deepEqual(await counts(),{tickets:0,payments:0,items:0,stock:0,visits:0,washes:0,requests:0});
  assert.deepEqual(await inventory(),{stock_quantity:2,usage_count:1});
});

test('a later unavailable service rolls back earlier stock consumption, both tickets, payments and loyalty',async()=>{
  const p=payload({payment:{method:'card',currency:'NIO',amount:600,received:600,change:0}});
  p.items.push({service_id:99,service_name:'Lavado sin stock',price:250,discount_percent:0,business_line:'car_wash'},
    {service_id:2,service_name:'Corte',price:100,discount_percent:0,business_line:'barbershop'});
  await assert.rejects(sale(p),/Stock insuficiente/);
  assert.deepEqual(await counts(),{tickets:0,payments:0,items:0,stock:0,visits:0,washes:0,requests:0});
  assert.deepEqual(await inventory(),{stock_quantity:2,usage_count:1});
});

test('payment insertion failure restores real inventory and allows retrying the same identity',async()=>{
  await db.exec(`CREATE FUNCTION fail_carwash_payment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo al registrar pago'; END $$;
    CREATE TRIGGER fail_carwash_payment BEFORE INSERT ON payments FOR EACH ROW EXECUTE FUNCTION fail_carwash_payment();`);
  const id=randomUUID();
  try {
    await assert.rejects(sale(payload(),id),/Fallo al registrar pago/);
    assert.deepEqual(await counts(),{tickets:0,payments:0,items:0,stock:0,visits:0,washes:0,requests:0});
    assert.deepEqual(await inventory(),{stock_quantity:2,usage_count:1});
  } finally {await db.exec('DROP TRIGGER fail_carwash_payment ON payments;DROP FUNCTION fail_carwash_payment()');}
  const result=await sale(payload(),id);assert.equal(result.success,true);
  assert.deepEqual(await inventory(),{stock_quantity:1,usage_count:0});
});

test('invalid mixed parts or a wrong sum leave no ticket or consumed inventory',async()=>{
  const base={method:'mixed',currency:'NIO',amount:250,received:250,change:0};
  for(const mixedPayments of [[],[{method:'cash',amount:100},{method:'card',amount:100}],
    [{method:null,amount:100},{method:'card',amount:150}],
    [{method:'cash',amount:null},{method:'card',amount:250}],
    [{method:'cash',amount:100,change:-5},{method:'card',amount:150,change:5}]]) {
    await assert.rejects(sale(payload({payment:{...base,mixedPayments}})));
    assert.deepEqual(await counts(),{tickets:0,payments:0,items:0,stock:0,visits:0,washes:0,requests:0});
    assert.deepEqual(await inventory(),{stock_quantity:2,usage_count:1});
  }
});

test('a membership is used only once on replay; an exhausted membership rejects without further effects',async()=>{
  await db.exec(`INSERT INTO customer_memberships(id,customer_id,service_id,washes_used,total_washes_allowed,active,expires_at)
    VALUES(1,1,1,0,1,true,now()+interval '1 day');`);
  const p=payload({membership_id:1,payment:{method:'cash',currency:'NIO',amount:0,received:0,change:0}});p.items[0].discount_percent=100;
  const id=randomUUID(),first=await sale(p,id);assert.deepEqual(await sale(p,id),first);
  assert.equal((await row('SELECT washes_used FROM customer_memberships WHERE id=1')).washes_used,1);
  assert.equal((await row('SELECT count(*)::int n FROM membership_washes')).n,1);
  const before=await counts(),stockBefore=await inventory();
  await assert.rejects(sale(p),/Membresía no disponible/);
  assert.deepEqual(await counts(),before);assert.deepEqual(await inventory(),stockBefore);
});

test('an existing identity rejects changed payment or customer and cannot expose a receipt to another cashier',async()=>{
  const id=randomUUID();await sale(payload(),id);
  await assert.rejects(sale(payload({customer_id:2}),id),error=>error.detail==='IDEMPOTENCY_CONFLICT');
  await assert.rejects(sale(payload({payment:{...payload().payment,method:'card'}}),id),/otros datos/);
  const other=randomUUID();await db.query("INSERT INTO profiles VALUES($1,'cajero',true)",[other]);
  await db.query("SELECT set_config('test.uid',$1,false)",[other]);await db.exec('SET ROLE authenticated');
  await assert.rejects(sale(payload(),id),/otros datos/);
  await db.exec('RESET ROLE');assert.equal((await counts()).tickets,1);
});

test('an independent key allows a legitimate identical sale; replay after deletion never recreates it',async()=>{
  const id=randomUUID(),first=await sale(payload(),id),second=await sale();assert.notEqual(first.ticket.id,second.ticket.id);
  await db.exec("UPDATE profiles SET role='admin'");
  await db.query('SELECT delete_report_ticket($1)',[first.ticket.id]);
  const before=await counts(),stockBefore=await inventory();
  assert.deepEqual(await sale(payload(),id),first);assert.deepEqual(await counts(),before);assert.deepEqual(await inventory(),stockBefore);
});
