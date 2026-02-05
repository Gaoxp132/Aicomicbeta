/**
 * 批量修复视频合并 - v4.2.4
 * 将所有使用M3U8的剧集重新合并为播放列表JSON格式
 * 
 * 使用方法:
 * curl -X POST https://{projectId}.supabase.co/functions/v1/make-server-fc31472c/migrations/fix-video-merger \
 *   -H "Authorization: Bearer {publicAnonKey}"
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
);

/**
 * 批量修复所有剧集的视频合并
 */
export async function batchFixVideoMerger() {
  console.log('[Video Merger Fix] 🚀 Starting batch video merger fix...');
  
  try {
    // 步骤1: 查询所有需要修复的剧集
    // 包括：使用M3U8的剧集 或 merge_status为completed但没有merged_video_url的剧集
    const { data: episodes, error: fetchError } = await supabase
      .from('episodes')
      .select('id, episode_number, series_id, merged_video_url, merge_status, status')
      .or('merged_video_url.like.%.m3u8%,and(merge_status.eq.completed,merged_video_url.is.null)')
      .order('series_id', { ascending: true })
      .order('episode_number', { ascending: true });
    
    if (fetchError) {
      console.error('[Video Merger Fix] ❌ Failed to fetch episodes:', fetchError);
      throw new Error(`Failed to fetch episodes: ${fetchError.message}`);
    }
    
    if (!episodes || episodes.length === 0) {
      console.log('[Video Merger Fix] ✅ No episodes need fixing!');
      return {
        success: true,
        message: 'No episodes need fixing',
        totalEpisodes: 0,
        fixedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        results: []
      };
    }
    
    console.log(`[Video Merger Fix] 📋 Found ${episodes.length} episodes to fix`);
    console.log(`[Video Merger Fix] Episodes:`, episodes.map(e => `${e.id} (Series: ${e.series_id}, Episode: ${e.episode_number})`));
    
    // 步骤2: 分组按系列处理
    const episodesBySeries = new Map<string, typeof episodes>();
    for (const ep of episodes) {
      const seriesEps = episodesBySeries.get(ep.series_id) || [];
      seriesEps.push(ep);
      episodesBySeries.set(ep.series_id, seriesEps);
    }
    
    console.log(`[Video Merger Fix] 📊 Processing ${episodesBySeries.size} series`);
    
    // 步骤3: 逐个处理每个剧集
    let fixedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const results: Array<{
      episodeId: string;
      episodeNumber: number;
      seriesId: string;
      status: 'fixed' | 'failed' | 'skipped';
      message: string;
      error?: string;
    }> = [];
    
    for (const [seriesId, seriesEpisodes] of episodesBySeries) {
      console.log(`\n[Video Merger Fix] 📺 Processing series: ${seriesId} (${seriesEpisodes.length} episodes)`);
      
      for (const episode of seriesEpisodes) {
        console.log(`\n[Video Merger Fix] 🎬 Processing episode ${episode.episode_number} (${episode.id})...`);
        
        try {
          // 获取该剧集的所有分镜
          const { data: storyboards, error: sbError } = await supabase
            .from('series_storyboards')
            .select('id, scene_number, video_url, duration, description')
            .eq('episode_id', episode.id)
            .eq('status', 'completed')
            .not('video_url', 'is', null)
            .order('scene_number', { ascending: true });
          
          if (sbError) {
            console.error(`[Video Merger Fix] ❌ Failed to fetch storyboards:`, sbError);
            failedCount++;
            results.push({
              episodeId: episode.id,
              episodeNumber: episode.episode_number,
              seriesId,
              status: 'failed',
              message: 'Failed to fetch storyboards',
              error: sbError.message
            });
            continue;
          }
          
          if (!storyboards || storyboards.length === 0) {
            console.log(`[Video Merger Fix] ⏭️ Skipping: No completed storyboards with videos`);
            skippedCount++;
            results.push({
              episodeId: episode.id,
              episodeNumber: episode.episode_number,
              seriesId,
              status: 'skipped',
              message: 'No completed storyboards with videos'
            });
            continue;
          }
          
          console.log(`[Video Merger Fix] 📹 Found ${storyboards.length} storyboards`);
          
          // 步骤4: 生成播放列表JSON
          const videoData = storyboards.map((sb, index) => {
            // 移除签名参数，使用永久URL
            let permanentUrl = sb.video_url;
            try {
              if (sb.video_url.includes('aliyuncs.com')) {
                const urlObj = new URL(sb.video_url);
                permanentUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
              }
            } catch (e) {
              // 使用原URL
            }
            
            return {
              url: permanentUrl,
              duration: sb.duration || 10,
              title: sb.description || `场景 ${sb.scene_number}`,
              sceneNumber: sb.scene_number
            };
          });
          
          const playlistData = {
            type: 'playlist',
            version: '1.0',
            episodeId: episode.id,
            totalVideos: videoData.length,
            totalDuration: videoData.reduce((sum, v) => sum + v.duration, 0),
            videos: videoData,
            createdAt: new Date().toISOString()
          };
          
          const playlistJson = JSON.stringify(playlistData);
          
          console.log(`[Video Merger Fix] ✅ Generated playlist JSON:`);
          console.log(`[Video Merger Fix]   - Total videos: ${playlistData.totalVideos}`);
          console.log(`[Video Merger Fix]   - Total duration: ${playlistData.totalDuration}s`);
          console.log(`[Video Merger Fix]   - JSON size: ${playlistJson.length} chars`);
          
          // 步骤5: 更新剧集
          const { error: updateError } = await supabase
            .from('episodes')
            .update({
              merged_video_url: playlistJson,
              merge_status: 'completed',
              total_duration: playlistData.totalDuration,
              updated_at: new Date().toISOString()
            })
            .eq('id', episode.id);
          
          if (updateError) {
            console.error(`[Video Merger Fix] ❌ Failed to update episode:`, updateError);
            failedCount++;
            results.push({
              episodeId: episode.id,
              episodeNumber: episode.episode_number,
              seriesId,
              status: 'failed',
              message: 'Failed to update episode',
              error: updateError.message
            });
            continue;
          }
          
          console.log(`[Video Merger Fix] ✅ Episode ${episode.episode_number} fixed successfully!`);
          fixedCount++;
          results.push({
            episodeId: episode.id,
            episodeNumber: episode.episode_number,
            seriesId,
            status: 'fixed',
            message: `Successfully converted to playlist JSON (${playlistData.totalVideos} videos)`
          });
          
          // 等待一下，避免数据库压力
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error: any) {
          console.error(`[Video Merger Fix] ❌ Error processing episode ${episode.episode_number}:`, error);
          failedCount++;
          results.push({
            episodeId: episode.id,
            episodeNumber: episode.episode_number,
            seriesId,
            status: 'failed',
            message: 'Unexpected error',
            error: error.message
          });
        }
      }
    }
    
    // 步骤6: 返回汇总结果
    console.log('\n[Video Merger Fix] 🎉 Batch fix completed!');
    console.log(`[Video Merger Fix] 📊 Summary:`);
    console.log(`[Video Merger Fix]   - Total episodes: ${episodes.length}`);
    console.log(`[Video Merger Fix]   - Fixed: ${fixedCount}`);
    console.log(`[Video Merger Fix]   - Failed: ${failedCount}`);
    console.log(`[Video Merger Fix]   - Skipped: ${skippedCount}`);
    
    return {
      success: true,
      message: `Batch fix completed: ${fixedCount} fixed, ${failedCount} failed, ${skippedCount} skipped`,
      totalEpisodes: episodes.length,
      fixedCount,
      failedCount,
      skippedCount,
      results
    };
    
  } catch (error: any) {
    console.error('[Video Merger Fix] ❌ Batch fix failed:', error);
    return {
      success: false,
      error: error.message,
      totalEpisodes: 0,
      fixedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      results: []
    };
  }
}

/**
 * 仅查询需要修复的剧集（不执行修复）
 */
export async function checkEpisodesNeedingFix() {
  console.log('[Video Merger Fix] 🔍 Checking episodes that need fixing...');
  
  try {
    // 查询使用M3U8的剧集
    const { data: m3u8Episodes, error: m3u8Error } = await supabase
      .from('episodes')
      .select('id, episode_number, series_id, merged_video_url, merge_status')
      .like('merged_video_url', '%.m3u8%')
      .order('series_id', { ascending: true })
      .order('episode_number', { ascending: true });
    
    if (m3u8Error) {
      throw new Error(`Failed to fetch M3U8 episodes: ${m3u8Error.message}`);
    }
    
    // 查询merge_status为completed但没有merged_video_url的剧集
    const { data: missingUrlEpisodes, error: missingError } = await supabase
      .from('episodes')
      .select('id, episode_number, series_id, merged_video_url, merge_status')
      .eq('merge_status', 'completed')
      .is('merged_video_url', null)
      .order('series_id', { ascending: true })
      .order('episode_number', { ascending: true });
    
    if (missingError) {
      throw new Error(`Failed to fetch missing URL episodes: ${missingError.message}`);
    }
    
    const m3u8Count = m3u8Episodes?.length || 0;
    const missingCount = missingUrlEpisodes?.length || 0;
    const totalCount = m3u8Count + missingCount;
    
    console.log('[Video Merger Fix] 📊 Check results:');
    console.log(`[Video Merger Fix]   - Episodes using M3U8: ${m3u8Count}`);
    console.log(`[Video Merger Fix]   - Episodes with missing URL: ${missingCount}`);
    console.log(`[Video Merger Fix]   - Total need fixing: ${totalCount}`);
    
    return {
      success: true,
      needsFix: totalCount > 0,
      totalCount,
      m3u8Count,
      missingCount,
      m3u8Episodes: m3u8Episodes || [],
      missingUrlEpisodes: missingUrlEpisodes || []
    };
    
  } catch (error: any) {
    console.error('[Video Merger Fix] ❌ Check failed:', error);
    return {
      success: false,
      error: error.message,
      needsFix: false,
      totalCount: 0,
      m3u8Count: 0,
      missingCount: 0,
      m3u8Episodes: [],
      missingUrlEpisodes: []
    };
  }
}