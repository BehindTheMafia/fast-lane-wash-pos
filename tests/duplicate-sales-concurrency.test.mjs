import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

const connection = process.env.POS_DUPLICATE_TEST_DATABASE_URL;
const psql = process.env.POS_DUPLICATE_TEST_PSQL;
const exec = promisify(execFile);
const migration = name => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');

// Optional integration test: an isolated local database, never a production URL.
test('duplicate sales with two real PostgreSQL connections', {skip: !connection || !psql}, async t => {
  const url = new URL(connection);
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname), 'Only a local test server is allowed');
  assert.equal(url.pathname, '/pos_duplicate_sales_test', 'Use a dedicated disposable test database');
  const query = sql => exec(psql, ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-d', connection, '-c', sql]);
  await query(await readFile(new URL('./fixtures/barbershop-sale.sql', import.meta.url), 'utf8'));
  const inventory = await migration('20260621000000_car_wash_inventory.sql');
  await query(inventory.slice(inventory.indexOf('CREATE OR REPLACE FUNCTION public.check_service_inventory'), inventory.indexOf('GRANT EXECUTE ON FUNCTION public.check_service_inventory')));
  for (const name of ['20261027044324_report_ticket_loyalty_sync.sql', '20261027195417_require_car_wash_ticket_service.sql',
    '20261028020848_atomic_barbershop_sale.sql', '20261028024444_validate_car_wash_mixed_payment_parts.sql',
    '20261029062838_prevent_duplicate_pos_sales.sql']) await query(await migration(name));
  const uid='00000000-0000-0000-0000-000000000001';
  await query(`INSERT INTO profiles VALUES('${uid}','cajero',true);
    INSERT INTO customers(id,is_general) VALUES(1,false);
    INSERT INTO services(id,name,business_line) VALUES(1,'Premium','car_wash'),(2,'Corte','barbershop');`);
  const payloads = {
    car_wash: {customer_id:1,vehicle_plate:'TEST',vehicle_type_id:3,exchange_rate:36.5,
      items:[{service_id:1,service_name:'Premium',price:250,discount_percent:0,business_line:'car_wash'}],
      payment:{method:'cash',currency:'NIO',amount:250,received:250,change:0}},
    // No shared customer row: this exercises the guard's own concurrency lock.
    barbershop: {customer_id:null,exchange_rate:36.5,
      items:[{item_type:'service',service_id:2,name:'Corte',quantity:1,line_total:150}],
      payment:{method:'cash',currency:'NIO',amount:150,received:150,change:0}},
  };
  for (const area of ['car_wash','barbershop']) {
    for (const isolation of ['READ COMMITTED','REPEATABLE READ','SERIALIZABLE']) {
      await t.test(`${area}: different UUIDs at ${isolation} commit only once`, async () => {
        await query('TRUNCATE tickets,loyalty_private.sale_requests,loyalty_private.recent_sale_guards,inventory_test CASCADE');
        const attempt = () => query(`BEGIN ISOLATION LEVEL ${isolation};
          SELECT set_config('test.uid','${uid}',true);
          SELECT public.complete_${area}_sale('${randomUUID()}','${JSON.stringify(payloads[area])}'::jsonb);
          SELECT pg_sleep(0.2); COMMIT;`);
        const results = await Promise.allSettled([attempt(), attempt()]);
        assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
        const failure = results.find(r => r.status === 'rejected');
        assert.match(failure.reason.stderr, /P0001|40001|40P01/);
        assert.equal((await query('SELECT count(*) FROM tickets')).stdout.trim(), '1');
        assert.equal((await query('SELECT count(*) FROM payments')).stdout.trim(), '1');
        assert.equal((await query('SELECT count(*) FROM loyalty_private.sale_requests')).stdout.trim(), '1');
      });
    }
    await t.test(`${area}: concurrent retries of the same UUID return one receipt`, async () => {
      await query('TRUNCATE tickets,loyalty_private.sale_requests,loyalty_private.recent_sale_guards,inventory_test CASCADE');
      const id=randomUUID();
      const attempt=()=>query(`BEGIN; SELECT set_config('test.uid','${uid}',true);
        SELECT public.complete_${area}_sale('${id}','${JSON.stringify(payloads[area])}'::jsonb);
        SELECT pg_sleep(0.2); COMMIT;`);
      await Promise.all([attempt(),attempt()]);
      assert.equal((await query('SELECT count(*) FROM tickets')).stdout.trim(), '1');
      assert.equal((await query('SELECT count(*) FROM payments')).stdout.trim(), '1');
    });
  }
});
