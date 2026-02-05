/**
 * 分镜URL同步工具
 * 从video_tasks表同步正确的URL到series_storyboards表
 */

import type { Context } from "npm:hono";
import * as db from "../../database/index.tsx";

/**
 * 检查剧集分镜的URL同步状态
 * GET /episodes/:episodeId/check-storyboard-urls
 */
export async function checkStoryboardUrls(c: Context) {
  try {
    const episodeId = c.req.param('episodeId');
    
    if (!episodeId) {
      return c.json({
        success: false,
        error: 'Missing episodeId parameter',
      }, 400);
    }

    console.log('[CheckStoryboardUrls] 🔍 Checking episode:', episodeId);

    // 1. 获取分镜列表
    const storyboards = await db.getEpisodeStoryboards(episodeId);

    if (storyboards.length === 0) {
      return c.json({
        success: false,
        error: 'No storyboards found for this episode',
      }, 404);
    }

    console.log('[CheckStoryboardUrls] 📊 Found', storyboards.length, 'storyboards');

    // 2. 检查每个分镜的URL状态
    const urlStatus = [];

    for (const sb of storyboards) {
      const status: any = {
        sceneNumber: sb.scene_number,
        storyboardId: sb.id,
        videoTaskId: sb.video_task_id,
        currentUrl: sb.video_url,
        urlLength: sb.video_url?.length || 0,
        hasVideoTaskId: !!sb.video_task_id,
      };

      // 如果有video_task_id，查询video_tasks表
      if (sb.video_task_id) {
        const { data: videoTask, error: vtError } = await db.supabase
          .from('video_tasks')
          .select('video_url, oss_video_url, status, task_id')
          .eq('task_id', sb.video_task_id)
          .single();

        if (!vtError && videoTask) {
          status.videoTaskStatus = videoTask.status;
          status.videoTaskVideoUrl = videoTask.video_url;
          status.videoTaskOssUrl = videoTask.oss_video_url;
          status.correctUrl = videoTask.oss_video_url || videoTask.video_url;
          status.urlsMatch = (videoTask.oss_video_url || videoTask.video_url) === sb.video_url;
          status.needsSync = !status.urlsMatch && !!status.correctUrl;
          
          console.log(`[CheckStoryboardUrls] Scene ${sb.scene_number}:`, {
            storyboardUrl: sb.video_url?.substring(0, 100),
            taskVideoUrl: videoTask.video_url?.substring(0, 100),
            taskOssUrl: videoTask.oss_video_url?.substring(0, 100),
            urlsMatch: status.urlsMatch,
            needsSync: status.needsSync,
          });
        } else {
          status.videoTaskError = vtError?.message || 'Video task not found';
          status.needsSync = false;
          console.log(`[CheckStoryboardUrls] Scene ${sb.scene_number}: video_task not found or error`);
        }
      } else {
        status.needsSync = false;
        status.warning = 'No video_task_id, cannot sync';
        console.log(`[CheckStoryboardUrls] Scene ${sb.scene_number}: No video_task_id`);
      }

      urlStatus.push(status);
    }

    // 3. 统计
    const summary = {
      total: storyboards.length,
      withVideoTaskId: urlStatus.filter(s => s.hasVideoTaskId).length,
      urlsMatch: urlStatus.filter(s => s.urlsMatch).length,
      needsSync: urlStatus.filter(s => s.needsSync).length,
      missingVideoTaskId: urlStatus.filter(s => !s.hasVideoTaskId).length,
    };

    console.log('[CheckStoryboardUrls] 📊 Summary:', summary);

    return c.json({
      success: true,
      data: {
        summary,
        urlStatus,
      },
    });

  } catch (error: any) {
    console.error('[CheckStoryboardUrls] Error:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to check storyboard URLs',
    }, 500);
  }
}

/**
 * 同步剧集分镜的URL（从video_tasks到series_storyboards）
 * POST /episodes/:episodeId/sync-storyboard-urls
 */
export async function syncStoryboardUrls(c: Context) {
  try {
    const episodeId = c.req.param('episodeId');
    
    if (!episodeId) {
      return c.json({
        success: false,
        error: 'Missing episodeId parameter',
      }, 400);
    }

    console.log('[SyncStoryboardUrls] 🔄 Syncing episode:', episodeId);

    // 1. 获取分镜列表
    const storyboards = await db.getEpisodeStoryboards(episodeId);

    if (storyboards.length === 0) {
      return c.json({
        success: false,
        error: 'No storyboards found for this episode',
      }, 404);
    }

    console.log('[SyncStoryboardUrls] 📊 Found', storyboards.length, 'storyboards');

    const syncResults = [];
    let syncedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    // 2. 同步每个分镜的URL
    for (const sb of storyboards) {
      const result: any = {
        sceneNumber: sb.scene_number,
        storyboardId: sb.id,
        videoTaskId: sb.video_task_id,
        originalUrl: sb.video_url?.substring(0, 150) + '...',
      };

      try {
        // 检查是否有video_task_id
        if (!sb.video_task_id) {
          result.status = 'skipped';
          result.reason = 'No video_task_id';
          skippedCount++;
          console.log(`[SyncStoryboardUrls] ⏭️ Scene ${sb.scene_number}: Skipped (no video_task_id)`);
          syncResults.push(result);
          continue;
        }

        // 查询video_tasks表
        console.log(`[SyncStoryboardUrls] 🔍 Scene ${sb.scene_number}: Querying video_task ${sb.video_task_id}`);
        
        const { data: videoTask, error: vtError } = await db.supabase
          .from('video_tasks')
          .select('video_url, oss_video_url, status, task_id')
          .eq('task_id', sb.video_task_id)
          .single();

        if (vtError || !videoTask) {
          result.status = 'failed';
          result.error = vtError?.message || 'Video task not found';
          failedCount++;
          console.error(`[SyncStoryboardUrls] ❌ Scene ${sb.scene_number}: Video task not found`);
          syncResults.push(result);
          continue;
        }

        // 获取正确的URL（优先使用oss_video_url）
        const correctUrl = videoTask.oss_video_url || videoTask.video_url;

        console.log(`[SyncStoryboardUrls] 📋 Scene ${sb.scene_number}:`, {
          videoTaskStatus: videoTask.status,
          hasOssUrl: !!videoTask.oss_video_url,
          hasVideoUrl: !!videoTask.video_url,
          currentStoryboardUrl: sb.video_url?.substring(0, 100),
          correctUrl: correctUrl?.substring(0, 100),
        });

        if (!correctUrl) {
          result.status = 'skipped';
          result.reason = `Video task status: ${videoTask.status}, no URL available`;
          skippedCount++;
          console.log(`[SyncStoryboardUrls] ⏭️ Scene ${sb.scene_number}: No URL in video_task (status: ${videoTask.status})`);
          syncResults.push(result);
          continue;
        }

        // 检查URL是否已经匹配
        if (correctUrl === sb.video_url) {
          result.status = 'skipped';
          result.reason = 'URL already matches';
          skippedCount++;
          console.log(`[SyncStoryboardUrls] ✅ Scene ${sb.scene_number}: URL already correct`);
          syncResults.push(result);
          continue;
        }

        // 更新storyboard的video_url
        console.log(`[SyncStoryboardUrls] 💾 Scene ${sb.scene_number}: Updating URL...`);
        console.log(`[SyncStoryboardUrls]    Old: ${sb.video_url}`);
        console.log(`[SyncStoryboardUrls]    New: ${correctUrl}`);
        console.log(`[SyncStoryboardUrls]    Source: ${videoTask.oss_video_url ? 'oss_video_url' : 'video_url'}`);

        await db.updateStoryboard(sb.id, {
          video_url: correctUrl,
        });

        result.status = 'synced';
        result.newUrl = correctUrl.substring(0, 150) + '...';
        result.source = videoTask.oss_video_url ? 'video_tasks.oss_video_url' : 'video_tasks.video_url';
        syncedCount++;
        
        console.log(`[SyncStoryboardUrls] ✅ Scene ${sb.scene_number}: URL synced successfully`);

      } catch (error: any) {
        console.error(`[SyncStoryboardUrls] ❌ Scene ${sb.scene_number}: Error:`, error);
        result.status = 'failed';
        result.error = error.message;
        failedCount++;
      }

      syncResults.push(result);
    }

    console.log('[SyncStoryboardUrls] 📊 Sync summary:', {
      total: storyboards.length,
      synced: syncedCount,
      skipped: skippedCount,
      failed: failedCount,
    });

    return c.json({
      success: true,
      data: {
        summary: {
          total: storyboards.length,
          synced: syncedCount,
          skipped: skippedCount,
          failed: failedCount,
        },
        results: syncResults,
        message: syncedCount > 0 
          ? `成功同步了 ${syncedCount} 个分镜的URL` 
          : skippedCount === storyboards.length 
            ? '所有分镜的URL都已是最新，无需同步'
            : '未能同步任何分镜URL',
      },
    });

  } catch (error: any) {
    console.error('[SyncStoryboardUrls] Error:', error);
    return c.json({
      success: false,
      error: error.message || 'Failed to sync storyboard URLs',
    }, 500);
  }
}
