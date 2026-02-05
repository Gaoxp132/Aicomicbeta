/**
 * 视频合并处理器（播放列表JSON方案）
 * v4.2.4 FIX: 不再生成M3U8，改为使用播放列表JSON
 * 
 * 原因：M3U8需要TS切片文件，但我们只有完整的MP4视频
 * 解决：将视频URL列表存储为JSON，前端使用PlaylistVideoPlayer播放
 * 
 * CACHE BUSTER: v4.2.4_FORCE_REBUILD_005_2026-01-27
 * 
 * 🔥 EXPORTED FUNCTIONS (for verification):
 * - mergeEpisodeVideos
 * - mergeAllSeriesVideos
 */

import type { Context } from "npm:hono";

// 🔥 Module version for cache busting
export const VIDEO_MERGER_VERSION = 'v4.2.4_FORCE_REBUILD_005_2026-01-27';

console.log(`[Video Merger] 🔥 Module loaded: ${VIDEO_MERGER_VERSION}`);

/**
 * 创建合并视频（内部辅助函数）
 * 返回播放列表JSON字符串
 */
async function createMergedVideo(videoUrls: string[], episodeId: string): Promise<string> {
  console.log(`[Video Merger] 🎬 Creating playlist for episode: ${episodeId}`);
  console.log(`[Video Merger] 📹 Source videos (${videoUrls.length}):`, videoUrls.map(url => url.substring(0, 80) + '...'));
  
  try {
    // 导入OSS服务
    const ossService = await import('../../video/aliyun_oss.tsx');
    
    // 获取Supabase实例
    const supabase = (await import('jsr:@supabase/supabase-js@2')).createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );
    
    // 获取用户ID和分镜信息
    const { data: episode } = await supabase
      .from('series_episodes')
      .select('series_id')
      .eq('id', episodeId)
      .single();
    
    let userId: string | undefined;
    if (episode) {
      const { data: series } = await supabase
        .from('series')
        .select('user_phone')
        .eq('id', episode.series_id)
        .single();
      
      userId = series?.user_phone;
    }
    
    // 获取分镜信息（包含duration）
    const { data: storyboards } = await supabase
      .from('series_storyboards')
      .select('scene_number, description, duration, video_url')
      .eq('episode_id', episodeId)
      .order('scene_number', { ascending: true });
    
    console.log(`[Video Merger] 📋 Found ${storyboards?.length || 0} storyboards`);
    
    // 步骤1: 确保所有视频都在OSS中
    console.log(`[Video Merger] 🔄 Step 1: Ensuring all videos are in OSS...`);
    const ossVideoUrls: string[] = [];
    const videoData: Array<{
      url: string;
      duration: number;
      title: string;
      sceneNumber: number;
    }> = [];
    
    for (let i = 0; i < videoUrls.length; i++) {
      const videoUrl = videoUrls[i];
      const storyboard = storyboards?.[i];
      
      console.log(`[Video Merger] 📹 Processing video ${i + 1}/${videoUrls.length}...`);
      
      let permanentUrl = videoUrl;
      
      // 检查是否已在OSS中
      if (videoUrl.includes('aliyuncs.com')) {
        console.log(`[Video Merger]   ✅ Already in OSS`);
        
        // 移除签名参数，使用永久URL
        try {
          const urlObj = new URL(videoUrl);
          permanentUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
        } catch (e) {
          permanentUrl = videoUrl;
        }
      } else {
        // 需要转存到OSS
        console.log(`[Video Merger]   🔄 Transferring to OSS...`);
        
        try {
          const transferResult = await ossService.transferVideoToOSS(
            `${episodeId}-scene-${i + 1}`,
            videoUrl,
            userId
          );
          
          if (transferResult.success && transferResult.ossUrl) {
            try {
              const urlObj = new URL(transferResult.ossUrl);
              permanentUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
              console.log(`[Video Merger]   ✅ Transferred successfully`);
            } catch (e) {
              permanentUrl = transferResult.ossUrl;
            }
          } else {
            console.error(`[Video Merger]   ❌ Transfer failed: ${transferResult.error}`);
            // 使用原URL作为fallback
          }
        } catch (transferError: any) {
          console.error(`[Video Merger]   ❌ Transfer error:`, transferError.message);
          // 使用原URL作为fallback
        }
        
        // 等待一下，避免OSS限流
        if (i < videoUrls.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      ossVideoUrls.push(permanentUrl);
      videoData.push({
        url: permanentUrl,
        duration: storyboard?.duration || 10,
        title: storyboard?.description || `场景 ${storyboard?.scene_number || (i + 1)}`,
        sceneNumber: storyboard?.scene_number || (i + 1)
      });
    }
    
    console.log(`[Video Merger] ✅ Step 1 complete: All ${ossVideoUrls.length} videos processed`);
    
    // 步骤2: 生成播放列表JSON（而不是M3U8）
    console.log(`[Video Merger] 📝 Step 2: Creating playlist JSON...`);
    
    const playlistData = {
      type: 'playlist',
      version: '1.0',
      episodeId,
      totalVideos: videoData.length,
      totalDuration: videoData.reduce((sum, v) => sum + v.duration, 0),
      videos: videoData,
      createdAt: new Date().toISOString()
    };
    
    // 转换为JSON字符串
    const playlistJson = JSON.stringify(playlistData);
    
    console.log(`[Video Merger] ✅ Playlist JSON created:`);
    console.log(`[Video Merger]   - Total videos: ${playlistData.totalVideos}`);
    console.log(`[Video Merger]   - Total duration: ${playlistData.totalDuration}s`);
    console.log(`[Video Merger]   - JSON size: ${playlistJson.length} chars`);
    
    // 步骤3: 返回JSON字符串（存储在数据库中）
    console.log(`[Video Merger] ✅ Video merge complete! Using playlist JSON format.`);
    
    return playlistJson;
    
  } catch (error: any) {
    console.error(`[Video Merger] ⚠️ Failed to create playlist:`, error.message);
    console.log(`[Video Merger] 📌 Falling back to first video URL`);
    
    // 失败时回退到使用第一个视频URL
    if (videoUrls.length > 0) {
      console.log(`[Video Merger] 📹 Using first video as merged URL: ${videoUrls[0].substring(0, 80)}...`);
      return videoUrls[0];
    }
    
    throw new Error('No video URLs available');
  }
}

/**
 * 合并单个剧集的视频
 * POST /episodes/:id/merge-videos
 */
export async function mergeEpisodeVideos(c: Context) {
  try {
    const episodeId = c.req.param('id');
    
    if (!episodeId) {
      return c.json({
        success: false,
        error: 'Missing episode ID'
      }, 400);
    }

    console.log(`[mergeEpisodeVideos] 🎬 Starting video merge for episode: ${episodeId}`);

    // 获取Supabase实例
    const supabase = (await import('jsr:@supabase/supabase-js@2')).createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    // 获取剧集的所有分镜
    const { data: storyboards, error: storyboardError } = await supabase
      .from('series_storyboards')
      .select('*')
      .eq('episode_id', episodeId)
      .order('scene_number', { ascending: true });

    if (storyboardError) {
      throw new Error(`Failed to fetch storyboards: ${storyboardError.message}`);
    }

    if (!storyboards || storyboards.length === 0) {
      return c.json({
        success: false,
        error: 'No storyboards found for this episode'
      }, 404);
    }

    // 获取所有已生成的视频URL
    const videoUrls = storyboards
      .filter(sb => sb.video_url)
      .map(sb => sb.video_url);

    if (videoUrls.length === 0) {
      return c.json({
        success: false,
        error: 'No videos generated yet'
      }, 400);
    }

    console.log(`[mergeEpisodeVideos] 📹 Found ${videoUrls.length} videos to merge`);

    // 调用合并函数
    const mergedVideoUrl = await createMergedVideo(videoUrls, episodeId);

    // 更新剧集的merged_video_url
    const { error: updateError } = await supabase
      .from('series_episodes')
      .update({ merged_video_url: mergedVideoUrl })
      .eq('id', episodeId);

    if (updateError) {
      throw new Error(`Failed to update episode: ${updateError.message}`);
    }

    console.log(`[mergeEpisodeVideos] ✅ Video merge completed for episode: ${episodeId}`);

    return c.json({
      success: true,
      episodeId,
      mergedVideoUrl,
      totalVideos: videoUrls.length
    });

  } catch (error: any) {
    console.error(`[mergeEpisodeVideos] ❌ Error:`, error.message);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
}

/**
 * 合并系列中所有剧集的视频
 * POST /series/:id/merge-all-videos
 */
export async function mergeAllSeriesVideos(c: Context) {
  try {
    const seriesId = c.req.param('id');
    
    if (!seriesId) {
      return c.json({
        success: false,
        error: 'Missing series ID'
      }, 400);
    }

    console.log(`[mergeAllSeriesVideos] 🎬 Starting video merge for all episodes in series: ${seriesId}`);

    // 获取Supabase实例
    const supabase = (await import('jsr:@supabase/supabase-js@2')).createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    // 获取系列的所有剧集
    const { data: episodes, error: episodeError } = await supabase
      .from('series_episodes')
      .select('id, episode_number, title')
      .eq('series_id', seriesId)
      .order('episode_number', { ascending: true });

    if (episodeError) {
      throw new Error(`Failed to fetch episodes: ${episodeError.message}`);
    }

    if (!episodes || episodes.length === 0) {
      return c.json({
        success: false,
        error: 'No episodes found for this series'
      }, 404);
    }

    console.log(`[mergeAllSeriesVideos] 📺 Found ${episodes.length} episodes to process`);

    const results = {
      total: episodes.length,
      success: 0,
      failed: 0,
      skipped: 0,
      details: [] as Array<{ episodeId: string; status: string; error?: string }>
    };

    // 逐个处理每个剧集
    for (const episode of episodes) {
      console.log(`[mergeAllSeriesVideos] 📹 Processing episode ${episode.episode_number}: ${episode.title}`);

      try {
        // 获取剧集的所有分镜
        const { data: storyboards } = await supabase
          .from('series_storyboards')
          .select('video_url, scene_number')
          .eq('episode_id', episode.id)
          .order('scene_number', { ascending: true });

        if (!storyboards || storyboards.length === 0) {
          console.log(`[mergeAllSeriesVideos] ⚠️ Episode ${episode.episode_number}: No storyboards found`);
          results.skipped++;
          results.details.push({
            episodeId: episode.id,
            status: 'skipped',
            error: 'No storyboards'
          });
          continue;
        }

        // 获取所有已生成的视频URL
        const videoUrls = storyboards
          .filter(sb => sb.video_url)
          .map(sb => sb.video_url);

        if (videoUrls.length === 0) {
          console.log(`[mergeAllSeriesVideos] ⚠️ Episode ${episode.episode_number}: No videos generated yet`);
          results.skipped++;
          results.details.push({
            episodeId: episode.id,
            status: 'skipped',
            error: 'No videos generated'
          });
          continue;
        }

        // 调用合并函数
        const mergedVideoUrl = await createMergedVideo(videoUrls, episode.id);

        // 更新剧集的merged_video_url
        const { error: updateError } = await supabase
          .from('series_episodes')
          .update({ merged_video_url: mergedVideoUrl })
          .eq('id', episode.id);

        if (updateError) {
          throw new Error(`Failed to update episode: ${updateError.message}`);
        }

        console.log(`[mergeAllSeriesVideos] ✅ Episode ${episode.episode_number}: Merge completed`);
        results.success++;
        results.details.push({
          episodeId: episode.id,
          status: 'success'
        });

      } catch (error: any) {
        console.error(`[mergeAllSeriesVideos] ❌ Episode ${episode.episode_number}: Error:`, error.message);
        results.failed++;
        results.details.push({
          episodeId: episode.id,
          status: 'failed',
          error: error.message
        });
      }

      // 等待一下，避免过载
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`[mergeAllSeriesVideos] ✅ Batch merge completed:`, results);

    return c.json({
      success: true,
      seriesId,
      results
    });

  } catch (error: any) {
    console.error(`[mergeAllSeriesVideos] ❌ Error:`, error.message);
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
}