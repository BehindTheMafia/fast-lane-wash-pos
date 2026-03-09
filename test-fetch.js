import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dwbfmphghmquxigmczcc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3YmZtcGhnaG1xdXhpZ21jemNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4NDMzMzIsImV4cCI6MjA4NjQxOTMzMn0.KvBS_ZGY-2JzO9q3AOV5Mb-4S7Bk8rMLZJokRiU5Q3U';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  console.log("Fetching tickets for 08/03 and 09/03...");
  const { data, error } = await supabase
    .from('tickets')
    .select('ticket_number, total, created_at, vehicle_plate, payments(amount, currency)')
    .order('created_at', { ascending: true });

  if (error) {
    console.error("Error fetching tickets:", error);
    return;
  }

  // Filter manually for safety
  const filtered = data.filter(t => t.created_at.startsWith('2026-03-08') || t.created_at.startsWith('2026-03-09'));

  console.log(`Found ${filtered.length} tickets for March 8/9.`);
  filtered.forEach(t => {
    const p = t.payments && t.payments[0];
    console.log(`[${t.created_at}] Ticket: ${t.ticket_number} | Plate: ${t.vehicle_plate} | Total: ${t.total} | Payment: ${p ? p.amount + ' ' + p.currency : 'NONE'}`);
  });
}

run();
