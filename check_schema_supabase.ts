import { createClient } from '@supabase/supabase-js';

// 创建Supabase客户端
const supabase = createClient(
  'https://cjjbxfzwjhnuwkqsntop.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqamJ4Znp3amhudXdrcXNudG9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzc5NjQyNzAsImV4cCI6MjA1MzU0MDI3MH0.tvwDfvE2EQ9xpjrvfkWqNMNL_4RiAuA3M2DZKEuWPcw'
);

// 调用schema检查Edge Function
async function checkDatabaseSchema() {
  console.log('📊 Fetching database schema...');
  
  try {
    const { data, error } = await supabase.functions.invoke('make-server-fc31472c/schema/inspect', {
      method: 'GET'
    });
    
    if (error) {
      console.error('❌ Error:', error);
      return;
    }
    
    console.log('✅ Database Schema:');
    console.log(JSON.stringify(data, null, 2));
    
  } catch (err) {
    console.error('❌ Failed:', err);
  }
}

// 执行
checkDatabaseSchema();
