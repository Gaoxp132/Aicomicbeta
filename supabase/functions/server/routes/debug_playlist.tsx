/**
 * 调试播放列表内容
 * 查看指定剧集的播放列表数据
 */

import { Context } from 'npm:hono';
import { createClient } from 'jsr:@supabase/supabase-js@2';

export async function debugPlaylist(c: Context) {
  const episodeId = c.req.param('episodeId');
  
  console.log(`[Debug Playlist] 🔍 Debugging episode: ${episodeId}`);
  
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  
  try {
    // 查询剧集
    const { data: episode, error } = await supabase
      .from('series_episodes')
      .select('id, episode_number, series_id, merged_video_url, merge_status')
      .eq('id', episodeId)
      .single();
    
    if (error) {
      return c.json({
        success: false,
        error: `Failed to fetch episode: ${error.message}`,
      }, 500);
    }
    
    if (!episode) {
      return c.json({
        success: false,
        error: 'Episode not found',
      }, 404);
    }
    
    console.log('[Debug Playlist] 📊 Episode found:', {
      id: episode.id,
      episodeNumber: episode.episode_number,
      seriesId: episode.series_id,
      mergeStatus: episode.merge_status,
      hasMergedVideoUrl: !!episode.merged_video_url,
      mergedVideoUrlLength: episode.merged_video_url?.length,
      mergedVideoUrlPreview: episode.merged_video_url?.substring(0, 200),
    });
    
    // 尝试解析播放列表
    let playlistData: any = null;
    let parseError: string | null = null;
    
    if (episode.merged_video_url) {
      if (episode.merged_video_url.trim().startsWith('{')) {
        try {
          playlistData = JSON.parse(episode.merged_video_url);
          console.log('[Debug Playlist] ✅ Parsed playlist JSON');
        } catch (e: any) {
          parseError = e.message;
          console.error('[Debug Playlist] ❌ Failed to parse JSON:', e);
        }
      } else {
        parseError = 'Not a JSON string (might be a URL)';
      }
    }
    
    // 检查字段
    let fieldCheck: any = null;
    if (playlistData && playlistData.videos) {
      const firstVideo = playlistData.videos[0];
      fieldCheck = {
        hasVideoUrlField: 'videoUrl' in firstVideo,
        hasUrlField: 'url' in firstVideo,
        videoUrlValue: firstVideo.videoUrl,
        urlValue: firstVideo.url,
        allFields: Object.keys(firstVideo),
      };
      
      console.log('[Debug Playlist] 🔍 Field check:', fieldCheck);
    }
    
    return c.json({
      success: true,
      data: {
        episode: {
          id: episode.id,
          episodeNumber: episode.episode_number,
          seriesId: episode.series_id,
          mergeStatus: episode.merge_status,
        },
        mergedVideoUrl: {
          exists: !!episode.merged_video_url,
          length: episode.merged_video_url?.length,
          preview: episode.merged_video_url?.substring(0, 500),
          isJson: episode.merged_video_url?.trim().startsWith('{'),
        },
        playlist: playlistData ? {
          type: playlistData.type,
          version: playlistData.version,
          episodeId: playlistData.episodeId,
          totalVideos: playlistData.totalVideos,
          totalDuration: playlistData.totalDuration,
          videosCount: playlistData.videos?.length,
          firstVideo: playlistData.videos?.[0],
        } : null,
        parseError,
        fieldCheck,
      },
    });
    
  } catch (error: any) {
    console.error('[Debug Playlist] ❌ Error:', error);
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
}
