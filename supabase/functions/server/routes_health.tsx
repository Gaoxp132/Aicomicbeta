/**
 * 健康检查路由
 * 
 * 提供数据库连接和表结构检查
 */

import { Hono } from 'npm:hono@4';
import { supabase } from './database/client.tsx';

const health = new Hono();

/**
 * 数据库连接健康检查
 */
health.get('/database', async (c) => {
  try {
    console.log('[Health] 检查数据库连接...');
    
    // 执行一个简单的查询测试连接
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1)
      .maybeSingle();
    
    if (error) {
      console.error('[Health] 数据库查询失败:', error);
      
      return c.json({
        success: false,
        message: '数据库查询失败',
        error: error.message,
      }, 500);
    }
    
    console.log('[Health] ✅ 数据库连接正常');
    
    return c.json({
      success: true,
      message: '数据库连接正常',
      timestamp: new Date().toISOString(),
      details: {
        canQuery: true,
      },
    });
  } catch (error: any) {
    console.error('[Health] 数据库健康检查异常:', error);
    
    return c.json({
      success: false,
      message: '数据库连接异常',
      error: error.message,
    }, 500);
  }
});

/**
 * 检查必需的表是否存在
 */
health.get('/tables', async (c) => {
  try {
    console.log('[Health] 检查数据库表结构...');
    
    // 查询所有表
    const { data, error } = await supabase.rpc('get_public_tables');
    
    if (error) {
      // 如果函数不存在，使用备用方法
      console.warn('[Health] RPC函数不存在，使用备用方法');
      
      // 尝试直接查询每个表
      const tables = [
        'users',
        'works',
        'video_tasks',
        'likes',
        'comments',
        'series',
        'series_episodes',
        'series_storyboards',
        'series_characters',
        'series_chapters',
      ];
      
      const existingTables: string[] = [];
      
      for (const table of tables) {
        try {
          const { error: queryError } = await supabase
            .from(table)
            .select('count')
            .limit(1)
            .maybeSingle();
          
          if (!queryError) {
            existingTables.push(table);
          }
        } catch (e) {
          // 表不存在，跳过
        }
      }
      
      return c.json({
        success: true,
        message: `找到 ${existingTables.length} 个表`,
        tables: existingTables,
        timestamp: new Date().toISOString(),
      });
    }
    
    console.log('[Health] ✅ 表检查完成');
    
    return c.json({
      success: true,
      message: '表检查完成',
      tables: data || [],
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[Health] 表检查异常:', error);
    
    return c.json({
      success: false,
      message: '表检查失败',
      error: error.message,
    }, 500);
  }
});

/**
 * 检查索引状态
 */
health.get('/indexes', async (c) => {
  try {
    console.log('[Health] 检查索引状态...');
    
    // 查询索引数量
    const { data, error } = await supabase.rpc('count_indexes');
    
    if (error) {
      console.warn('[Health] 无法获取索引信息:', error.message);
      
      return c.json({
        success: true,
        message: '无法获取索引详细信息',
        warning: '请在Supabase Dashboard中手动检查',
        timestamp: new Date().toISOString(),
      });
    }
    
    console.log('[Health] ✅ 索引检查完成');
    
    return c.json({
      success: true,
      message: '索引检查完成',
      indexCount: data || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[Health] 索引检查异常:', error);
    
    return c.json({
      success: false,
      message: '索引检查失败',
      error: error.message,
    }, 500);
  }
});

/**
 * 完整健康检查（所有检查项）
 */
health.get('/full', async (c) => {
  try {
    console.log('[Health] 执行完整健康检查...');
    
    const results = {
      database: false,
      tables: false,
      timestamp: new Date().toISOString(),
      details: {} as any,
    };
    
    // 检查数据库连接
    try {
      const { error: dbError } = await supabase
        .from('users')
        .select('count')
        .limit(1)
        .maybeSingle();
      
      results.database = !dbError;
      if (dbError) {
        results.details.databaseError = dbError.message;
      }
    } catch (e: any) {
      results.details.databaseError = e.message;
    }
    
    // 检查表
    const requiredTables = [
      'users',
      'works',
      'video_tasks',
      'likes',
      'comments',
      'series',
    ];
    
    const existingTables: string[] = [];
    const missingTables: string[] = [];
    
    for (const table of requiredTables) {
      try {
        const { error: tableError } = await supabase
          .from(table)
          .select('count')
          .limit(1)
          .maybeSingle();
        
        if (!tableError) {
          existingTables.push(table);
        } else {
          missingTables.push(table);
        }
      } catch (e) {
        missingTables.push(table);
      }
    }
    
    results.tables = missingTables.length === 0;
    results.details.existingTables = existingTables;
    results.details.missingTables = missingTables;
    
    const isHealthy = results.database && results.tables;
    
    console.log('[Health] ✅ 完整健康检查完成');
    console.log('[Health] 数据库连接:', results.database ? '✅' : '❌');
    console.log('[Health] 表结构:', results.tables ? '✅' : '❌');
    
    return c.json({
      success: isHealthy,
      message: isHealthy ? '所有检查通过' : '部分检查失败',
      ...results,
    });
  } catch (error: any) {
    console.error('[Health] 完整健康检查异常:', error);
    
    return c.json({
      success: false,
      message: '健康检查失败',
      error: error.message,
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

/**
 * 基础心跳检查
 */
health.get('/ping', async (c) => {
  return c.json({
    success: true,
    message: 'pong',
    timestamp: new Date().toISOString(),
    version: '4.0.0',
  });
});

export { health };