import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dwbfmphghmquxigmczcc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3YmZtcGhnaG1xdXhpZ21jemNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4NDMzMzIsImV4cCI6MjA4NjQxOTMzMn0.KvBS_ZGY-2JzO9q3AOV5Mb-4S7Bk8rMLZJokRiU5Q3U';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Sign in as a test user to simulate authenticated role
async function main() {
  // Try querying with anon key first
  console.log('--- ANON KEY QUERIES ---');
  
  const { data: t1, error: e1, count: c1 } = await supabase
    .from('tickets')
    .select('id, ticket_number, total, created_at, status', { count: 'exact' })
    .eq('status', 'paid')
    .order('created_at', { ascending: false })
    .limit(5);
  
  console.log(`Tickets: ${c1 ?? 'null'} total, error: ${e1?.message ?? 'none'}`);
  if (t1 && t1.length > 0) {
    t1.forEach(t => console.log(`  ${t.ticket_number} | C$${t.total} | ${t.created_at}`));
    
    // Now fetch payments for these ticket IDs
    const ids = t1.map(t => t.id);
    const { data: p1, error: pe1, count: pc1 } = await supabase
      .from('payments')
      .select('*', { count: 'exact' })
      .in('ticket_id', ids);
    
    console.log(`Payments for ${ids.length} tickets: ${pc1 ?? 'null'} total, error: ${pe1?.message ?? 'none'}`);
    if (p1 && p1.length > 0) {
      p1.forEach(p => console.log(`  ticket:${p.ticket_id} | ${p.payment_method} | ${p.amount} ${p.currency}`));
    } else {
      console.log('  ⚠️ NO PAYMENTS RETURNED - This is the bug!');
    }
  } else {
    console.log('  No paid tickets found.');
  }

  // Check RLS policies visibility
  console.log('\n--- CHECKING IF TABLES EXIST ---');
  for (const table of ['tickets', 'payments', 'ticket_items', 'ticket_mixed_payments', 'vehicle_types', 'services']) {
    const { error } = await supabase.from(table).select('id').limit(0);
    console.log(`  ${table}: ${error ? '❌ ' + error.message : '✅ accessible'}`);
  }
}

main();
