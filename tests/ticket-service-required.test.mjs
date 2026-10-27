import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

let db;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA loyalty_private;
    CREATE TYPE public.business_line AS ENUM ('car_wash', 'barbershop');
    CREATE TYPE public.ticket_item_type AS ENUM ('service', 'product');
    CREATE TABLE public.tickets (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      ticket_number text,
      status text NOT NULL,
      business_line public.business_line NOT NULL
    );
    CREATE TABLE public.ticket_items (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      ticket_id bigint NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
      service_id bigint,
      item_type public.ticket_item_type NOT NULL DEFAULT 'service',
      service_name_snapshot text
    );
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20261027195417_require_car_wash_ticket_service.sql', import.meta.url), 'utf8'));
});

afterEach(async () => { await db?.close(); });

test('a paid car-wash sale cannot commit without a service', async () => {
  await assert.rejects(db.exec("INSERT INTO tickets(ticket_number,status,business_line) VALUES('T-EMPTY','paid','car_wash')"), /sin servicio o concepto/);
  assert.equal((await db.query('SELECT count(*)::int n FROM tickets')).rows[0].n, 0);
});

test('an atomic pending sale commits once its catalog service is present', async () => {
  await db.exec(`BEGIN;
    INSERT INTO tickets(ticket_number,status,business_line) VALUES('T-VALID','pending','car_wash');
    INSERT INTO ticket_items(ticket_id,service_id) VALUES(1,16);
    UPDATE tickets SET status='paid' WHERE id=1;
    COMMIT;`);
  assert.equal((await db.query("SELECT count(*)::int n FROM tickets WHERE status='paid'")).rows[0].n, 1);
});

test('an empty service line is rejected, while a named custom charge is valid', async () => {
  await db.exec("INSERT INTO tickets(ticket_number,status,business_line) VALUES('T-CUSTOM','pending','car_wash')");
  await assert.rejects(db.exec("INSERT INTO ticket_items(ticket_id,service_name_snapshot) VALUES(1,'  ')"), /ticket_service_has_identity/);
  await db.exec("INSERT INTO ticket_items(ticket_id,service_name_snapshot) VALUES(1,'Cobro personalizado')");
  await db.exec("UPDATE tickets SET status='paid' WHERE id=1");
  assert.equal((await db.query('SELECT count(*)::int n FROM ticket_items')).rows[0].n, 1);
});

test('the last service cannot be removed from a paid car-wash ticket', async () => {
  await db.exec(`BEGIN;
    INSERT INTO tickets(ticket_number,status,business_line) VALUES('T-KEEP','pending','car_wash');
    INSERT INTO ticket_items(ticket_id,service_id) VALUES(1,1);
    UPDATE tickets SET status='paid' WHERE id=1;
    COMMIT;`);
  await assert.rejects(db.exec('DELETE FROM ticket_items WHERE ticket_id=1'), /sin servicio o concepto/);
  assert.equal((await db.query('SELECT count(*)::int n FROM ticket_items WHERE ticket_id=1')).rows[0].n, 1);
});

test('membership sale numbers keep their current multi-request flow', async () => {
  await db.exec("INSERT INTO tickets(ticket_number,status,business_line) VALUES('M-PLAN','paid','car_wash')");
  assert.equal((await db.query('SELECT count(*)::int n FROM tickets')).rows[0].n, 1);
});
