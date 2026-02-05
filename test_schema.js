// 临时测试脚本 - 获取数据库schema
const url = 'https://cjjbxfzwjhnuwkqsntop.supabase.co/functions/v1/make-server-fc31472c/schema/inspect';
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqamJ4Znp3amhudXdrcXNudG9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzc5NjQyNzAsImV4cCI6MjA1MzU0MDI3MH0.tvwDfvE2EQ9xpjrvfkWqNMNL_4RiAuA3M2DZKEuWPcw';

fetch(url, {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
.then(r => r.json())
.then(data => {
  console.log('📊 Database Schema:');
  console.log(JSON.stringify(data, null, 2));
})
.catch(err => console.error('❌ Error:', err));
