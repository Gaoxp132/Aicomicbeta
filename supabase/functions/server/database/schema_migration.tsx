import { supabase } from "./client.tsx";

/**
 * 确保storyboards表有task_id列
 * 使用直接SQL执行
 */
export async function ensureStoryboardsTaskIdColumn() {
  console.log('[Schema Migration] 🔧 Ensuring storyboards.task_id column exists...');
  
  try {
    // 直接执行SQL添加列（如果不存在）
    const sql = `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'storyboards' AND column_name = 'task_id'
        ) THEN
          ALTER TABLE storyboards ADD COLUMN task_id TEXT;
          RAISE NOTICE 'Column task_id added to storyboards table';
        ELSE
          RAISE NOTICE 'Column task_id already exists in storyboards table';
        END IF;
      END $$;
    `;
    
    // 使用postgres连接执行SQL
    const SUPABASE_DB_URL = Deno.env.get('SUPABASE_DB_URL');
    
    if (!SUPABASE_DB_URL) {
      console.error('[Schema Migration] ❌ SUPABASE_DB_URL not found');
      return false;
    }
    
    // 使用fetch调用Supabase的SQL API
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ query: sql }),
    });
    
    if (!response.ok) {
      console.error('[Schema Migration] ❌ SQL execution failed:', await response.text());
      return false;
    }
    
    console.log('[Schema Migration] ✅ task_id column check complete');
    return true;
    
  } catch (error) {
    console.error('[Schema Migration] ❌ Error:', error);
    return false;
  }
}

/**
 * 验证列是否存在
 */
export async function verifyTaskIdColumn() {
  try {
    console.log('[Schema Migration] 🔍 Verifying task_id column...');
    
    // 尝试查询task_id列
    const { data, error } = await supabase
      .from('series_storyboards')
      .select('id, task_id')
      .limit(1);
    
    if (error) {
      console.error('[Schema Migration] ❌ task_id column verification failed:', error);
      return false;
    }
    
    console.log('[Schema Migration] ✅ task_id column verified');
    return true;
    
  } catch (error) {
    console.error('[Schema Migration] ❌ Verification error:', error);
    return false;
  }
}