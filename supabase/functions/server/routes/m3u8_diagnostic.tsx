/**
 * M3U8诊断工具
 * 检查M3U8文件内容和引用的视频URL可访问性
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { Context } from "npm:hono";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
);

/**
 * 诊断M3U8文件和视频URL
 * GET /make-server-fc31472c/diagnostic/m3u8/:episodeId
 */
export async function handleM3U8Diagnostic(c: Context) {
  try {
    const episodeId = c.req.param('episodeId');
    console.log('[M3U8 Diagnostic] 🔍 Starting diagnostic for episode:', episodeId);

    // 1. 获取剧集信息
    const { data: episode, error: episodeError } = await supabase
      .from('series_episodes')
      .select('*')
      .eq('id', episodeId)
      .single();

    if (episodeError || !episode) {
      return c.json({
        success: false,
        error: 'Episode not found',
      }, 404);
    }

    const results: any = {
      episodeId,
      episodeNumber: episode.episode_number,
      mergeStatus: episode.merge_status,
      mergedVideoUrl: episode.merged_video_url,
      diagnosticTime: new Date().toISOString(),
      checks: {},
    };

    // 2. 获取所有分镜
    const { data: storyboards, error: storyboardError } = await supabase
      .from('series_storyboards')
      .select('id, scene_number, video_url, duration, status')
      .eq('episode_id', episodeId)
      .order('scene_number', { ascending: true });

    if (storyboardError || !storyboards) {
      return c.json({
        success: false,
        error: 'Failed to fetch storyboards',
      }, 500);
    }

    results.checks.storyboardsCount = storyboards.length;
    results.checks.completedStoryboards = storyboards.filter(sb => sb.status === 'completed').length;

    // 3. 检查M3U8文件（如果存在）
    if (episode.merged_video_url && episode.merged_video_url.endsWith('.m3u8')) {
      console.log('[M3U8 Diagnostic] 📄 Checking M3U8 file:', episode.merged_video_url);
      
      try {
        const m3u8Response = await fetch(episode.merged_video_url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; DiagnosticBot/1.0)',
          },
        });

        results.checks.m3u8File = {
          url: episode.merged_video_url,
          accessible: m3u8Response.ok,
          status: m3u8Response.status,
          statusText: m3u8Response.statusText,
          headers: Object.fromEntries(m3u8Response.headers.entries()),
        };

        if (m3u8Response.ok) {
          const m3u8Content = await m3u8Response.text();
          results.checks.m3u8File.size = m3u8Content.length;
          results.checks.m3u8File.contentPreview = m3u8Content.substring(0, 500);
          
          // 解析M3U8内容，提取视频URL
          const lines = m3u8Content.split('\n');
          const videoUrls: string[] = [];
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
              videoUrls.push(trimmed);
            }
          }
          
          results.checks.m3u8File.videoUrlsCount = videoUrls.length;
          results.checks.m3u8File.videoUrls = videoUrls;
          
          // 检查每个视频URL的可访问性
          const urlChecks = [];
          for (let i = 0; i < videoUrls.length; i++) {
            const videoUrl = videoUrls[i];
            console.log(`[M3U8 Diagnostic] 🎬 Checking video ${i + 1}/${videoUrls.length}:`, videoUrl.substring(0, 100));
            
            try {
              // 使用HEAD请求检查可访问性
              const videoResponse = await fetch(videoUrl, {
                method: 'HEAD',
                headers: {
                  'User-Agent': 'Mozilla/5.0 (compatible; DiagnosticBot/1.0)',
                },
              });
              
              const check = {
                index: i + 1,
                url: videoUrl,
                accessible: videoResponse.ok,
                status: videoResponse.status,
                statusText: videoResponse.statusText,
                contentType: videoResponse.headers.get('Content-Type'),
                contentLength: videoResponse.headers.get('Content-Length'),
                isOSS: videoUrl.includes('aliyuncs.com'),
                isVolcengine: videoUrl.includes('volcengine') || videoUrl.includes('volces'),
                hasSignature: videoUrl.includes('OSSAccessKeyId') || videoUrl.includes('Signature'),
              };
              
              // 如果有签名参数，检查过期时间
              if (check.hasSignature && videoUrl.includes('Expires=')) {
                const expiresMatch = videoUrl.match(/Expires=(\d+)/);
                if (expiresMatch) {
                  const expiresTimestamp = parseInt(expiresMatch[1]);
                  const expiresDate = new Date(expiresTimestamp * 1000);
                  const now = new Date();
                  check['expiresAt'] = expiresDate.toISOString();
                  check['isExpired'] = now > expiresDate;
                  check['timeToExpire'] = expiresTimestamp - Math.floor(now.getTime() / 1000);
                }
              }
              
              urlChecks.push(check);
              
            } catch (fetchError: any) {
              urlChecks.push({
                index: i + 1,
                url: videoUrl,
                accessible: false,
                error: fetchError.message,
                isOSS: videoUrl.includes('aliyuncs.com'),
                isVolcengine: videoUrl.includes('volcengine') || videoUrl.includes('volces'),
                hasSignature: videoUrl.includes('OSSAccessKeyId') || videoUrl.includes('Signature'),
              });
            }
          }
          
          results.checks.m3u8File.urlChecks = urlChecks;
          results.checks.m3u8File.accessibleVideos = urlChecks.filter(c => c.accessible).length;
          results.checks.m3u8File.inaccessibleVideos = urlChecks.filter(c => !c.accessible).length;
        }
      } catch (m3u8Error: any) {
        results.checks.m3u8File = {
          url: episode.merged_video_url,
          accessible: false,
          error: m3u8Error.message,
        };
      }
    } else {
      results.checks.m3u8File = {
        exists: false,
        mergedVideoUrl: episode.merged_video_url || null,
      };
    }

    // 4. 检查分镜视频URL
    const storyboardChecks = [];
    for (const storyboard of storyboards) {
      if (!storyboard.video_url) {
        storyboardChecks.push({
          sceneNumber: storyboard.scene_number,
          status: storyboard.status,
          hasVideo: false,
        });
        continue;
      }
      
      try {
        const videoResponse = await fetch(storyboard.video_url, {
          method: 'HEAD',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; DiagnosticBot/1.0)',
          },
        });
        
        storyboardChecks.push({
          sceneNumber: storyboard.scene_number,
          status: storyboard.status,
          hasVideo: true,
          url: storyboard.video_url,
          accessible: videoResponse.ok,
          httpStatus: videoResponse.status,
          contentType: videoResponse.headers.get('Content-Type'),
          contentLength: videoResponse.headers.get('Content-Length'),
          isOSS: storyboard.video_url.includes('aliyuncs.com'),
          isVolcengine: storyboard.video_url.includes('volcengine') || storyboard.video_url.includes('volces'),
        });
      } catch (error: any) {
        storyboardChecks.push({
          sceneNumber: storyboard.scene_number,
          status: storyboard.status,
          hasVideo: true,
          url: storyboard.video_url,
          accessible: false,
          error: error.message,
          isOSS: storyboard.video_url.includes('aliyuncs.com'),
          isVolcengine: storyboard.video_url.includes('volcengine') || storyboard.video_url.includes('volces'),
        });
      }
    }
    
    results.checks.storyboards = storyboardChecks;
    results.checks.accessibleStoryboards = storyboardChecks.filter(c => c.accessible).length;
    results.checks.inaccessibleStoryboards = storyboardChecks.filter(c => c.hasVideo && !c.accessible).length;

    // 5. 生成诊断总结
    const summary = {
      overallHealth: 'unknown',
      issues: [] as string[],
      recommendations: [] as string[],
    };

    // 检查M3U8问题
    if (results.checks.m3u8File?.exists === false) {
      summary.issues.push('M3U8播放列表文件不存在');
      summary.recommendations.push('运行视频合并操作以生成M3U8播放列表');
    } else if (results.checks.m3u8File?.accessible === false) {
      summary.issues.push('M3U8文件无法访问: ' + (results.checks.m3u8File.error || 'HTTP ' + results.checks.m3u8File.status));
      summary.recommendations.push('检查OSS bucket权限设置，确保文件为公共读或生成签名URL');
    } else if (results.checks.m3u8File?.videoUrls) {
      const inaccessibleCount = results.checks.m3u8File.inaccessibleVideos || 0;
      if (inaccessibleCount > 0) {
        summary.issues.push(`M3U8中有 ${inaccessibleCount}/${results.checks.m3u8File.videoUrlsCount} 个视频URL无法访问`);
        
        // 分析无法访问的原因
        const urlChecks = results.checks.m3u8File.urlChecks || [];
        const expiredUrls = urlChecks.filter((c: any) => c.isExpired);
        const volcengineUrls = urlChecks.filter((c: any) => !c.accessible && c.isVolcengine);
        
        if (expiredUrls.length > 0) {
          summary.issues.push(`有 ${expiredUrls.length} 个签名URL已过期`);
          summary.recommendations.push('重新生成M3U8播放列表，使用永久URL或新的签名URL');
        }
        
        if (volcengineUrls.length > 0) {
          summary.issues.push(`有 ${volcengineUrls.length} 个火山引擎URL无法访问（可能已过期）`);
          summary.recommendations.push('将所有视频转存到OSS以获得永久存储');
        }
      }
    }

    // 检查分镜视频问题
    const inaccessibleStoryboards = results.checks.inaccessibleStoryboards || 0;
    if (inaccessibleStoryboards > 0) {
      summary.issues.push(`有 ${inaccessibleStoryboards} 个分镜视频无法访问`);
      summary.recommendations.push('检查分镜视频URL有效性，考虑重新生成或转存到OSS');
    }

    // 确定整体健康状态
    if (summary.issues.length === 0) {
      summary.overallHealth = 'healthy';
    } else if (results.checks.m3u8File?.accessible && (results.checks.m3u8File?.inaccessibleVideos || 0) === 0) {
      summary.overallHealth = 'degraded';
    } else {
      summary.overallHealth = 'critical';
    }

    results.summary = summary;

    console.log('[M3U8 Diagnostic] ✅ Diagnostic complete. Health:', summary.overallHealth);
    console.log('[M3U8 Diagnostic] Issues found:', summary.issues.length);

    return c.json({
      success: true,
      data: results,
    });

  } catch (error: any) {
    console.error('[M3U8 Diagnostic] ❌ Error:', error);
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
}

/**
 * 修复M3U8播放列表（使用签名URL）
 * POST /make-server-fc31472c/diagnostic/m3u8/:episodeId/fix
 */
export async function handleFixM3U8(c: Context) {
  try {
    const episodeId = c.req.param('episodeId');
    const body = await c.req.json();
    const { strategy = 'regenerate-with-signed-urls' } = body;

    console.log('[M3U8 Fix] 🔧 Starting fix for episode:', episodeId);
    console.log('[M3U8 Fix] Strategy:', strategy);

    // 动态导入，避免循环依赖
    const { mergeEpisodeVideos } = await import('../video/video_merger.tsx');
    const { generateSignedUrl } = await import('../video/aliyun_oss.tsx');

    // 获取剧集信息
    const { data: episode, error: episodeError } = await supabase
      .from('series_episodes')
      .select('*')
      .eq('id', episodeId)
      .single();

    if (episodeError || !episode) {
      return c.json({
        success: false,
        error: 'Episode not found',
      }, 404);
    }

    if (strategy === 'regenerate-with-signed-urls') {
      // 策略1: 重新生成M3U8，所有URL使用签名URL
      console.log('[M3U8 Fix] 📝 Regenerating M3U8 with signed URLs...');

      // 获取所有分镜
      const { data: storyboards } = await supabase
        .from('series_storyboards')
        .select('id, scene_number, video_url, duration')
        .eq('episode_id', episodeId)
        .eq('status', 'completed')
        .not('video_url', 'is', null)
        .order('scene_number', { ascending: true });

      if (!storyboards || storyboards.length === 0) {
        return c.json({
          success: false,
          error: 'No completed storyboards found',
        }, 400);
      }

      // 为每个OSS视频生成签名URL
      const signedUrls: string[] = [];
      const durations: number[] = [];

      for (const storyboard of storyboards) {
        const videoUrl = storyboard.video_url;
        
        if (videoUrl.includes('aliyuncs.com')) {
          // OSS视频，生成签名URL
          try {
            const urlObj = new URL(videoUrl);
            const objectPath = urlObj.pathname.substring(1); // 移除开头的/
            const signedUrl = await generateSignedUrl(objectPath, 7 * 24 * 3600); // 7天有效期
            signedUrls.push(signedUrl);
            console.log('[M3U8 Fix] ✅ Generated signed URL for scene', storyboard.scene_number);
          } catch (error: any) {
            console.error('[M3U8 Fix] ⚠️ Failed to generate signed URL for scene', storyboard.scene_number, ':', error.message);
            signedUrls.push(videoUrl); // 使用原URL作为fallback
          }
        } else {
          // 非OSS视频，直接使用
          signedUrls.push(videoUrl);
        }
        
        durations.push(storyboard.duration || 10);
      }

      // 生成新的M3U8内容
      const maxDuration = Math.ceil(Math.max(...durations, 10));
      const lines = [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        `#EXT-X-TARGETDURATION:${maxDuration}`,
      ];
      
      signedUrls.forEach((url, index) => {
        const duration = durations[index] || 10;
        lines.push(`#EXTINF:${duration.toFixed(3)},`);
        lines.push(url);
      });
      
      lines.push('#EXT-X-ENDLIST');
      const m3u8Content = lines.join('\n');

      // 上传新M3U8到OSS
      const { uploadToOSS } = await import('../video/aliyun_oss.tsx');
      const m3u8Data = new TextEncoder().encode(m3u8Content);
      const playlistFileName = `${episodeId}-fixed.m3u8`;
      
      // 获取用户ID
      const { data: series } = await supabase
        .from('series')
        .select('user_phone')
        .eq('id', episode.series_id)
        .single();

      const playlistOSSUrl = await uploadToOSS(
        m3u8Data,
        playlistFileName,
        'application/vnd.apple.mpegurl',
        series?.user_phone
      );

      // 更新episode
      await supabase
        .from('series_episodes')
        .update({
          merged_video_url: playlistOSSUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', episodeId);

      console.log('[M3U8 Fix] ✅ M3U8 fixed and uploaded:', playlistOSSUrl);

      return c.json({
        success: true,
        message: 'M3U8 playlist regenerated with signed URLs',
        data: {
          playlistUrl: playlistOSSUrl,
          videoCount: signedUrls.length,
          expiresIn: '7 days',
        },
      });

    } else if (strategy === 'regenerate-full') {
      // 策略2: 完全重新合并（会转存视频到OSS）
      console.log('[M3U8 Fix] 🔄 Full regeneration with OSS transfer...');
      
      const result = await mergeEpisodeVideos(episodeId);
      
      return c.json({
        success: result.success,
        message: result.success ? 'M3U8 fully regenerated and videos transferred to OSS' : 'Failed to regenerate M3U8',
        data: result.success ? {
          playlistUrl: result.playlistUrl,
          mergedVideoUrl: result.mergedVideoUrl,
          videoCount: result.videoUrls?.length,
        } : undefined,
        error: result.error,
      });

    } else {
      return c.json({
        success: false,
        error: 'Unknown strategy: ' + strategy,
      }, 400);
    }

  } catch (error: any) {
    console.error('[M3U8 Fix] ❌ Error:', error);
    return c.json({
      success: false,
      error: error.message,
    }, 500);
  }
}