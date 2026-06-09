// Inspect last 20 records
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const envContent = readFileSync('.env', 'utf-8');
const envVars: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^(\w+)=(.*)$/);
  if (match) envVars[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
});

const supabaseUrl = envVars['VITE_SUPABASE_URL'];
const supabaseKey = envVars['VITE_SUPABASE_PUBLISHABLE_KEY'] || envVars['VITE_SUPABASE_ANON_KEY'];
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function diagnose() {
  console.log(`Checking last 20 tickets in the database...`);

  // Fetch tickets
  const { data: tickets, error: ticketsErr } = await supabase
    .from('tickets')
    .select('id, ticket_number, total, status, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  if (ticketsErr) {
    console.error('Error fetching tickets:', ticketsErr.message);
    return;
  }

  console.log(`\n=== LAST 20 TICKETS CREATED (${tickets?.length || 0}) ===`);
  tickets?.forEach(t => {
    console.log(`TicketID: ${t.id} | No: ${t.ticket_number} | Total: C$${t.total} | Status: ${t.status} | CreatedAt: ${t.created_at}`);
  });

  if (!tickets || tickets.length === 0) {
    console.log('No tickets found at all.');
    return;
  }

  const ticketIds = tickets.map(t => t.id);

  // Fetch payments
  const { data: payments, error: paymentsErr } = await supabase
    .from('payments')
    .select('id, ticket_id, payment_method, amount, currency, created_at')
    .in('ticket_id', ticketIds);

  if (paymentsErr) {
    console.error('Error fetching payments:', paymentsErr.message);
  } else {
    console.log(`\n=== PAYMENTS FOR THESE TICKETS (${payments?.length || 0}) ===`);
    payments?.forEach(p => {
      console.log(`PayID: ${p.id} | TicketID: ${p.ticket_id} | Method: "${p.payment_method}" | Amount: ${p.amount} | Currency: ${p.currency} | CreatedAt: ${p.created_at}`);
    });
  }

  // Fetch ticket_mixed_payments
  const { data: mixed, error: mixedErr } = await supabase
    .from('ticket_mixed_payments')
    .select('*')
    .in('ticket_id', ticketIds);

  if (mixedErr) {
    console.error('Error fetching ticket_mixed_payments:', mixedErr.message);
  } else {
    console.log(`\n=== TICKET MIXED PAYMENTS FOR THESE TICKETS (${mixed?.length || 0}) ===`);
    mixed?.forEach(m => {
      console.log(`MixedID: ${m.id} | TicketID: ${m.ticket_id} | Method: "${m.method}" | Amount: ${m.amount} | AppliedNIO: ${m.applied_nio} | ChangeNIO: ${m.change_nio} | CreatedAt: ${m.created_at}`);
    });
  }
}

diagnose().catch(console.error);
