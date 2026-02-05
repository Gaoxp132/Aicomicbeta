import type { Context } from "npm:hono";
import * as db from "../database/index.tsx";
import { generateVideo } from "../services/video_generation_service.tsx";
import { fetchWithRetry } from "../utils.tsx";
import { API_CONFIG } from "../video/constants.tsx";

/**
 * 视频生成处理器
 */
export async function handleVideoGeneration(c: Context) {
  try {
    const body = await c.req.json();
    const {
      userPhone,
      images,
      imageUrls,
      title,
      description,
      prompt,
      style,
      duration,
      model,
      resolution,
      fps,
      enableAudio,
      quality,
      speed,
      // 🆕 接收漫剧关联参数
      seriesId,
      episodeId,
      storyboardId,
    } = body;

    console.log("=== Volcengine Generate Request ===");
    console.log("UserPhone:", userPhone);
    console.log("Images:", images);
    console.log("ImageUrls:", imageUrls);
    console.log("Prompt:", prompt);
    console.log("Description:", description);
    // 🆕 打印关联信息
    if (seriesId || episodeId || storyboardId) {
      console.log("Series Context:", { seriesId, episodeId, storyboardId });
    }
    
    // 统一处理images和imageUrls，支持两种参数名
    const finalImages = images || imageUrls || [];
    const finalDescription = description || prompt || '';
    
    console.log("Final images count:", finalImages?.length);
    console.log("Final description:", finalDescription);

    // 验证必需参数
    if (!userPhone) {
      return c.json({ error: "用户手机号不能为空" }, 400);
    }
    
    if (!finalDescription || !finalDescription.trim()) {
      return c.json({ error: "请输入故事描述" }, 400);
    }

    // 调用视频生成服务
    const result = await generateVideo({
      userPhone,
      images: finalImages,
      prompt: finalDescription,
      description: finalDescription,
      style,
      duration: parseInt(duration) || 5,
      model,
      resolution,
      fps,
      enableAudio,
      quality,
      speed,
      // 🆕 传递漫剧关联参数
      seriesId,
      episodeId,
      storyboardId,
    });

    if (!result.success) {
      return c.json({
        error: result.error || "视频生成失败",
        message: result.message,
      }, 500);
    }

    return c.json({
      success: true,
      task_id: result.volcTaskId,
      local_task_id: result.taskId,
      taskId: result.taskId, // 🆕 添加taskId字段，与前端期望一致
      volcTaskId: result.volcTaskId, // 🆕 添加volcTaskId字段
      message: result.message || "视频生成任务已创建",
    });

  } catch (error: any) {
    console.error("Error in generate endpoint:", error);
    return c.json({
      error: "服务器错误",
      message: error.message,
    }, 500);
  }
}

/**
 * 任务重试处理器
 */
export async function handleTaskRetry(c: Context) {
  try {
    const taskId = c.req.param('taskId');
    console.log(`[Retry] 🔄 Manual retry requested for task: ${taskId}`);
    
    // 优先从 video_tasks 表获取任务信息
    let task = await db.getVideoTask(taskId);
    
    // 如果找不到，尝试从 works 表获取
    if (!task) {
      console.log(`[Retry] ⚠️ Task not found in video_tasks, checking works table...`);
      
      try {
        const { data: work, error: workError } = await db.supabase
          .from('works')
          .select('*')
          .eq('task_id', taskId)
          .single();
        
        if (workError || !work) {
          console.error(`[Retry] ❌ Task not found in works table either: ${taskId}`);
          return c.json({
            error: '任务不存在',
            message: `Task ${taskId} not found in video_tasks or works table`,
          }, 404);
        }
        
        // 从works表构造任务对象
        task = {
          task_id: work.task_id,
          user_phone: work.user_phone,
          prompt: work.prompt || work.title || '',
          style: work.style || 'comic',
          duration: work.duration || '5',
          status: work.status || 'failed',
          volcengine_task_id: work.volcengine_task_id,
          image_urls: work.image_url ? [work.image_url] : [],
          model: work.model,
          resolution: work.resolution,
          fps: work.fps,
          enable_audio: work.enable_audio || false,
        };
        
        console.log(`[Retry] ✅ Found task in works table, converting to task format`);
      } catch (err: any) {
        console.error(`[Retry] ❌ Error querying works table:`, err);
        return c.json({
          error: '任务查询失败',
          message: err.message,
        }, 500);
      }
    }
    
    console.log(`[Retry] 📋 Task found:`, {
      task_id: task.task_id,
      status: task.status,
      volcengine_task_id: task.volcengine_task_id,
      user_phone: task.user_phone,
    });
    
    // 如果任务已经在处理中或已完成，不允许重试
    if (task.status === 'processing') {
      console.log(`[Retry] ⚠️ Task is currently processing, cannot retry`);
      return c.json({
        error: '任务正在处理中',
        message: 'Task is currently being processed',
        task_id: taskId,
        status: task.status,
      }, 400);
    }
    
    if (task.status === 'completed') {
      console.log(`[Retry] ⚠️ Task already completed, no need to retry`);
      return c.json({
        success: true,
        message: 'Task already completed',
        task_id: taskId,
        status: task.status,
        video_url: task.video_url,
      });
    }
    
    // 如果有火山引擎任务ID，先查询其状态
    if (task.volcengine_task_id) {
      console.log(`[Retry] 🔍 Checking Volcengine task status: ${task.volcengine_task_id}`);
      
      try {
        const apiKey = Deno.env.get("VOLCENGINE_API_KEY");
        if (apiKey) {
          const statusResponse = await fetchWithRetry(
            `${API_CONFIG.BASE_URL}/${task.volcengine_task_id}`,
            {
              method: "GET",
              headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
            },
            30000,
            2
          );
          
          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            console.log(`[Retry] 📊 Volcengine task status:`, statusData);
            
            // 如果火山引擎任务已完成，更新本地任务状态
            if (statusData.status === 'completed' && statusData.video_url) {
              console.log(`[Retry] ✅ Volcengine task completed, updating local task`);
              await db.updateVideoTaskStatus(
                taskId,
                'completed',
                statusData.video_url,
                statusData.thumbnail
              );
              
              return c.json({
                success: true,
                message: 'Task already completed on Volcengine',
                task_id: taskId,
                volcengine_task_id: task.volcengine_task_id,
                video_url: statusData.video_url,
              });
            }
          }
        }
      } catch (err: any) {
        console.warn(`[Retry] ⚠️ Failed to check Volcengine status:`, err.message);
        // 继续重试流程
      }
    }
    
    // 使用视频生成服务重新生成
    console.log(`[Retry] 🔄 Retrying video generation...`);
    
    const result = await generateVideo({
      userPhone: task.user_phone,
      prompt: task.prompt,
      style: task.style || 'comic',
      duration: parseInt(task.duration) || 5,
      model: task.model,
      resolution: task.resolution,
      fps: task.fps,
      enableAudio: task.enable_audio,
      imageUrls: Array.isArray(task.image_urls) ? task.image_urls : 
                 (typeof task.image_urls === 'string' ? JSON.parse(task.image_urls) : []),
    });
    
    if (!result.success) {
      console.error(`[Retry] ❌ Retry failed:`, result.error);
      return c.json({
        error: '重试失败',
        message: result.error,
        task_id: taskId,
      }, 500);
    }
    
    console.log(`[Retry] ✅ Retry successful, new task created:`, result.taskId);
    
    return c.json({
      success: true,
      message: '任务重试成功',
      original_task_id: taskId,
      new_task_id: result.taskId,
      volcengine_task_id: result.volcTaskId,
    });
    
  } catch (error: any) {
    console.error(`[Retry] ❌ Error:`, error);
    return c.json({
      error: '重试失败',
      message: error.message,
    }, 500);
  }
}