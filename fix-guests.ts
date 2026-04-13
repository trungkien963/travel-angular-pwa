import { createClient } from '@supabase/supabase-js';
import { environment } from './src/environments/environment';
const supabase = createClient(environment.supabaseUrl, environment.supabaseKey);

async function fix() {
  const { data: trips } = await supabase.from('trips').select('*');
  for (const t of trips || []) {
    let changed = false;
    const newMembers = t.members.map((m: any) => {
      if (m.id && m.id.startsWith('guest_')) {
        changed = true;
        const ts = m.id.replace('guest_', '');
        return { ...m, id: '00000000-0000-0000-0000-' + ts.padStart(12, '0') };
      }
      return m;
    });
    if (changed) {
      console.log('Fixing trip', t.id);
      await supabase.from('trips').update({ members: newMembers }).eq('id', t.id);
    }
  }
}
fix();
