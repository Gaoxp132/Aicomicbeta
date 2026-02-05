/**
 * 数据库清理工具 - 删除不再使用的表
 * 
 * 保留的表（正在使用）:
 * - users, comments, likes, shares, viewing_history
 * - video_tasks, series
 * - series_episodes, series_chapters, series_storyboards, series_characters
 * - works
 * - kv_store_fc31472c (系统默认KV存储)
 * 
 * 删除的表（不再使用）:
 * - kv_store_00b75f32, kv_store_960d4d32 (旧KV存储)
 * - episodes, characters, storyboards (错误创建的表，应使用series_前缀版本)
 * - works_refactored (重构失败，继续使用works表)
 */

import { Hono } from "npm:hono";
import { createClient } from "jsr:@supabase/supabase-js@2";

const app = new Hono();
const PREFIX = '/make-server-fc31472c';

// 创建Supabase客户端
function getSupabaseClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
}

// 使用pg连接执行SQL
async function executeSQL(sql: string) {
  const dbUrl = Deno.env.get('SUPABASE_DB_URL');
  if (!dbUrl) {
    throw new Error('SUPABASE_DB_URL environment variable not set');
  }

  // 使用Deno的PostgreSQL驱动
  const { Client } = await import("https://deno.land/x/postgres@v0.17.0/mod.ts");
  const client = new Client(dbUrl);
  
  try {
    await client.connect();
    const result = await client.queryObject(sql);
    return result;
  } finally {
    await client.end();
  }
}

/**
 * 检查数据库表状态
 */
app.get(`${PREFIX}/database/cleanup/status`, async (c) => {
  try {
    // 查询所有表
    const result = await executeSQL(`
      SELECT 
        table_name,
        pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as size,
        (SELECT count(*) FROM information_schema.columns WHERE table_name = t.table_name AND table_schema = 'public') as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    // 定义正在使用的表
    const activeTables = [
      'users', 'comments', 'likes', 'shares', 'viewing_history',
      'video_tasks', 'series',
      'series_episodes', 'series_chapters', 'series_storyboards', 'series_characters',
      'works',
      'kv_store_fc31472c'
    ];

    // 定义需要删除的表
    const deprecatedTables = [
      'kv_store_00b75f32',
      'kv_store_960d4d32',
      'episodes',
      'characters',
      'storyboards',
      'works_refactored'
    ];

    const status = {
      activeTables: [],
      deprecatedTables: [],
      unknownTables: []
    };

    for (const table of result.rows as any[]) {
      const tableName = table.table_name;
      
      if (activeTables.includes(tableName)) {
        status.activeTables.push(table);
      } else if (deprecatedTables.includes(tableName)) {
        status.deprecatedTables.push(table);
      } else {
        status.unknownTables.push(table);
      }
    }

    return c.json({
      success: true,
      summary: {
        active: status.activeTables.length,
        deprecated: status.deprecatedTables.length,
        unknown: status.unknownTables.length
      },
      tables: status
    });

  } catch (error: any) {
    console.error('[CleanupStatus] Error:', error);
    return c.json({ error: '查询失败', message: error.message }, 500);
  }
});

/**
 * 获取表的详细信息
 */
app.get(`${PREFIX}/database/cleanup/table/:tableName/info`, async (c) => {
  try {
    const tableName = c.req.param('tableName');

    // 获取表结构
    const columnsResult = await executeSQL(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = '${tableName}' AND table_schema = 'public'
      ORDER BY ordinal_position;
    `);

    // 获取行数
    const countResult = await executeSQL(`SELECT count(*) as row_count FROM "${tableName}";`);

    // 获取表大小
    const sizeResult = await executeSQL(`
      SELECT pg_size_pretty(pg_total_relation_size('${tableName}')) as size;
    `);

    return c.json({
      success: true,
      tableName,
      rowCount: (countResult.rows[0] as any)?.row_count || 0,
      size: (sizeResult.rows[0] as any)?.size || 'Unknown',
      columns: columnsResult.rows || []
    });

  } catch (error: any) {
    console.error('[TableInfo] Error:', error);
    return c.json({ error: '获取表信息失败', message: error.message }, 500);
  }
});

/**
 * 删除单个不再使用的表
 */
app.delete(`${PREFIX}/database/cleanup/table/:tableName`, async (c) => {
  try {
    const tableName = c.req.param('tableName');

    // 安全检查：只允许删除指定的废弃表
    const allowedTables = [
      'kv_store_00b75f32',
      'kv_store_960d4d32',
      'episodes',
      'characters',
      'storyboards',
      'works_refactored'
    ];

    if (!allowedTables.includes(tableName)) {
      return c.json({ 
        error: '不允许删除此表', 
        message: `表 "${tableName}" 不在允许删除的列表中`,
        allowedTables 
      }, 403);
    }

    // 检查表是否存在
    const checkResult = await executeSQL(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = '${tableName}'
      ) as exists;
    `);

    if (!(checkResult.rows[0] as any)?.exists) {
      return c.json({ 
        error: '表不存在', 
        message: `表 "${tableName}" 在数据库中不存在` 
      }, 404);
    }

    // 获取表的行数
    const countResult = await executeSQL(`SELECT count(*) as row_count FROM "${tableName}";`);
    const rowCount = (countResult.rows[0] as any)?.row_count || 0;

    // 删除表
    await executeSQL(`DROP TABLE IF EXISTS "${tableName}" CASCADE;`);

    console.log(`[CleanupTable] ✅ Dropped table: ${tableName} (${rowCount} rows)`);

    return c.json({
      success: true,
      message: `成功删除表 "${tableName}"`,
      tableName,
      rowsDeleted: rowCount
    });

  } catch (error: any) {
    console.error('[CleanupTable] Error:', error);
    return c.json({ error: '删除表失败', message: error.message }, 500);
  }
});

/**
 * 批量删除所有废弃的表
 */
app.post(`${PREFIX}/database/cleanup/all`, async (c) => {
  try {
    const deprecatedTables = [
      'kv_store_00b75f32',
      'kv_store_960d4d32',
      'episodes',
      'characters',
      'storyboards',
      'works_refactored'
    ];

    const results = {
      success: [],
      failed: [],
      notFound: []
    };

    for (const tableName of deprecatedTables) {
      try {
        // 检查表是否存在
        const checkResult = await executeSQL(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = '${tableName}'
          ) as exists;
        `);

        if (!(checkResult.rows[0] as any)?.exists) {
          results.notFound.push(tableName);
          console.log(`[CleanupAll] ⚠️ Table not found: ${tableName}`);
          continue;
        }

        // 获取行数
        const countResult = await executeSQL(`SELECT count(*) as row_count FROM "${tableName}";`);
        const rowCount = (countResult.rows[0] as any)?.row_count || 0;

        // 删除表
        await executeSQL(`DROP TABLE IF EXISTS "${tableName}" CASCADE;`);

        results.success.push({ tableName, rowsDeleted: rowCount });
        console.log(`[CleanupAll] ✅ Dropped table: ${tableName} (${rowCount} rows)`);

      } catch (error: any) {
        results.failed.push({ tableName, error: error.message });
        console.error(`[CleanupAll] ❌ Error dropping ${tableName}:`, error);
      }
    }

    return c.json({
      success: true,
      summary: {
        totalTables: deprecatedTables.length,
        deleted: results.success.length,
        failed: results.failed.length,
        notFound: results.notFound.length
      },
      results
    });

  } catch (error: any) {
    console.error('[CleanupAll] Error:', error);
    return c.json({ error: '批量删除失败', message: error.message }, 500);
  }
});

console.log('[database_cleanup.tsx] ✅ Database cleanup routes loaded');

export default app;