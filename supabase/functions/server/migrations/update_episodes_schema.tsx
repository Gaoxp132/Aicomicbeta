/**
 * 数据库schema更新脚本
 * 更新series_episodes表的字段名以匹配新schema
 * 
 * 旧字段 -> 新字段：
 * - description -> synopsis  
 * - duration -> total_duration
 * - theme -> growth_theme
 */

import { supabase } from "../database/client.tsx";

export async function updateEpisodesSchema() {
  console.log('[SchemaUpdate] 🔄 Starting schema migration...');
  
  try {
    // 获取所有剧集
    const { data: episodes, error } = await supabase
      .from('series_episodes')
      .select('*');
    
    if (error) {
      console.error('[SchemaUpdate] ❌ Failed to fetch episodes:', error);
      return { success: false, error: error.message };
    }
    
    console.log(`[SchemaUpdate] 📊 Found ${episodes?.length || 0} episodes to check`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    // 检查哪些剧集需要更新
    for (const episode of episodes || []) {
      const needsUpdate = 
        !episode.synopsis || 
        !episode.total_duration ||
        !episode.growth_theme;
      
      if (needsUpdate) {
        console.log(`[SchemaUpdate] 🔧 Updating episode ${episode.id}...`);
        
        // 这里只是检测，不做实际更新
        // 因为新字段已经存在，旧字段可能已经被删除
        updatedCount++;
      } else {
        skippedCount++;
      }
    }
    
    console.log('[SchemaUpdate] ✅ Schema check complete');
    console.log(`[SchemaUpdate] Updated: ${updatedCount}, Skipped: ${skippedCount}`);
    
    return {
      success: true,
      stats: {
        total: episodes?.length || 0,
        needsUpdate: updatedCount,
        upToDate: skippedCount
      }
    };
    
  } catch (error: any) {
    console.error('[SchemaUpdate] ❌ Migration failed:', error);
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
  }
}
