/**
 * 剧集分镜修复工具
 * 专门用于诊断和修复特定剧集的分镜播放问题
 */

import type { Context } from "npm:hono";
import * as db from "../../database/index.tsx";

/**
 * 诊断剧集分镜问题
 * GET /episodes/:episodeId/diagnose-storyboards
 */
export async function diagnoseEpisodeStoryboards(c: Context) {
  try {
    const episodeId = c.req.param('episodeId');
    
    if (!episodeId) {
      return c.json({
        success: false,
        error: 'Missing episodeId parameter',
      }, 400);
    }

    console.log('[DiagnoseStoryboards] 🔍 Diagnosing episode:', episodeId);

    // 1. 获取剧集信息
    const { data: episode, error: epError } = await db.supabase
      .from('series_episodes')
      .select('*')
      .eq('id', episodeId)
      .single();

    if (epError) throw epError;

    // 2. 获取分镜列表
    const storyboards = await db.getEpisodeStoryboards(episodeId);

    console.log('[DiagnoseStoryboards] 📊 Found', storyboards.length, 'storyboards');

    // 3. 诊断每个分镜
    const diagnostics = storyboards.map((sb, index) => {
      const issues: string[] = [];
      const warnings: string[] = [];
      
      // 检查video_url
      if (!sb.video_url) {
        issues.push('缺少 video_url');
      } else {
        // 检查URL长度
        if (sb.video_url.length < 50) {
          issues.push(`URL太短 (${sb.video_url.length} 字符) - 可能被截断`);
        }
        
        // 检查URL格式
        if (!sb.video_url.startsWith('http://') && !sb.video_url.startsWith('https://')) {
          issues.push('URL格式错误 - 不是有效的HTTP(S) URL');
        }
        
        // 检查URL是否包含签名参数
        if (sb.video_url.includes('aliyuncs.com')) {
          if (sb.video_url.includes('OSSAccessKeyId') || sb.video_url.includes('Signature')) {
            warnings.push('包含OSS签名参数 - 可能已过期');
          } else {
            warnings.push('OSS URL但无签名参数 - 需要bucket为公共读或获取签名URL');
          }
        }
        
        // 检查URL是否过长
        if (sb.video_url.length > 2000) {
          warnings.push(`URL非常长 (${sb.video_url.length} 字符)`);
        }
      }
      
      // 检查状态
      if (sb.status !== 'completed') {
        warnings.push(`状态不是 completed，当前: ${sb.status}`);
      }
      
      // 检查video_task_id
      if (!sb.video_task_id) {
        warnings.push('缺少 video_task_id - 可能无法追踪视频生成任务');
      }

      return {
        sceneNumber: sb.scene_number,
        id: sb.id,
        status: sb.status,
        videoUrl: sb.video_url,
        videoUrlLength: sb.video_url?.length || 0,
        videoUrlPreview: sb.video_url?.substring(0, 150) + (sb.video_url?.length > 150 ? '...' : ''),
        videoTaskId: sb.video_task_id,
        hasVideo: !!sb.video_url,
        issues: issues,
        warnings: warnings,
        isHealthy: issues.length === 0,
      };
    });

    // 4. 汇总诊断结果
    const summary = {
      totalStoryboards: storyboards.length,
      healthyCount: diagnostics.filter(d => d.isHealthy).length,
      issuesCount: diagnostics.filter(d => d.issues.length > 0).length,
      warningsCount: diagnostics.filter(d => d.warnings.length > 0).length,
      missingVideoUrl: diagnostics.filter(d => !d.hasVideo).length,
      shortUrls: diagnostics.filter(d => d.videoUrlLength > 0 && d.videoUrlLength < 50).length,
      invalidUrls: diagnostics.filter(d => d.issues.some(i => i.includes('格式错误'))).length,
    };

    console.log('[DiagnoseStoryboards] 📋 Diagnosis summary:', summary);

    return c.json({
      success: true,
      data: {
        episode: {
          id: episode.id,
          seriesId: episode.series_id,
          episodeNumber: episode.episode_number,
          title: episode.title,
        },
        summary,
        diagnostics,
      },
    });

  } catch (error: any) {
    console.error('[DiagnoseStoryboards] Error:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to diagnose episode storyboards',
    }, 500);
  }
}

/**
 * 修复剧集分镜的video_url (简单版本 - 仅占位)
 * POST /episodes/:episodeId/fix-storyboards
 */
export async function fixEpisodeStoryboards(c: Context) {
  try {
    const episodeId = c.req.param('episodeId');
    
    return c.json({
      success: true,
      message: '请使用 sync-storyboard-urls API 进行URL同步',
      data: {
        summary: {
          total: 0,
          fixed: 0,
          skipped: 0,
          failed: 0,
        },
      },
    });

  } catch (error: any) {
    console.error('[FixStoryboards] Error:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to fix episode storyboards',
    }, 500);
  }
}
