/**
 * 批量任务查询Handler
 * 从 video/task_query.tsx 提取 batchQueryTaskStatus 函数
 */

import type { Context } from "npm:hono";
import * as db from "../../database/index.tsx";
import { API_CONFIG } from "../constants.tsx";
import { fetchWithRetry } from "../../utils.tsx";

/**
 * 批量查询任务状态
 */
export async function batchQueryTaskStatus(c: Context) {
  try {
    const body = await c.req.json();
    const { taskIds } = body;
    
    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return c.json({
        error: "请提供要查询的任务ID列表",
        message: "taskIds参数必须是非空数组",
      }, 400);
    }
    
    console.log(`📦 [BatchQuery] Querying ${taskIds.length} tasks:`, taskIds);
    
    // 构建查询URL，使用官方的批量查询接口
    const queryParams = new URLSearchParams();
    queryParams.append('page_num', '1');
    queryParams.append('page_size', String(Math.min(taskIds.length, 100))); // 最多100个
    
    // 添加每个任务ID作为filter参数
    taskIds.forEach((taskId: string) => {
      queryParams.append('filter.task_ids', taskId);
    });
    
    const volcengineUrl = `${API_CONFIG.BASE_URL}?${queryParams.toString()}`;
    console.log("🌐 [BatchQuery] Volcengine API URL:", volcengineUrl);
    
    const apiKey = Deno.env.get("VOLCENGINE_API_KEY");
    if (!apiKey) {
      return c.json({ error: "API密钥未配置" }, 500);
    }
    
    console.log('[BatchQuery] 🔄 Using enhanced retry mechanism...');
    
    let apiResponse: Response;
    try {
      apiResponse = await fetchWithRetry(
        volcengineUrl,
        {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        },
        180000, // 3分钟超时
        3       // 3次重试
      );
    } catch (fetchError: any) {
      console.error("❌ [BatchQuery] All fetch attempts failed:", fetchError.message);
      
      // 网络错误时，从数据库返回缓存数据
      const cachedTasks: any[] = [];
      for (const taskId of taskIds) {
        try {
          const dbTask = await db.getVideoTask(taskId);
          if (dbTask) {
            cachedTasks.push({
              task_id: dbTask.task_id,
              status: dbTask.status === 'completed' ? 'succeeded' : dbTask.status,
              content: dbTask.video_url ? {
                video_url: dbTask.video_url,
                cover_url: dbTask.thumbnail || '',
              } : undefined,
              created_at: dbTask.created_at,
              updated_at: dbTask.updated_at,
            });
          }
        } catch (dbError: any) {
          console.warn(`⚠️ [BatchQuery] Failed to get task ${taskId} from database:`, dbError.message);
        }
      }
      
      if (cachedTasks.length > 0) {
        console.log(`✅ [BatchQuery] Returning ${cachedTasks.length} tasks from database cache`);
        return c.json({
          success: true,
          data: {
            total: cachedTasks.length,
            tasks: cachedTasks,
          },
          warning: '网络错误，返回的是数据库缓存数据',
          isFallback: true,
        });
      }
      
      return c.json({
        error: "网络错误",
        message: "无法连接到视频生成服务",
        details: fetchError.message,
      }, 503);
    }
    
    console.log("[BatchQuery] API response status:", apiResponse.status);
    
    const responseText = await apiResponse.text();
    console.log("[BatchQuery] API response text (first 500 chars):", responseText.substring(0, 500));
    
    let apiData: any;
    try {
      apiData = JSON.parse(responseText);
      console.log("[BatchQuery] API response data parsed successfully");
    } catch (parseError: any) {
      console.error("[BatchQuery] Failed to parse API response as JSON:", parseError.message);
      return c.json({
        error: "API响应格式错误",
        message: "无法解析API返回的数据",
        parseError: parseError.message,
      }, 500);
    }
    
    if (!apiResponse.ok) {
      console.log("[BatchQuery] API error:", apiData);
      return c.json({
        error: "批量查询任务失败",
        details: apiData,
        message: apiData.error?.message || apiData.message || "Unknown error",
      }, apiResponse.status);
    }
    
    // 解析返回的任务列表
    const tasks = apiData.data?.tasks || apiData.tasks || [];
    console.log(`✅ [BatchQuery] Got ${tasks.length} tasks from API`);
    
    // 更新数据库中的任务状态
    for (const task of tasks) {
      try {
        const status = task.status || 'unknown';
        const videoUrl = task.content?.video_url || task.video_url || '';
        const thumbnailUrl = task.content?.cover_url || task.cover_url || '';
        
        if (status === 'succeeded' || status === 'completed') {
          await db.updateVideoTaskStatus(
            task.task_id,
            'completed',
            videoUrl,
            thumbnailUrl
          );
        } else if (status === 'failed') {
          await db.updateVideoTaskStatus(
            task.task_id,
            'failed',
            '',
            ''
          );
        }
      } catch (dbError: any) {
        console.warn(`⚠️ [BatchQuery] Failed to update task ${task.task_id}:`, dbError.message);
      }
    }
    
    return c.json({
      success: true,
      data: {
        total: tasks.length,
        tasks: tasks,
      },
    });
  } catch (error: any) {
    console.error("[BatchQuery] Error:", error.message);
    return c.json({
      error: "批量查询失败",
      message: error.message,
    }, 500);
  }
}
