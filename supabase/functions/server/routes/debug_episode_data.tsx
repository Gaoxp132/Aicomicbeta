import type { Context } from "npm:hono@4.6.14";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * 调试剧集数据 - 查看数据库中实际存储的内容
 * GET /make-server-fc31472c/debug/episode/:episodeId
 */
export async function debugEpisodeData(c: Context) {
  try {
    const episodeId = c.req.param('episodeId');
    
    if (!episodeId) {
      return c.json({
        success: false,
        error: 'Missing episodeId parameter',
      }, 400);
    }
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    
    console.log('[Debug Episode] 🔍 Querying episode:', episodeId);
    
    // 1. 查询剧集基本信息
    const { data: episode, error: episodeError } = await supabase
      .from('episodes_fc31472c')
      .select('*')
      .eq('id', episodeId)
      .single();
    
    if (episodeError) {
      console.error('[Debug Episode] ❌ Episode query error:', episodeError);
      return c.json({
        success: false,
        error: `Failed to query episode: ${episodeError.message}`,
      }, 500);
    }
    
    if (!episode) {
      return c.json({
        success: false,
        error: 'Episode not found',
      }, 404);
    }
    
    // 2. 查询所有分镜
    const { data: storyboards, error: storyboardsError } = await supabase
      .from('series_storyboards')
      .select('*')
      .eq('episode_id', episodeId)
      .order('scene_number', { ascending: true });
    
    if (storyboardsError) {
      console.error('[Debug Episode] ❌ Storyboards query error:', storyboardsError);
      return c.json({
        success: false,
        error: `Failed to query storyboards: ${storyboardsError.message}`,
      }, 500);
    }
    
    // 3. 分析merged_video_url
    let mergedVideoData = null;
    let mergedVideoError = null;
    
    if (episode.merged_video_url) {
      try {
        if (episode.merged_video_url.startsWith('{')) {
          // 是JSON字符串
          mergedVideoData = JSON.parse(episode.merged_video_url);
        } else {
          // 是URL
          mergedVideoData = {
            type: 'url',
            url: episode.merged_video_url,
          };
        }
      } catch (e: any) {
        mergedVideoError = e.message;
      }
    }
    
    // 4. 比对分镜数据
    const storyboardsMap = new Map();
    storyboards?.forEach((sb: any) => {
      storyboardsMap.set(sb.scene_number, sb);
    });
    
    const comparison: any[] = [];
    
    if (mergedVideoData && mergedVideoData.videos) {
      mergedVideoData.videos.forEach((video: any) => {
        const sb = storyboardsMap.get(video.sceneNumber);
        comparison.push({
          sceneNumber: video.sceneNumber,
          mergedVideoUrl: video.url,
          mergedVideoUrlLength: video.url?.length,
          storyboardVideoUrl: sb?.video_url,
          storyboardVideoUrlLength: sb?.video_url?.length,
          urlsMatch: video.url === sb?.video_url,
          storyboardStatus: sb?.video_status,
          storyboardTaskId: sb?.task_id,
        });
      });
    }
    
    // 5. 输出详细信息
    console.log('[Debug Episode] 📊 Episode data:', {
      id: episode.id,
      title: episode.title,
      episode_number: episode.episode_number,
      video_status: episode.video_status,
      merged_video_url_length: episode.merged_video_url?.length,
      merged_video_url_preview: episode.merged_video_url?.substring(0, 200),
    });
    
    console.log('[Debug Episode] 📊 Storyboards count:', storyboards?.length);
    
    storyboards?.forEach((sb: any, index: number) => {
      console.log(`[Debug Episode] 📹 Storyboard ${index + 1}:`, {
        scene_number: sb.scene_number,
        video_status: sb.video_status,
        video_url: sb.video_url?.substring(0, 100) + '...',
        video_url_length: sb.video_url?.length,
        task_id: sb.task_id,
      });
    });
    
    return c.json({
      success: true,
      data: {
        episode: {
          id: episode.id,
          title: episode.title,
          episode_number: episode.episode_number,
          video_status: episode.video_status,
          merged_video_url_length: episode.merged_video_url?.length,
          merged_video_url_type: episode.merged_video_url?.startsWith('{') ? 'json' : 'url',
          merged_video_url_preview: episode.merged_video_url?.substring(0, 300),
        },
        mergedVideoData,
        mergedVideoError,
        storyboards: storyboards?.map((sb: any) => ({
          scene_number: sb.scene_number,
          video_status: sb.video_status,
          video_url: sb.video_url,
          video_url_length: sb.video_url?.length,
          task_id: sb.task_id,
          created_at: sb.created_at,
        })),
        comparison,
        analysis: {
          totalStoryboards: storyboards?.length || 0,
          mergedVideoCount: mergedVideoData?.videos?.length || 0,
          allUrlsMatch: comparison.every(c => c.urlsMatch),
          mismatches: comparison.filter(c => !c.urlsMatch),
          shortUrls: comparison.filter(c => c.mergedVideoUrlLength && c.mergedVideoUrlLength < 50),
        },
      },
    });
    
  } catch (error: any) {
    console.error('[Debug Episode] ❌ Error:', error);
    return c.json({
      success: false,
      error: error.message,
      stack: error.stack,
    }, 500);
  }
}
