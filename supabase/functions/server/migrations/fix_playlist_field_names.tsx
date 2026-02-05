/**
 * 修复播放列表字段名：将 videoUrl 改为 url
 * 
 * 问题：旧版本的播放列表使用 videoUrl 字段，但前端播放器期望 url 字段
 * 解决：读取所有使用JSON播放列表的剧集，转换字段名并更新
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

interface OldVideo {
  sceneNumber: number;
  videoUrl: string; // 旧字段名
  duration: number;
  thumbnail?: string | null;
}

interface NewVideo {
  sceneNumber: number;
  url: string; // 新字段名
  duration: number;
  thumbnail?: string | null;
  title?: string;
}

interface Playlist {
  type?: string;
  version?: string;
  episodeId: string;
  totalVideos: number;
  totalDuration: number;
  createdAt: string;
  videos: (OldVideo | NewVideo)[];
}

/**
 * 批量修复播放列表字段名
 */
export async function fixPlaylistFieldNames(): Promise<{
  success: boolean;
  fixed: number;
  skipped: number;
  failed: number;
  errors: string[];
}> {
  console.log('[Playlist Fix] 🚀 Starting playlist field name fix...');
  
  // 🔥 FIX: 在函数内部创建 supabase 客户端
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  
  let fixed = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];
  
  try {
    // 查询所有剧集
    const { data: episodes, error: fetchError } = await supabase
      .from('series_episodes')
      .select('id, episode_number, series_id, merged_video_url, merge_status')
      .eq('merge_status', 'completed')
      .not('merged_video_url', 'is', null)
      .order('series_id', { ascending: true })
      .order('episode_number', { ascending: true });
    
    if (fetchError) {
      throw new Error(`Failed to fetch episodes: ${fetchError.message}`);
    }
    
    if (!episodes || episodes.length === 0) {
      console.log('[Playlist Fix] ℹ️ No episodes found to fix');
      return { success: true, fixed: 0, skipped: 0, failed: 0, errors: [] };
    }
    
    console.log(`[Playlist Fix] 📊 Found ${episodes.length} episodes to check`);
    
    // 处理每个剧集
    for (const episode of episodes) {
      try {
        const mergedVideoUrl = episode.merged_video_url;
        
        // 跳过非JSON数据
        if (!mergedVideoUrl || !mergedVideoUrl.trim().startsWith('{')) {
          console.log(`[Playlist Fix] ⏭️ Episode ${episode.episode_number}: Not JSON data, skipping`);
          skipped++;
          continue;
        }
        
        // 解析JSON
        let playlist: Playlist;
        try {
          playlist = JSON.parse(mergedVideoUrl);
        } catch (parseError) {
          console.error(`[Playlist Fix] ❌ Episode ${episode.episode_number}: Failed to parse JSON:`, parseError);
          failed++;
          errors.push(`Episode ${episode.episode_number}: Invalid JSON`);
          continue;
        }
        
        // 检查是否需要修复
        const firstVideo = playlist.videos[0] as any;
        const needsFix = firstVideo && 'videoUrl' in firstVideo && !('url' in firstVideo);
        
        if (!needsFix) {
          console.log(`[Playlist Fix] ✅ Episode ${episode.episode_number}: Already using correct field names, skipping`);
          skipped++;
          continue;
        }
        
        console.log(`[Playlist Fix] 🔧 Episode ${episode.episode_number}: Converting field names...`);
        
        // 转换字段名
        const fixedVideos: NewVideo[] = playlist.videos.map((video: any) => {
          const newVideo: NewVideo = {
            sceneNumber: video.sceneNumber,
            url: video.videoUrl || video.url, // 优先使用videoUrl，如果不存在则用url
            duration: video.duration,
            thumbnail: video.thumbnail,
            title: video.title || `分镜 ${video.sceneNumber}`,
          };
          return newVideo;
        });
        
        // 创建新的播放列表
        const fixedPlaylist: Playlist = {
          ...playlist,
          type: 'playlist',
          version: '1.1', // 更新版本号
          videos: fixedVideos,
        };
        
        const fixedJson = JSON.stringify(fixedPlaylist);
        
        // 更新数据库
        const { error: updateError } = await supabase
          .from('series_episodes')
          .update({
            merged_video_url: fixedJson,
            updated_at: new Date().toISOString(),
          })
          .eq('id', episode.id);
        
        if (updateError) {
          console.error(`[Playlist Fix] ❌ Episode ${episode.episode_number}: Failed to update:`, updateError);
          failed++;
          errors.push(`Episode ${episode.episode_number}: ${updateError.message}`);
          continue;
        }
        
        console.log(`[Playlist Fix] ✅ Episode ${episode.episode_number}: Fixed successfully (${fixedVideos.length} videos)`);
        fixed++;
        
        // 等待一下，避免数据库压力
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error: any) {
        console.error(`[Playlist Fix] ❌ Episode ${episode.episode_number}: Error:`, error);
        failed++;
        errors.push(`Episode ${episode.episode_number}: ${error.message}`);
      }
    }
    
    console.log('[Playlist Fix] ✅ Batch fix completed:');
    console.log(`  - Fixed: ${fixed}`);
    console.log(`  - Skipped: ${skipped}`);
    console.log(`  - Failed: ${failed}`);
    
    return {
      success: failed === 0,
      fixed,
      skipped,
      failed,
      errors,
    };
    
  } catch (error: any) {
    console.error('[Playlist Fix] ❌ Batch fix failed:', error);
    return {
      success: false,
      fixed,
      skipped,
      failed,
      errors: [error.message],
    };
  }
}

/**
 * 检查需要修复的剧集数量
 */
export async function checkPlaylistsNeedingFix(): Promise<{
  total: number;
  needsFix: number;
  alreadyFixed: number;
  notJson: number;
}> {
  console.log('[Playlist Fix] 🔍 Checking playlists...');
  
  // 🔥 FIX: 在函数内部创建 supabase 客户端
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  
  try {
    const { data: episodes, error } = await supabase
      .from('series_episodes')
      .select('id, episode_number, merged_video_url, merge_status')
      .eq('merge_status', 'completed')
      .not('merged_video_url', 'is', null);
    
    if (error) {
      throw new Error(`Failed to fetch episodes: ${error.message}`);
    }
    
    if (!episodes || episodes.length === 0) {
      return { total: 0, needsFix: 0, alreadyFixed: 0, notJson: 0 };
    }
    
    let needsFix = 0;
    let alreadyFixed = 0;
    let notJson = 0;
    
    for (const episode of episodes) {
      const mergedVideoUrl = episode.merged_video_url;
      
      if (!mergedVideoUrl || !mergedVideoUrl.trim().startsWith('{')) {
        notJson++;
        continue;
      }
      
      try {
        const playlist = JSON.parse(mergedVideoUrl);
        const firstVideo = playlist.videos?.[0];
        
        if (firstVideo && 'videoUrl' in firstVideo) {
          needsFix++;
        } else {
          alreadyFixed++;
        }
      } catch (e) {
        notJson++;
      }
    }
    
    console.log('[Playlist Fix] 📊 Check results:');
    console.log(`  - Total episodes: ${episodes.length}`);
    console.log(`  - Needs fix: ${needsFix}`);
    console.log(`  - Already fixed: ${alreadyFixed}`);
    console.log(`  - Not JSON: ${notJson}`);
    
    return {
      total: episodes.length,
      needsFix,
      alreadyFixed,
      notJson,
    };
    
  } catch (error: any) {
    console.error('[Playlist Fix] ❌ Check failed:', error);
    throw error;
  }
}
