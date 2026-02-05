/**
 * 视频合并服务
 * 使用FFmpeg合并多个分镜视频为完整剧集视频
 * 
 * 注意：由于Deno环境限制，这里提供API调用方案
 * 实际合并可以通过：
 * 1. 调用第三方视频处理服务（推荐）
 * 2. 使用火山引擎的视频编辑API
 * 3. 前端直接提供分镜列表播放（当前方案）
 * 4. 🆕 生成M3U8播放列表并上传到OSS
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import * as ossService from "./aliyun_oss.tsx";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
);

/**
 * 为剧集生成缩略图
 * 使用第一个分镜的图片作为缩略图
 */
export async function generateEpisodeThumbnail(episodeId: string): Promise<string | null> {
  try {
    console.log(`[VideoMerger] Generating thumbnail for episode ${episodeId}`);

    // 获取该集的所有分镜
    const { data: storyboards, error } = await supabase
      .from("series_storyboards")
      .select("image_url, video_url")
      .eq("episode_id", episodeId)
      .eq("status", "completed")
      .order("scene_number", { ascending: true })
      .limit(1);

    if (error || !storyboards || storyboards.length === 0) {
      console.error(`[VideoMerger] No completed storyboards found for episode ${episodeId}`);
      return null;
    }

    // 使用第一个分镜的图片作为缩略图
    const firstStoryboard = storyboards[0];
    const thumbnailUrl = firstStoryboard.image_url || firstStoryboard.video_url;

    if (!thumbnailUrl) {
      console.error(`[VideoMerger] No image or video URL found for first storyboard`);
      return null;
    }

    // 更新episode的缩略图
    const { error: updateError } = await supabase
      .from("series_episodes")
      .update({ thumbnail_url: thumbnailUrl })
      .eq("id", episodeId);

    if (updateError) {
      console.error(`[VideoMerger] Failed to update thumbnail:`, updateError);
      return null;
    }

    console.log(`[VideoMerger] ✅ Thumbnail generated for episode ${episodeId}`);
    return thumbnailUrl;
  } catch (error) {
    console.error(`[VideoMerger] Error generating thumbnail:`, error);
    return null;
  }
}

/**
 * 🆕 生成M3U8播放列表文件内容
 */
function generateM3U8Playlist(videoUrls: string[], durations: number[]): string {
  // 计算最大时长（向上取整）
  const maxDuration = Math.ceil(Math.max(...durations, 10));
  
  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    `#EXT-X-TARGETDURATION:${maxDuration}`,
  ];
  
  videoUrls.forEach((url, index) => {
    const duration = durations[index] || 10;
    lines.push(`#EXTINF:${duration.toFixed(3)},`);
    lines.push(url);
  });
  
  lines.push('#EXT-X-ENDLIST');
  
  return lines.join('\n');
}

/**
 * 合并剧集视频（创建播放列表）
 * 🆕 增强版：生成M3U8播放列表并上传到OSS
 */
export async function mergeEpisodeVideos(episodeId: string): Promise<{
  success: boolean;
  videoUrls?: string[];
  playlistUrl?: string;
  mergedVideoUrl?: string;
  error?: string;
}> {
  try {
    console.log(`[VideoMerger] Merging videos for episode ${episodeId}`);

    // 更新合并状态为进行中
    await supabase
      .from("series_episodes")
      .update({ merge_status: "merging" })
      .eq("id", episodeId);

    // 获取该集的所有已完成的分镜视频
    const { data: storyboards, error } = await supabase
      .from("series_storyboards")
      .select("id, scene_number, video_url, duration")
      .eq("episode_id", episodeId)
      .eq("status", "completed")
      .not("video_url", "is", null)
      .order("scene_number", { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch storyboards: ${error.message}`);
    }

    if (!storyboards || storyboards.length === 0) {
      throw new Error("No completed storyboards with videos found");
    }

    // 提取所有视频URL和时长
    const videoUrls = storyboards.map(sb => sb.video_url).filter(Boolean) as string[];
    const durations = storyboards.map(sb => sb.duration || 10);

    if (videoUrls.length === 0) {
      throw new Error("No valid video URLs found");
    }

    console.log(`[VideoMerger] Found ${videoUrls.length} videos to merge`);

    // 计算总时长
    const totalDuration = durations.reduce((sum, d) => sum + d, 0);

    // 生成缩略图
    const thumbnailUrl = await generateEpisodeThumbnail(episodeId);

    // 🆕 自动转存所有视频到OSS（如果它们还没有在OSS中）
    // ✅ 必须先转存再生成M3U8，确保M3U8中的URL是永久OSS URL
    const ossVideoUrls: string[] = [];
    for (let i = 0; i < storyboards.length; i++) {
      const storyboard = storyboards[i];
      const videoUrl = storyboard.video_url;
      
      if (!videoUrl) continue;
      
      // 检查视频是否已经在OSS中（判断URL是否包含aliyuncs.com）
      if (videoUrl.includes('aliyuncs.com')) {
        // 移除签名参数，使用永久URL
        try {
          const urlObj = new URL(videoUrl);
          const permanentUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
          ossVideoUrls.push(permanentUrl);
          console.log(`[VideoMerger] Video ${i + 1} already in OSS, using permanent URL`);
        } catch (urlError) {
          console.error(`[VideoMerger] Failed to parse OSS URL for video ${i + 1}:`, urlError);
          ossVideoUrls.push(videoUrl); // 使用原URL作为fallback
        }
      } else {
        // 视频在火山引擎，需要转存到OSS
        console.log(`[VideoMerger] Transferring video ${i + 1} to OSS...`);
        
        try {
          // 获取用户ID
          const { data: episode } = await supabase
            .from("series_episodes")
            .select("series_id")
            .eq("id", episodeId)
            .single();
          
          let userId: string | undefined;
          if (episode) {
            const { data: series } = await supabase
              .from("series")
              .select("user_phone")
              .eq("id", episode.series_id)
              .single();
            
            userId = series?.user_phone;
          }
          
          const transferResult = await ossService.transferVideoToOSS(
            `${episodeId}-scene-${storyboard.scene_number}`,
            videoUrl,
            userId
          );
          
          if (transferResult.success && transferResult.ossUrl) {
            // 移除签名参数，使用永久URL
            try {
              const urlObj = new URL(transferResult.ossUrl);
              const permanentUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
              ossVideoUrls.push(permanentUrl);
              console.log(`[VideoMerger] ✅ Video ${i + 1} transferred to OSS with permanent URL`);
            } catch (urlError) {
              console.error(`[VideoMerger] Failed to parse transferred URL for video ${i + 1}:`, urlError);
              ossVideoUrls.push(transferResult.ossUrl); // 使用原URL作为fallback
            }
            
            // 更新storyboard的video_url为OSS地址（永久URL）
            const permanentUrl = new URL(transferResult.ossUrl);
            const permanentVideoUrl = `${permanentUrl.protocol}//${permanentUrl.host}${permanentUrl.pathname}`;
            
            await supabase
              .from("series_storyboards")
              .update({ video_url: permanentVideoUrl })
              .eq("id", storyboard.id);
            
            console.log(`[VideoMerger] Updated storyboard ${i + 1} with permanent OSS URL`);
          } else {
            console.error(`[VideoMerger] Failed to transfer video ${i + 1}:`, transferResult.error);
            ossVideoUrls.push(videoUrl); // 使用原URL作为fallback
          }
        } catch (transferError: any) {
          console.error(`[VideoMerger] Error transferring video ${i + 1}:`, transferError);
          ossVideoUrls.push(videoUrl); // 使用原URL作为fallback
        }
      }
    }

    // ✅ 使用OSS永久URL生成M3U8播放列表
    const m3u8Content = generateM3U8Playlist(ossVideoUrls, durations);
    console.log(`[VideoMerger] Generated M3U8 playlist with ${ossVideoUrls.length} OSS URLs:\\n${m3u8Content.substring(0, 200)}...`);
    
    // 🔍 详细日志：输出所有OSS视频URL
    console.log(`[VideoMerger] OSS Video URLs in M3U8:`);
    ossVideoUrls.forEach((url, idx) => {
      console.log(`  ${idx + 1}. ${url}`);
    });

    // 🆕 上传M3U8到OSS
    let playlistOSSUrl: string | null = null;
    try {
      const m3u8Data = new TextEncoder().encode(m3u8Content);
      const playlistFileName = `${episodeId}.m3u8`;
      
      // 获取剧集信息以获取用户ID
      const { data: episode } = await supabase
        .from("series_episodes")
        .select("series_id")
        .eq("id", episodeId)
        .single();
      
      let userId: string | undefined;
      if (episode) {
        const { data: series } = await supabase
          .from("series")
          .select("user_phone")
          .eq("id", episode.series_id)
          .single();
        
        userId = series?.user_phone;
      }
      
      playlistOSSUrl = await ossService.uploadToOSS(
        m3u8Data,
        playlistFileName,
        'application/vnd.apple.mpegurl', // M3U8的MIME类型
        userId
      );
      
      console.log(`[VideoMerger] ✅ M3U8 playlist uploaded to OSS: ${playlistOSSUrl}`);
    } catch (ossError: any) {
      console.error(`[VideoMerger] ⚠️ Failed to upload M3U8 to OSS:`, ossError);
      // 不影响主流程，继续使用本地播放列表
    }

    // 更新episode状态
    const { error: updateError } = await supabase
      .from("series_episodes")
      .update({
        merge_status: "completed",
        merged_video_url: playlistOSSUrl || videoUrls[0], // 使用M3U8 URL或第一个视频URL
        total_duration: totalDuration,
        thumbnail_url: thumbnailUrl || undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", episodeId);

    if (updateError) {
      console.error(`[VideoMerger] Failed to update episode:`, updateError);
    }
    
    // 🆕 更新series的completed_episodes计数
    try {
      // 获取episode所属的series
      const { data: episode } = await supabase
        .from("series_episodes")
        .select("series_id, episode_number")
        .eq("id", episodeId)
        .single();
      
      if (episode && episode.series_id) {
        // 统计该series有多少个已完成合并的episode
        const { count, error: countError } = await supabase
          .from("series_episodes")
          .select("id", { count: 'exact', head: true })
          .eq("series_id", episode.series_id)
          .eq("merge_status", "completed");
        
        if (!countError && count !== null) {
          // 更新series的completed_episodes
          await supabase
            .from("series")
            .update({ completed_episodes: count })
            .eq("id", episode.series_id);
          
          console.log(`[VideoMerger] 📊 Updated series completed_episodes: ${count}`);
        }
      }
    } catch (seriesUpdateError: any) {
      console.error(`[VideoMerger] ⚠️ Failed to update series completed_episodes:`, seriesUpdateError);
      // 不影响主流程
    }

    console.log(`[VideoMerger] ✅ Video merge completed for episode ${episodeId}`);
    console.log(`[VideoMerger] - Original videos: ${videoUrls.length}`);
    console.log(`[VideoMerger] - OSS videos: ${ossVideoUrls.length}`);
    console.log(`[VideoMerger] - Playlist URL: ${playlistOSSUrl || 'N/A'}`);

    return {
      success: true,
      videoUrls: ossVideoUrls.length > 0 ? ossVideoUrls : videoUrls,
      playlistUrl: playlistOSSUrl || undefined,
      mergedVideoUrl: playlistOSSUrl || videoUrls[0],
    };
  } catch (error: any) {
    console.error(`[VideoMerger] Error merging videos:`, error);

    // 更新失败状态
    await supabase
      .from("series_episodes")
      .update({
        merge_status: "failed",
        merge_error: error.message,
      })
      .eq("id", episodeId);

    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 批量合并漫剧系列的所有剧集
 */
export async function mergeSeriesAllEpisodes(seriesId: string): Promise<{
  success: boolean;
  mergedCount: number;
  failedCount: number;
  errors: string[];
}> {
  try {
    console.log(`[VideoMerger] Merging all episodes for series ${seriesId}`);

    // 获取所有已完成的剧集
    const { data: episodes, error } = await supabase
      .from("series_episodes")
      .select("id, episode_number")
      .eq("series_id", seriesId)
      .eq("status", "completed")
      .order("episode_number", { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch episodes: ${error.message}`);
    }

    if (!episodes || episodes.length === 0) {
      return {
        success: true,
        mergedCount: 0,
        failedCount: 0,
        errors: ["No completed episodes found"],
      };
    }

    // 逐个合并
    let mergedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const episode of episodes) {
      const result = await mergeEpisodeVideos(episode.id);
      if (result.success) {
        mergedCount++;
      } else {
        failedCount++;
        errors.push(`Episode ${episode.episode_number}: ${result.error}`);
      }
    }

    console.log(`[VideoMerger] ✅ Series merge completed: ${mergedCount} succeeded, ${failedCount} failed`);

    return {
      success: failedCount === 0,
      mergedCount,
      failedCount,
      errors,
    };
  } catch (error: any) {
    console.error(`[VideoMerger] Error merging series:`, error);
    return {
      success: false,
      mergedCount: 0,
      failedCount: 0,
      errors: [error.message],
    };
  }
}

/**
 * 获取剧集的合并状态
 */
export async function getEpisodeMergeStatus(episodeId: string) {
  try {
    const { data, error } = await supabase
      .from("series_episodes")
      .select("merge_status, merge_error, thumbnail_url, total_duration")
      .eq("id", episodeId)
      .single();

    if (error) throw error;

    return {
      success: true,
      data,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}