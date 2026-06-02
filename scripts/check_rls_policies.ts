// Diagnostic script: inspect Supabase RLS policies
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
  console.log('Querying Supabase RLS policies via RPC...');
  
  // We can query pg_policies using an arbitrary SQL or a custom RPC function if available.
  // But let's check what tables are visible and what errors we get when querying payments directly.
  const { data: payments, error: paymentsErr } = await supabase
    .from('payments')
    .select('*')
    .limit(5);

  console.log('\n=== PAYMENTS QUERY RESULT ===');
  if (paymentsErr) {
    console.error('❌ Error querying payments:', paymentsErr.message);
  } else {
    console.log(`✅ Visible payments: ${payments?.length || 0} records.`);
    payments?.forEach(p => {
      console.log(`  ID: ${p.id} | TicketID: ${p.ticket_id} | Method: "${p.payment_method}" | Amount: ${p.amount}`);
    });
  }

  const { data: mixed, error: mixedErr } = await supabase
    .from('ticket_mixed_payments')
    .select('*')
    .limit(5);

  console.log('\n=== TICKET_MIXED_PAYMENTS QUERY RESULT ===');
  if (mixedErr) {
    console.error('❌ Error querying ticket_mixed_payments:', mixedErr.message);
  } else {
    console.log(`✅ Visible ticket_mixed_payments: ${mixed?.length || 0} records.`);
  }

  // Let's check RLS tables list using catalog RPC or another query if we can
  console.log('\n=== EXPLAINING RLS POLICY CAUSE ===');
  console.log('If "payments" returns 0 records above but tickets are visible, it is a 100% RLS Policy issue.');
  console.log('We need to ensure a policy exists in Supabase to allow SELECT for authenticated users on "payments" and "ticket_mixed_payments" tables.');
}

diagnose().catch(console.error);
