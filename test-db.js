const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://wjyftbudktqqxuxvnjpe.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqeWZ0YnVka3RxcXh1eHZuanBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MDQzMjEsImV4cCI6MjA5MTM4MDMyMX0.v_IdykrTK1_5AW6vJSTcxTv41UN8x73ztjOEUhegbmg';
const supabase = createClient(supabaseUrl, supabaseKey);
async function test() {
  const { data, error } = await supabase.from('expenses').select('*').limit(1);
  console.log(data, error);
}
test();
