import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

let db;
const uid='00000000-0000-0000-0000-000000000001';
const sqlFile = (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const row = async (sql, args=[]) => (await db.query(sql,args)).rows[0];
const service = () => ({item_type:'service',service_id:1,name:'Corte',quantity:1,line_total:150});
const product = (id=1) => ({item_type:'product',product_id:id,name:'Producto',quantity:1,line_total:150});
const sale = (overrides={}) => ({customer_id:1,exchange_rate:36.5,items:[service()],payment:{method:'cash',currency:'NIO',amount:150,received:200,change:50},...overrides});
const call = async (payload, id=randomUUID()) => (await row('SELECT public.complete_barbershop_sale($1,$2::jsonb) result',[id,JSON.stringify(payload)])).result;
const counts = () => row(`SELECT (SELECT count(*)::int FROM tickets) tickets,(SELECT count(*)::int FROM payments) payments,
 (SELECT count(*)::int FROM ticket_items) items,(SELECT count(*)::int FROM stock_movements) stock,
 (SELECT count(*)::int FROM loyalty_private.sale_requests) requests`);

before(async () => {
  db=new PGlite();
  await db.exec(await readFile(new URL('./fixtures/barbershop-sale.sql',import.meta.url),'utf8'));
  const inventory=await sqlFile('20260621000000_car_wash_inventory.sql');
  await db.exec(inventory.slice(inventory.indexOf('CREATE OR REPLACE FUNCTION public.check_service_inventory'),inventory.indexOf('GRANT EXECUTE ON FUNCTION public.check_service_inventory')));
  await db.exec(await sqlFile('20261027044324_report_ticket_loyalty_sync.sql'));
  const stock=await sqlFile('20260602000000_business_lines_barbershop.sql');
  await db.exec(stock.slice(stock.indexOf('CREATE OR REPLACE FUNCTION public.decrement_product_stock('),stock.indexOf('-- ── RPC: adjust stock')));
  await db.exec(await sqlFile('20261027195417_require_car_wash_ticket_service.sql'));
  await db.exec(await sqlFile('20261028020848_atomic_barbershop_sale.sql'));
});
after(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`RESET ROLE;
    TRUNCATE tickets,customers,services,profiles,products,stock_movements,loyalty_private.sale_requests CASCADE;
    SELECT set_config('test.uid','${uid}',false);
    INSERT INTO profiles VALUES('${uid}','admin',true);
    INSERT INTO customers(id,is_general) VALUES(1,true),(2,false);
    INSERT INTO services(id,name,business_line) VALUES(1,'Corte','barbershop'),(2,'Lavado','car_wash');
    INSERT INTO products(id,name,stock_quantity) VALUES(1,'Gel',5),(2,'Cera',0);`);
});

test('cashier sale uses real authorization, stock and ticket triggers; retry commits once', async () => {
  await db.exec("UPDATE profiles SET role='cajero'; SET ROLE authenticated");
  const id=randomUUID(),payload=sale({customer_id:2,items:[product()]});
  const first=await call(payload,id),retry=await call(payload,id);
  assert.equal(first.ticket.id,retry.ticket.id);
  assert.equal(first.ticket.status,'paid');
  await assert.rejects(call({...payload,customer_id:1},id),/datos diferentes/);
  await db.exec('RESET ROLE');
  assert.deepEqual(await counts(),{tickets:1,payments:1,items:1,stock:1,requests:1});
  assert.equal((await row('SELECT stock_quantity FROM products WHERE id=1')).stock_quantity,4);
});

test('empty, missing and unknown payment methods leave no sale', async () => {
  for(const method of [null,undefined,'','crypto']) await assert.rejects(call(sale({payment:{...sale().payment,method}})),/Método de pago inválido/);
  assert.deepEqual(await counts(),{tickets:0,payments:0,items:0,stock:0,requests:0});
});

test('card, transfer and cash work in NIO and USD with registered exchange rate', async () => {
  for(const currency of ['NIO','USD']) for(const method of ['cash','card','transfer']) {
    const amount=currency==='USD'?4.11:150;
    const result=await call(sale({payment:{currency,method,amount,received:amount+(method==='cash'?1:0),change:method==='cash'?1:0}}));
    const payment=await row('SELECT * FROM payments WHERE ticket_id=$1',[result.ticket.id]);
    assert.equal(payment.payment_method,method); assert.equal(payment.currency,currency);
    assert.equal(Number(payment.amount),amount); assert.equal(Number(payment.exchange_rate),36.5);
  }
});

test('mixed NIO and USD preserve applied amounts, change and method for each part', async () => {
  for(const currency of ['NIO','USD']) {
    const amount=currency==='USD'?4.11:150, cash=currency==='USD'?2:100;
    const payment={method:'mixed',currency,amount,received:amount+5,change:5,mixedPayments:[
      {method:'cash',amount:cash,received:cash+5,change:5},
      {method:'card',amount:Number((amount-cash).toFixed(2)),received:Number((amount-cash).toFixed(2)),change:0}
    ]};
    const result=await call(sale({payment}));
    const parts=(await db.query('SELECT * FROM ticket_mixed_payments WHERE ticket_id=$1 ORDER BY method',[result.ticket.id])).rows;
    assert.equal(parts.length,2); assert.equal(Number(parts[1].change_nio),currency==='USD'?182.5:5);
    assert.equal(Number(parts[1].applied_nio),currency==='USD'?73:100);
    assert.equal((await row('SELECT payment_method FROM payments WHERE ticket_id=$1',[result.ticket.id])).payment_method,'mixed');
  }
});

test('stock failure on a later item restores earlier stock and all sale records', async () => {
  await assert.rejects(call(sale({items:[product(),product(2)],payment:{...sale().payment,amount:300,received:300,change:0}})),/Stock insuficiente/);
  assert.deepEqual(await counts(),{tickets:0,payments:0,items:0,stock:0,requests:0});
  assert.equal((await row('SELECT stock_quantity FROM products WHERE id=1')).stock_quantity,5);
});

test('payment insertion failure rolls back stock, concepts, ticket and request; same request can retry', async () => {
  await db.exec(`CREATE FUNCTION public.fail_test_payment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Pago no disponible'; END $$;
    CREATE TRIGGER fail_test_payment BEFORE INSERT ON payments FOR EACH ROW EXECUTE FUNCTION public.fail_test_payment();`);
  const id=randomUUID(),payload=sale({items:[product()]});
  await assert.rejects(call(payload,id),/Pago no disponible/);
  assert.deepEqual(await counts(),{tickets:0,payments:0,items:0,stock:0,requests:0});
  assert.equal((await row('SELECT stock_quantity FROM products WHERE id=1')).stock_quantity,5);
  await db.exec('DROP TRIGGER fail_test_payment ON payments; DROP FUNCTION public.fail_test_payment()');
  assert.equal((await call(payload,id)).ticket.status,'paid');
});

test('invalid or incomplete amounts, received money and mixed breakdown are rejected', async () => {
  const normal=sale().payment;
  const mixed={method:'mixed',currency:'NIO',amount:150,received:150,change:0,mixedPayments:[
    {method:'cash',amount:100,received:100,change:0},{method:'card',amount:50,received:50,change:0}]};
  for(const payment of [
    {...normal,amount:149.99}, {...normal,received:100}, {...normal,change:-1}, {...normal,received:null},
    {...normal,amount:'NaN'}, {...normal,received:'Infinity'}, {...mixed,mixedPayments:[]},
    {...mixed,mixedPayments:[mixed.mixedPayments[0],{method:'card',amount:null,received:50,change:0}]},
    {...mixed,mixedPayments:[mixed.mixedPayments[0],{method:'transfer',amount:49,received:49,change:0}]},
    {...mixed,mixedPayments:[mixed.mixedPayments[0],{method:'card',amount:50,received:55,change:5}]}
  ]) await assert.rejects(call(sale({payment})));
  assert.deepEqual(await counts(),{tickets:0,payments:0,items:0,stock:0,requests:0});
});

test('rounding multiple discounted concepts keeps item, ticket and payment totals equal', async () => {
  const result=await call(sale({items:[{...service(),line_total:33.335},{...service(),line_total:33.335}],payment:{method:'card',currency:'NIO',amount:66.68,received:66.68,change:0}}));
  assert.equal(Number(result.ticket.total),66.68);
  assert.equal(Number((await row('SELECT sum(price) total FROM ticket_items')).total),66.68);
});

test('a paid ticket cannot lose its last payment or move it to another ticket', async () => {
  await assert.rejects(db.exec("INSERT INTO tickets(ticket_number,status,business_line,total) VALUES('B-INVALID','paid','barbershop',150)"),/sin método de pago/);
  const result=await call(sale());
  await assert.rejects(db.exec('DELETE FROM payments'),/sin método de pago/);
  await db.exec("INSERT INTO tickets(ticket_number,status,business_line,total) VALUES('B-PENDING','pending','barbershop',150)");
  await assert.rejects(db.exec("UPDATE payments SET ticket_id=(SELECT id FROM tickets WHERE status='pending')"),/sin método de pago/);
  assert.equal(Number((await row('SELECT ticket_id FROM payments')).ticket_id),Number(result.ticket.id));
  // Cascading deletion remains possible for an administrator.
  await db.query('DELETE FROM tickets WHERE id=$1',[result.ticket.id]);
  assert.equal((await row('SELECT count(*)::int n FROM payments')).n,0);
});

test('anonymous, inactive and unknown staff cannot register sales', async () => {
  await db.exec('SET ROLE anon'); await assert.rejects(call(sale()),/permission denied/);
  await db.exec('RESET ROLE; UPDATE profiles SET active=false; SET ROLE authenticated');
  await assert.rejects(call(sale()),/Permisos insuficientes/);
  await db.exec('RESET ROLE; DELETE FROM profiles; SET ROLE authenticated');
  await assert.rejects(call(sale()),/Permisos insuficientes/);
});

test('existing car-wash checkout can still commit an atomic cross-sale to barber', async () => {
  const payload={customer_id:1,exchange_rate:36.5,payment:{method:'card',currency:'NIO',amount:300,received:300,change:0},items:[
    {service_id:2,service_name:'Lavado',price:150,discount_percent:0,business_line:'car_wash'},
    {service_id:1,service_name:'Corte',price:150,discount_percent:0,business_line:'barbershop'}]};
  const result=await row('SELECT complete_car_wash_sale($1,$2::jsonb) result',[randomUUID(),JSON.stringify(payload)]);
  assert.equal(result.result.success,true);
  assert.equal((await row("SELECT count(*)::int n FROM tickets WHERE status='paid'")).n,2);
  assert.equal((await row('SELECT count(*)::int n FROM payments')).n,2);
});

test('replaying a mixed sale returns exactly its original receipt and never repeats stock or payment parts', async () => {
  const payload=sale({items:[product()],payment:{method:'mixed',currency:'NIO',amount:150,received:200,change:50,mixedPayments:[
    {method:'cash',amount:100,received:150,change:50},{method:'card',amount:50,received:50,change:0}]}});
  const id=randomUUID(),first=await call(payload,id);
  const responses=await Promise.all(Array.from({length:8},()=>call(payload,id)));
  responses.forEach(response=>assert.deepEqual(response,first));
  assert.deepEqual(await counts(),{tickets:1,payments:1,items:1,stock:1,requests:1});
  assert.equal((await row('SELECT count(*)::int n FROM ticket_mixed_payments')).n,2);
  assert.equal((await row('SELECT stock_quantity FROM products WHERE id=1')).stock_quantity,4);
});

test('a completed request rejects edited customer, items and payment with a stable conflict marker', async () => {
  const payload=sale(),id=randomUUID();
  const first=await call(payload,id);
  for(const changed of [
    {...payload,customer_id:2},
    {...payload,items:[{...service(),name:'Otro corte'}]},
    {...payload,payment:{method:'card',currency:'NIO',amount:150,received:150,change:0}}
  ]) await assert.rejects(call(changed,id),error=>error.detail==='IDEMPOTENCY_CONFLICT');
  assert.deepEqual(await call(payload,id),first);
  assert.deepEqual(await counts(),{tickets:1,payments:1,items:1,stock:0,requests:1});
});

test('another authorized user cannot retrieve or reuse someone else\'s sale identity', async () => {
  const payload=sale(),id=randomUUID(); await call(payload,id);
  const other='00000000-0000-0000-0000-000000000002';
  await db.query("INSERT INTO profiles VALUES($1,'cajero',true)",[other]);
  await db.query("SELECT set_config('test.uid',$1,false)",[other]);
  await db.exec('SET ROLE authenticated');
  await assert.rejects(call(payload,id),error=>error.detail==='IDEMPOTENCY_CONFLICT');
  await db.exec('RESET ROLE');
  assert.equal((await counts()).tickets,1);
});

test('different identities allow legitimate identical sales; amounts or timestamps do not deduplicate', async () => {
  const first=await call(sale()),second=await call(sale());
  assert.notEqual(first.ticket.id,second.ticket.id);
  assert.notEqual(first.ticket.ticket_number,second.ticket.ticket_number);
  assert.equal((await counts()).tickets,2);
});

test('replaying a deleted sale never recreates its ticket, payments or stock movements', async () => {
  const id=randomUUID(),payload=sale({items:[product()]});
  const first=await call(payload,id);
  await db.query('DELETE FROM tickets WHERE id=$1',[first.ticket.id]);
  const before=await counts(),stockBefore=await row('SELECT stock_quantity FROM products WHERE id=1');
  assert.deepEqual(await call(payload,id),first);
  assert.deepEqual(await counts(),before);
  assert.deepEqual(await row('SELECT stock_quantity FROM products WHERE id=1'),stockBefore);
});
