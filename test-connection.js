const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://dwbfmphghmquxigmczcc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3YmZtcGhnaG1xdXhpZ21jemNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4NDMzMzIsImV4cCI6MjA4NjQxOTMzMn0.KvBS_ZGY-2JzO9q3AOV5Mb-4S7Bk8rMLZJokRiU5Q3U';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log('Probando conexión a:', supabaseUrl);
  try {
    const { data, error } = await supabase.from('customer_loyalty_status').select('*').limit(1);
    if (error) {
      console.error('Error de Supabase:', error.message);
    } else {
      console.log('¡CONEXIÓN EXITOSA! Datos recibidos:', data);
    }
  } catch (err) {
    console.error('Error de Red/Fetch:', err.message);
  }
}

test();
