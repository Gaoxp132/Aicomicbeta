import { createDualRouteRegistrar } from "./utils.tsx";

// 导入任务查询处理器（使用重构版本）
import { queryTaskStatus, getUserTasks, debugTask, batchQueryTaskStatus } from "./video/task_query_refactored.tsx";

// 导入视频生成和重试处理器
import { handleVideoGeneration, handleTaskRetry } from "./routes/video_generation.tsx";

// 导入视频刷新和调试处理器
import { handleRefreshOSSUrl, handleDebugAllTasks, handleDebugUserTasks } from "./routes/video_refresh.tsx";

// 🆕 导入视频合并处理器
import * as videoMerger from "./video/video_merger.tsx";

// 🆕 导入MP4合并处理器
import * as mp4Merger from "./video/mp4_merger.tsx";

// 🆕 导入OSS URL签名处理器
import { signOSSUrl, signOSSUrls, clearACLCache } from "./routes/oss_url_signer.tsx";

// 🆕 导入M3U8诊断工具
import { handleM3U8Diagnostic, handleFixM3U8 } from "./routes/m3u8_diagnostic.tsx";

// 🆕 导入OSS诊断工具
import { testOSSSignature, checkBucketACL, testSignatureVariants } from "./routes/oss_diagnostic.tsx";

// 🆕 导入OSS Bucket配置工具
import { setBucketPublicRead, getBucketACL, setupBucketCORS } from "./routes/oss_bucket_config.tsx";

// 🆕 导入视频URL诊断工具
import { diagnoseVideoUrl, diagnoseVideoUrls } from "./routes/video_url_diagnostics.tsx";

// 🆕 导入剧集数据调试工具
import { debugEpisodeData } from "./routes/debug_episode_data.tsx";

const PREFIX = "/make-server-fc31472c";

/**
 * 注册所有视频相关路由
 */
export function registerVideoRoutes(app: any) {
  console.log('[Video Routes] 🎬 Registering video generation routes...');
  
  // === 频生成路由 ===
  app.post(`${PREFIX}/volcengine/generate`, handleVideoGeneration);
  
  // === 任务重试路由 ===
  app.post(`${PREFIX}/volcengine/retry/:taskId`, handleTaskRetry);

  // === 任务查询路由 ===
  app.get(`${PREFIX}/volcengine/status/:taskId`, queryTaskStatus);
  app.get(`${PREFIX}/volcengine/tasks`, getUserTasks);
  app.post(`${PREFIX}/volcengine/batch-query`, batchQueryTaskStatus);

  // === 视频刷新路由 ===
  app.post(`${PREFIX}/volcengine/refresh-oss-url/:taskId`, handleRefreshOSSUrl);
  
  // === 调试路由 ===
  app.get(`${PREFIX}/volcengine/debug/:taskId`, debugTask);
  app.get(`${PREFIX}/volcengine/debug-all-tasks`, handleDebugAllTasks);
  app.get(`${PREFIX}/volcengine/debug-user-tasks/:userPhone`, handleDebugUserTasks);
  
  // 🆕 === 频合并路由 ===
  
  // 合并单个剧集的视频（M3U8）
  app.post(`${PREFIX}/episodes/:episodeId/merge-videos`, async (c) => {
    try {
      const episodeId = c.req.param('episodeId');
      
      console.log('[Video Routes] Merging videos for episode:', episodeId);
      
      const result = await videoMerger.mergeEpisodeVideos(episodeId);
      
      if (!result.success) {
        return c.json({
          success: false,
          error: result.error || 'Failed to merge videos',
        }, 500);
      }

      return c.json({
        success: true,
        message: 'Videos merged successfully',
        data: {
          videoUrls: result.videoUrls,
          playlistUrl: result.playlistUrl,
          mergedVideoUrl: result.mergedVideoUrl,
        },
      });
    } catch (error: any) {
      console.error('[Video Routes] Error merging videos:', error);
      return c.json({
        success: false,
        error: error.message || 'Internal server error',
      }, 500);
    }
  });
  
  // 🆕 合并单个剧集的视频为MP4
  app.post(`${PREFIX}/episodes/:episodeId/merge-to-mp4`, async (c) => {
    try {
      const episodeId = c.req.param('episodeId');
      
      console.log('[Video Routes] Merging episode to MP4:', episodeId);
      
      const result = await mp4Merger.mergeEpisodeToMP4(episodeId);
      
      if (!result.success) {
        return c.json({
          success: false,
          error: result.error || 'Failed to merge videos to MP4',
        }, 500);
      }

      return c.json({
        success: true,
        message: 'Videos merged to MP4 successfully',
        data: {
          mergedVideoUrl: result.mergedVideoUrl,
        },
      });
    } catch (error: any) {
      console.error('[Video Routes] Error merging to MP4:', error);
      return c.json({
        success: false,
        error: error.message || 'Internal server error',
      }, 500);
    }
  });
  
  // 批量合并漫剧系列的所有剧集（M3U8）
  app.post(`${PREFIX}/series/:seriesId/merge-all-videos`, async (c) => {
    try {
      const seriesId = c.req.param('seriesId');
      
      console.log('[Video Routes] Merging all videos for series:', seriesId);
      
      const result = await videoMerger.mergeSeriesAllEpisodes(seriesId);
      
      return c.json({
        success: result.success,
        message: `Merged ${result.mergedCount} episodes, ${result.failedCount} failed`,
        data: {
          mergedCount: result.mergedCount,
          failedCount: result.failedCount,
          errors: result.errors,
        },
      });
    } catch (error: any) {
      console.error('[Video Routes] Error merging series videos:', error);
      return c.json({
        success: false,
        error: error.message || 'Internal server error',
      }, 500);
    }
  });
  
  // 🆕 批量合并漫剧系列的所有剧集为MP4
  app.post(`${PREFIX}/series/:seriesId/merge-all-to-mp4`, async (c) => {
    try {
      const seriesId = c.req.param('seriesId');
      
      console.log('[Video Routes] Merging all episodes to MP4 for series:', seriesId);
      
      const result = await mp4Merger.mergeSeriesAllEpisodesToMP4(seriesId);
      
      return c.json({
        success: result.success,
        message: `Merged ${result.mergedCount} episodes to MP4, ${result.failedCount} failed`,
        data: {
          mergedCount: result.mergedCount,
          failedCount: result.failedCount,
          errors: result.errors,
        },
      });
    } catch (error: any) {
      console.error('[Video Routes] Error merging series to MP4:', error);
      return c.json({
        success: false,
        error: error.message || 'Internal server error',
      }, 500);
    }
  });
  
  // 查询剧集合并状态
  app.get(`${PREFIX}/episodes/:episodeId/merge-status`, async (c) => {
    try {
      const episodeId = c.req.param('episodeId');
      
      const result = await videoMerger.getEpisodeMergeStatus(episodeId);
      
      if (!result.success) {
        return c.json({
          success: false,
          error: result.error || '查询失败',
        }, 500);
      }
      
      return c.json({
        success: true,
        data: result.data,
      });
    } catch (error: any) {
      console.error('[Video Routes] Error querying merge status:', error);
      return c.json({
        success: false,
        error: error.message || '查询失败',
      }, 500);
    }
  });
  
  // 🆕 === MP4合并路由 ===
  
  // 合并单个剧集的MP4视频
  app.post(`${PREFIX}/episodes/:episodeId/merge-mp4-videos`, async (c) => {
    try {
      const episodeId = c.req.param('episodeId');
      
      console.log('[Video Routes] Merging MP4 videos for episode:', episodeId);
      
      const result = await mp4Merger.mergeEpisodeVideos(episodeId);
      
      if (!result.success) {
        return c.json({
          success: false,
          error: result.error || 'MP4视频合并失败',
        }, 500);
      }
      
      return c.json({
        success: true,
        data: {
          videoUrls: result.videoUrls,
          playlistUrl: result.playlistUrl,
          mergedVideoUrl: result.mergedVideoUrl,
        },
      });
    } catch (error: any) {
      console.error('[Video Routes] Error merging episode MP4 videos:', error);
      return c.json({
        success: false,
        error: error.message || 'MP4视频合并失败',
      }, 500);
    }
  });
  
  // 批量合并漫剧系列的所有剧集的MP4视频
  app.post(`${PREFIX}/series/:seriesId/merge-all-mp4-videos`, async (c) => {
    try {
      const seriesId = c.req.param('seriesId');
      
      console.log('[Video Routes] Merging all MP4 videos for series:', seriesId);
      
      const result = await mp4Merger.mergeSeriesAllEpisodes(seriesId);
      
      return c.json({
        success: result.success,
        data: {
          mergedCount: result.mergedCount,
          failedCount: result.failedCount,
          errors: result.errors,
        },
      });
    } catch (error: any) {
      console.error('[Video Routes] Error merging series MP4 videos:', error);
      return c.json({
        success: false,
        error: error.message || '批量合并MP4视频失败',
      }, 500);
    }
  });
  
  // 查询剧集MP4合并状态
  app.get(`${PREFIX}/episodes/:episodeId/merge-mp4-status`, async (c) => {
    try {
      const episodeId = c.req.param('episodeId');
      
      const result = await mp4Merger.getEpisodeMergeStatus(episodeId);
      
      if (!result.success) {
        return c.json({
          success: false,
          error: result.error || '查询失败',
        }, 500);
      }
      
      return c.json({
        success: true,
        data: result.data,
      });
    } catch (error: any) {
      console.error('[Video Routes] Error querying MP4 merge status:', error);
      return c.json({
        success: false,
        error: error.message || '查询失败',
      }, 500);
    }
  });
  
  // 🆕 === OSS URL签名路由 ===
  
  // 签名单个OSS URL
  app.post(`${PREFIX}/oss/sign-url`, signOSSUrl);
  
  // 批量签名OSS URLs
  app.post(`${PREFIX}/oss/sign-urls`, signOSSUrls);
  
  // 清除ACL缓存
  app.post(`${PREFIX}/oss/clear-acl-cache`, clearACLCache);
  
  // 🆕 === M3U8诊断路由 ===
  
  // 诊断M3U8文件
  app.get(`${PREFIX}/diagnostic/m3u8/:episodeId`, handleM3U8Diagnostic);
  
  // 修复M3U8文件
  app.post(`${PREFIX}/diagnostic/m3u8/:episodeId/fix`, handleFixM3U8);
  
  // 🆕 === OSS诊断路由 ===
  
  // 测试OSS签名
  app.get(`${PREFIX}/diagnostic/oss/signature`, testOSSSignature);
  
  // 检查Bucket ACL
  app.get(`${PREFIX}/diagnostic/oss/acl`, checkBucketACL);
  
  // 测试签名变体
  app.get(`${PREFIX}/diagnostic/oss/signature-variants`, testSignatureVariants);
  
  // 🆕 === OSS Bucket配置路由 ===
  
  // 设置Bucket为公共读
  app.post(`${PREFIX}/oss/bucket/public-read`, setBucketPublicRead);
  
  // 获取Bucket ACL
  app.get(`${PREFIX}/oss/bucket/acl`, getBucketACL);
  
  // 设置Bucket CORS
  app.post(`${PREFIX}/oss/bucket/cors`, setupBucketCORS);
  
  // 🆕 === 视频URL诊断路由 ===
  
  // 诊断单个视频URL (使用query参数)
  app.get(`${PREFIX}/diagnostic/video-url`, diagnoseVideoUrl);
  
  // 诊断多个视频URL
  app.post(`${PREFIX}/diagnostic/video-urls`, diagnoseVideoUrls);
  
  // 🆕 === 剧集数据调试路由 ===
  
  // 调试单个剧集的数据
  app.get(`${PREFIX}/debug/episode-data/:episodeId`, debugEpisodeData);
  
  console.log('[Video Routes] ✅ All video routes registered successfully');
}