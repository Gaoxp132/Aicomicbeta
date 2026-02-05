import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * ✅ Bucket URL迁移工具
 * 当前使用的bucket: aicomic-awarelife
 * 从旧bucket (awarelife) 迁移URL到新bucket (aicomic-awarelife)
 */

/**
 * 预览需要更新的记录（不实际更新）
 */
export async function previewBucketUrlUpdates() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         👁️  预览URL更新（不实际修改数据）                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  
  try {
    // 创建Supabase客户端
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    const oldBucket = 'awarelife';
    const newBucket = 'aicomic-awarelife';
    
    console.log(`📦 从 ${oldBucket} 迁移到 ${newBucket}`);
    console.log('');
    
    // ✅ 修复：使用正确的主键和列名
    const tablesToCheck = [
      { table: 'storyboards', column: 'video_url', primaryKey: 'id' },
      { table: 'storyboards', column: 'image_url', primaryKey: 'id' },  // ✅ 修复：使用image_url而不是thumbnail_url
      { table: 'video_tasks', column: 'video_url', primaryKey: 'task_id' },  // ✅ 修复：video_tasks的主键是task_id
    ];
    
    const preview: any[] = [];
    let totalCount = 0;
    
    for (const { table, column, primaryKey } of tablesToCheck) {
      try {
        const { data: records, error } = await supabase
          .from(table)
          .select(`${primaryKey}, ${column}`)
          .like(column, `%${oldBucket}%`);
        
        if (error) {
          console.error(`[Preview] ❌ Query error for ${table}.${column}:`, error);
          preview.push({
            table,
            column,
            count: 0,
            error: error.message,
            samples: [],
          });
          continue;
        }
        
        const count = records?.length || 0;
        totalCount += count;
        
        console.log(`📊 ${table}.${column}: ${count} 条记录需要更新`);
        
        if (records && records.length > 0) {
          // 显示前3个示例
          console.log('   示例:');
          records.slice(0, 3).forEach((record: any, idx: number) => {
            const oldUrl = record[column];
            const newUrl = oldUrl?.replace(
              new RegExp(`https://${oldBucket}\\.oss-`, 'g'),
              `https://${newBucket}.oss-`
            );
            
            console.log(`   ${idx + 1}. ${primaryKey.toUpperCase()}: ${record[primaryKey]}`);
            console.log(`      旧: ${oldUrl?.substring(0, 80)}...`);
            console.log(`      新: ${newUrl?.substring(0, 80)}...`);
          });
          
          if (records.length > 3) {
            console.log(`   ... 还有 ${records.length - 3} 条记录`);
          }
        }
        
        console.log('');
        
        preview.push({
          table,
          column,
          count,
          samples: records?.slice(0, 3).map((r: any) => ({
            id: r[primaryKey],
            oldUrl: r[column],
            newUrl: r[column]?.replace(
              new RegExp(`https://${oldBucket}\\.oss-`, 'g'),
              `https://${newBucket}.oss-`
            ),
          })),
        });
      } catch (error: any) {
        console.error(`[Preview] ❌ Error checking ${table}.${column}:`, error);
        preview.push({
          table,
          column,
          count: 0,
          error: error.message || 'Unknown error',
          samples: [],
        });
      }
    }
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`📊 总计: ${totalCount} 条记录需要更新`);
    console.log('');
    console.log('💡 运行 POST /oss/update-bucket-urls 来执行实际更新');
    console.log('');
    
    return {
      success: true,
      totalCount,
      oldBucket,
      newBucket,
      preview,
    };
  } catch (error: any) {
    console.error('[Preview] ❌ Fatal error in previewBucketUrlUpdates:', error);
    throw error; // 重新抛出错误，让路由处理
  }
}

/**
 * 批量更新所有表中的bucket URL
 */
export async function updateAllBucketUrls() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         🔧 执行Bucket URL批量更新                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  
  const startTime = Date.now();
  
  try {
    // 创建Supabase客户端
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    const oldBucket = 'awarelife';
    const newBucket = 'aicomic-awarelife';
    
    console.log(`📦 从 ${oldBucket} 迁移到 ${newBucket}`);
    console.log('');
    
    // ✅ 修复：使用正确的主键和列名
    const tablesToUpdate = [
      { table: 'storyboards', column: 'video_url', primaryKey: 'id' },
      { table: 'storyboards', column: 'image_url', primaryKey: 'id' },  // ✅ 修复：使用image_url而不是thumbnail_url
      { table: 'video_tasks', column: 'video_url', primaryKey: 'task_id' },  // ✅ 修复：video_tasks的主键是task_id
    ];
    
    const results: any[] = [];
    let totalUpdated = 0;
    let successCount = 0;
    let failedCount = 0;
    
    for (const { table, column, primaryKey } of tablesToUpdate) {
      try {
        console.log(`🔍 处理 ${table}.${column}...`);
        
        // 1. 查询需要更新的记录
        const { data: records, error: selectError } = await supabase
          .from(table)
          .select(`${primaryKey}, ${column}`)
          .like(column, `%${oldBucket}%`);
        
        if (selectError) {
          console.error(`[Update] ❌ Query error for ${table}.${column}:`, selectError);
          results.push({
            table,
            column,
            success: false,
            error: selectError.message,
            updated: 0,
          });
          failedCount++;
          continue;
        }
        
        if (!records || records.length === 0) {
          console.log(`✅ ${table}.${column}: 无需更新`);
          results.push({
            table,
            column,
            success: true,
            updated: 0,
            message: '无需更新',
          });
          successCount++;
          continue;
        }
        
        console.log(`📝 ${table}.${column}: 找到 ${records.length} 条记录需要更新`);
        
        // 2. 逐条更新记录
        let updated = 0;
        let failed = 0;
        
        for (const record of records) {
          try {
            const oldUrl = record[column];
            if (!oldUrl) continue;
            
            // 替换URL
            const newUrl = oldUrl.replace(
              new RegExp(`https://${oldBucket}\\.oss-`, 'g'),
              `https://${newBucket}.oss-`
            );
            
            // 执行更新
            const { error: updateError } = await supabase
              .from(table)
              .update({ [column]: newUrl })
              .eq(primaryKey, record[primaryKey]);
            
            if (updateError) {
              console.error(`   ❌ 更新失败 ${primaryKey}=${record[primaryKey]}:`, updateError.message);
              failed++;
            } else {
              updated++;
              totalUpdated++;
            }
          } catch (error: any) {
            console.error(`   ❌ 处理记录时出错:`, error.message);
            failed++;
          }
        }
        
        console.log(`✅ ${table}.${column}: 成功更新 ${updated} 条，失败 ${failed} 条`);
        console.log('');
        
        results.push({
          table,
          column,
          success: true,
          updated,
          failed,
          total: records.length,
        });
        
        successCount++;
      } catch (error: any) {
        console.error(`[Update] ❌ Error updating ${table}.${column}:`, error);
        results.push({
          table,
          column,
          success: false,
          error: error.message || 'Unknown error',
          updated: 0,
        });
        failedCount++;
      }
    }
    
    const timeMs = Date.now() - startTime;
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`✅ 更新完成！`);
    console.log(`📊 总计更新: ${totalUpdated} 条记录`);
    console.log(`⏱️  耗时: ${timeMs}ms`);
    console.log(`✅ 成功: ${successCount} 个表/列`);
    console.log(`❌ 失败: ${failedCount} 个表/列`);
    console.log('');
    
    return {
      success: true,
      totalUpdated,
      successCount,
      failedCount,
      results,
      timeMs,
    };
  } catch (error: any) {
    const timeMs = Date.now() - startTime;
    console.error('[Update] ❌ Fatal error in updateAllBucketUrls:', error);
    
    return {
      success: false,
      error: error.message || 'Unknown error',
      totalUpdated: 0,
      successCount: 0,
      failedCount: 0,
      results: [],
      timeMs,
    };
  }
}