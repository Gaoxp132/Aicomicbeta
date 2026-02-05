/**
 * 临时Schema检查工具
 * 用于读取数据库schema
 */

import type { Context } from "npm:hono";
import { supabase } from "../../database/client.tsx";

/**
 * 获取数据库schema信息
 * GET /make-server-fc31472c/schema/inspect
 */
export async function inspectSchema(c: Context) {
  try {
    console.log('[SchemaInspector] 🔍 Reading database schema...');
    
    // 查询所有表的列信息
    const { data, error } = await supabase
      .rpc('get_schema_info');
    
    if (error) {
      console.log('[SchemaInspector] ⚠️ RPC not available, using direct query...');
      
      // 备用方案：直接查询information_schema
      const query = `
        SELECT 
          table_name,
          column_name,
          data_type,
          character_maximum_length,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN (
            'series', 'series_episodes', 'series_characters', 
            'series_storyboards', 'users', 'video_tasks', 
            'works', 'likes', 'comments'
          )
        ORDER BY table_name, ordinal_position;
      `;
      
      // 使用REST API执行原始SQL查询
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey!,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });
      
      if (!response.ok) {
        // 最后的备用方案：使用Supabase客户端查询每个表
        console.log('[SchemaInspector] Using table introspection...');
        
        const tables = [
          'series', 'series_episodes', 'series_characters', 
          'series_storyboards', 'users', 'video_tasks', 
          'works', 'likes', 'comments'
        ];
        
        const schema: any = {};
        
        for (const tableName of tables) {
          try {
            const { data: sampleRow } = await supabase
              .from(tableName)
              .select('*')
              .limit(1)
              .single();
            
            if (sampleRow) {
              schema[tableName] = Object.keys(sampleRow).map(key => ({
                column_name: key,
                data_type: typeof sampleRow[key],
                sample_value: sampleRow[key],
              }));
            }
          } catch (err) {
            console.log(`[SchemaInspector] Could not read ${tableName}:`, err);
            schema[tableName] = { error: 'Could not read table' };
          }
        }
        
        return c.json({
          success: true,
          method: 'table_introspection',
          schema,
          timestamp: new Date().toISOString(),
        });
      }
      
      const sqlData = await response.json();
      return c.json({
        success: true,
        method: 'direct_sql',
        schema: sqlData,
        timestamp: new Date().toISOString(),
      });
    }
    
    return c.json({
      success: true,
      method: 'rpc',
      schema: data,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error: any) {
    console.error('[SchemaInspector] ❌ Error:', error);
    return c.json({
      success: false,
      error: error.message || 'Schema inspection failed',
    }, 500);
  }
}
