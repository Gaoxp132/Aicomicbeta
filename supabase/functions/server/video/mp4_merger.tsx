/**
 * 使用外部API合并视频（CloudConvert或类似服务）
 */
async function mergeVideosWithAPI(
  videoFiles: { path: string; duration: number }[],
  episodeId: string
): Promise<string | null> {
  // 🗑️ 已废弃：不再使用外部API
  throw new Error("External API merge not supported. Use virtual merge instead.");
}

/**
 * 使用本地FFmpeg合并视频
 */
async function mergeVideosWithFFmpeg(
  videoFiles: { path: string; duration: number }[],
  episodeId: string
): Promise<string | null> {
  // 🗑️ 已废弃：不再使用FFmpeg
  throw new Error("FFmpeg merge not supported. Use virtual merge instead.");
}

/**
 * "虚拟合并"剧集视频为单一播放体验
 * 不真正合并MP4文件，而是：
 * 1. 确保所有视频都在OSS中（转存火山引擎视频）
 * 2. 生成有序的播放列表JSON
 * 3. 上传播放列表到OSS
 * 4. 前端播放器根据播放列表连续播放
 * 
 * @param episodeId 剧集ID
 * @returns 播放列表URL和相关信息
 */
export async function mergeEpisodeToMP4(episodeId: string): Promise<{
  success: boolean;
  mergedVideoUrl?: string;
  videoList?: any[];
  error?: string;
}> {
  try {
    console.log(`[MP4Merger] Starting virtual merge for episode ${episodeId}`);

    // 更新合并状态为进行中
    await supabase
      .from("series_episodes")
      .update({ merge_status: "merging" })
      .eq("id", episodeId);

    // 获取该集的所有已完成的分镜视频
    const { data: storyboards, error } = await supabase
      .from("series_storyboards")
      .select("id, scene_number, video_url, duration, image_url")
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

    console.log(`[MP4Merger] Found ${storyboards.length} videos to merge`);

    // 计算总时长
    const totalDuration = storyboards.reduce((sum, sb) => sum + (sb.duration || 10), 0);

    // 🆕 确保所有视频都转存到OSS（使用永久URL）
    const videoList: any[] = [];
    
    for (let i = 0; i < storyboards.length; i++) {
      const storyboard = storyboards[i];
      let videoUrl = storyboard.video_url;
      
      console.log(`[MP4Merger] Processing video ${i + 1}/${storyboards.length}...`);
      
      // 检查视频是否已在OSS中
      if (videoUrl.includes('aliyuncs.com')) {
        // 已在OSS，移除签名参数使用永久URL
        try {
          const urlObj = new URL(videoUrl);
          const permanentUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
          videoUrl = permanentUrl;
          console.log(`[MP4Merger] Video ${i + 1} already in OSS (permanent URL)`);
        } catch (urlError) {
          console.error(`[MP4Merger] Failed to parse OSS URL for video ${i + 1}:`, urlError);
        }
      } else {
        // 视频在火山引擎，需要转存到OSS
        console.log(`[MP4Merger] Transferring video ${i + 1} to OSS...`);
        
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
            // 使用永久URL
            try {
              const urlObj = new URL(transferResult.ossUrl);
              const permanentUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
              videoUrl = permanentUrl;
              console.log(`[MP4Merger] ✅ Video ${i + 1} transferred to OSS (permanent URL)`);
              
              // 更新storyboard的video_url
              await supabase
                .from("series_storyboards")
                .update({ video_url: permanentUrl })
                .eq("id", storyboard.id);
            } catch (urlError) {
              console.error(`[MP4Merger] Failed to parse transferred URL:`, urlError);
              videoUrl = transferResult.ossUrl;
            }
          } else {
            console.warn(`[MP4Merger] ⚠️ Failed to transfer video ${i + 1}, using original URL`);
          }
        } catch (transferError: any) {
          console.error(`[MP4Merger] ❌ Error transferring video ${i + 1}:`, transferError);
          // 继续使用原URL
        }
      }
      
      // 添加到播放列表
      videoList.push({
        sceneNumber: storyboard.scene_number,
        url: videoUrl, // 🔥 FIX: 改为 'url' 而不是 'videoUrl' 以匹配前端
        duration: storyboard.duration || 10,
        thumbnail: storyboard.image_url || null,
        title: `分镜 ${storyboard.scene_number}`, // 🔥 FIX: 添加 title ��段
      });
    }

    console.log(`[MP4Merger] ✅ All videos processed, ${videoList.length} videos ready`);

    // 🆕 生成播放列表JSON
    const playlist = {
      episodeId: episodeId,
      totalVideos: videoList.length,
      totalDuration: totalDuration,
      createdAt: new Date().toISOString(),
      videos: videoList,
    };

    // 🆕 上传播放列表到OSS
    const playlistContent = JSON.stringify(playlist, null, 2);
    const playlistData = new TextEncoder().encode(playlistContent);
    const playlistFileName = `${episodeId}_playlist.json`;
    
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
    
    const playlistUrl = await ossService.uploadToOSS(
      playlistData,
      playlistFileName,
      'application/json',
      userId
    );

    console.log(`[MP4Merger] ✅ Playlist uploaded to OSS: ${playlistUrl}`);

    // 生成缩略图
    const thumbnailUrl = videoList[0]?.thumbnail || null;

    // 更新episode状态
    const { error: updateError } = await supabase
      .from("series_episodes")
      .update({
        merge_status: "completed",
        merged_video_url: playlistUrl, // 存储播放列表URL
        total_duration: totalDuration,
        thumbnail_url: thumbnailUrl || undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", episodeId);

    if (updateError) {
      console.error(`[MP4Merger] Failed to update episode:`, updateError);
    }

    console.log(`[MP4Merger] ✅ Virtual merge completed for episode ${episodeId}`);
    console.log(`[MP4Merger] - Total videos: ${videoList.length}`);
    console.log(`[MP4Merger] - Total duration: ${totalDuration}s`);
    console.log(`[MP4Merger] - Playlist URL: ${playlistUrl}`);

    return {
      success: true,
      mergedVideoUrl: playlistUrl,
      videoList: videoList,
    };
  } catch (error: any) {
    console.error(`[MP4Merger] Error in virtual merge:`, error);

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
export async function mergeSeriesAllEpisodesToMP4(seriesId: string): Promise<{
  success: boolean;
  mergedCount: number;
  failedCount: number;
  errors: string[];
}> {
  try {
    console.log(`[MP4Merger] Merging all episodes for series ${seriesId}`);

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
      const result = await mergeEpisodeToMP4(episode.id);
      if (result.success) {
        mergedCount++;
      } else {
        failedCount++;
        errors.push(`Episode ${episode.episode_number}: ${result.error}`);
      }
    }

    console.log(`[MP4Merger] ✅ Series merge completed: ${mergedCount} succeeded, ${failedCount} failed`);

    return {
      success: failedCount === 0,
      mergedCount,
      failedCount,
      errors,
    };
  } catch (error: any) {
    console.error(`[MP4Merger] Error merging series:`, error);
    return {
      success: false,
      mergedCount: 0,
      failedCount: 0,
      errors: [error.message],
    };
  }
}