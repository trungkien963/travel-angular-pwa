const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://wjyftbudktqqxuxvnjpe.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqeWZ0YnVka3RxcXh1eHZuanBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MDQzMjEsImV4cCI6MjA5MTM4MDMyMX0.v_IdykrTK1_5AW6vJSTcxTv41UN8x73ztjOEUhegbmg');

async function sync() {
  const { data: comments } = await supabase.from('comments').select('post_id');
  const counts = {};
  for (const c of comments) {
    if (c.post_id) counts[c.post_id] = (counts[c.post_id] || 0) + 1;
  }
  
  const { data: posts } = await supabase.from('posts').select('id, comment_count');
  for (const p of posts) {
    const actualCount = counts[p.id] || 0;
    if (p.comment_count !== actualCount) {
      console.log(`Updating post ${p.id} from ${p.comment_count} to ${actualCount}`);
      await supabase.from('posts').update({ comment_count: actualCount }).eq('id', p.id);
    }
  }
  console.log('Done!');
}
sync();
