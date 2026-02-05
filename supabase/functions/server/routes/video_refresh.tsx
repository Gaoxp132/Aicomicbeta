import type { Context } from "npm:hono";
import * as db from "../database/index.tsx";
import { fetchWithRetry } from "../utils.tsx";
import { API_CONFIG } from "../video/constants.tsx";

/**
 * 刷新OSS URL处理器
 * 为已成功但URL过期的任务重新获取并上传到OSS
 */
export async function handleRefreshOSSUrl(c: Context) {
  try {
    const taskId = c.req.param('taskId');
    console.log('[Refresh OSS URL] Starting for task:', taskId);

    // 从数据库获取任务信息
    const { data: task, error: fetchError } = await db.supabase
      .from('video_tasks')
      .select('*')
      .eq('task_id', taskId)
      .single();

    if (fetchError || !task) {
      console.error('[Refresh OSS URL] Task not found:', taskId);
      return c.json({ error: '任务不存在' }, 404);
    }

    // 检查任务状态
    if (task.status !== 'succeeded' && task.status !== 'completed') {
      console.log('[Refresh OSS URL] Task not completed:', task.status);
      return c.json({ error: '任务尚未完成，无法刷新URL' }, 400);
    }

    // 检查是否已经有OSS URL
    if (task.video_url && (task.video_url.includes('aliyuncs.com') || task.video_url.includes('oss-'))) {
      console.log('[Refresh OSS URL] Already has OSS URL:', task.video_url.substring(0, 60));
      return c.json({
        success: true,
        message: '已经是OSS URL，无需刷新',
        data: { videoUrl: task.video_url },
      });
    }

    // 如果是火山引擎URL，先检查是否过期，如果过期则从API重新获取
    let volcengineUrl = task.video_url;
    
    if (volcengineUrl && volcengineUrl.includes('volcengine')) {
      console.log('[Refresh OSS URL] 🔍 Checking if Volcengine URL is still valid...');
      
      // 尝试HEAD请求检查URL是否有效
      try {
        const checkResponse = await fetch(volcengineUrl, { method: 'HEAD' });
        if (!checkResponse.ok) {
          console.log('[Refresh OSS URL] ⚠️ Volcengine URL expired (status:', checkResponse.status, '), fetching fresh URL from API...');
          
          // URL已过期，从火山引擎API重新查询
          const apiKey = Deno.env.get("VOLCENGINE_API_KEY");
          if (!apiKey) {
            return c.json({ error: "API密钥未配置" }, 500);
          }
          
          const apiUrl = `${API_CONFIG.BASE_URL}/${taskId}`;
          console.log('[Refresh OSS URL] 📡 Querying Volcengine API:', apiUrl);
          
          const apiResponse = await fetchWithRetry(
            apiUrl,
            {
              method: "GET",
              headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
            },
            30000,
            3,
            [2000, 5000, 10000]
          );
          
          if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
            console.error('[Refresh OSS URL] ❌ Volcengine API error:', apiResponse.status, errorText);
            return c.json({ 
              error: '无法从火山引擎获取新URL',
              details: errorText 
            }, 500);
          }
          
          const apiData = await apiResponse.json();
          const volcTask = apiData.data || apiData;
          
          // 提取新的视频URL
          const freshUrl = volcTask.content?.video_url || volcTask.video_url || '';
          
          if (!freshUrl) {
            console.error('[Refresh OSS URL] ❌ No video URL in API response');
            return c.json({ error: '火山引擎API未返回视频URL' }, 500);
          }
          
          console.log('[Refresh OSS URL] ✅ Got fresh URL from API:', freshUrl.substring(0, 60) + '...');
          volcengineUrl = freshUrl;
          
          // 更新数据库中的火山引擎URL
          await db.supabase
            .from('video_tasks')
            .update({ video_url: freshUrl })
            .eq('task_id', taskId);
        } else {
          console.log('[Refresh OSS URL] ✅ Volcengine URL is still valid');
        }
      } catch (checkError: any) {
        console.warn('[Refresh OSS URL] ⚠️ Could not check URL validity:', checkError.message);
        // 继续尝试下载，如果失败会在下面捕获
      }
    }
    
    if (!volcengineUrl) {
      return c.json({ error: '任务没有视频URL' }, 400);
    }

    // 动态导入OSS模块
    console.log('[Refresh OSS URL] Loading OSS module...');
    const { transferVideoToOSS } = await import('../video/aliyun_oss.tsx');
    
    // 调用上传函数
    console.log('[Refresh OSS URL] Calling transferVideoToOSS with URL:', volcengineUrl.substring(0, 60) + '...');
    const ossResult = await transferVideoToOSS(taskId, volcengineUrl, task.user_phone);

    if (!ossResult.success || !ossResult.ossUrl) {
      console.error('[Refresh OSS URL] Failed to transfer to OSS:', ossResult.error);
      return c.json({ error: ossResult.error || 'OSS上传失败' }, 500);
    }

    console.log('[Refresh OSS URL] ✅ OSS URL refreshed:', ossResult.ossUrl.substring(0, 60));

    // 更新数据库
    const { error: updateError } = await db.supabase
      .from('video_tasks')
      .update({
        video_url: ossResult.ossUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('task_id', taskId);

    if (updateError) {
      console.error('[Refresh OSS URL] Failed to update database:', updateError);
      return c.json({ error: '更新数据库失败' }, 500);
    }
    
    // 同时更新 works 表（如果存在）
    try {
      const { error: worksUpdateError } = await db.supabase
        .from('works')
        .update({
          video_url: ossResult.ossUrl,
        })
        .eq('task_id', taskId);
      
      if (worksUpdateError) {
        console.warn('[Refresh OSS URL] Failed to update works table:', worksUpdateError.message);
      } else {
        console.log('[Refresh OSS URL] ✅ Works table also updated');
      }
    } catch (worksError) {
      console.warn('[Refresh OSS URL] Works table update skipped (may not exist)');
    }

    return c.json({
      success: true,
      message: 'OSS URL已刷新',
      data: {
        videoUrl: ossResult.ossUrl,
        taskId,
      },
    });

  } catch (error: any) {
    console.error('[Refresh OSS URL] Error:', error);
    return c.json({
      error: '刷新OSS URL失败',
      message: error.message,
    }, 500);
  }
}

/**
 * 调试端点：查看所有任务
 */
export async function handleDebugAllTasks(c: Context) {
  try {
    const { data: allTasks, error } = await db.supabase
      .from('video_tasks')
      .select('task_id, user_phone, status, prompt, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (error) {
      return c.json({ error: error.message }, 500);
    }
    
    return c.json({
      success: true,
      total: allTasks?.length || 0,
      tasks: allTasks || [],
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
}

/**
 * 调试端点：按用户查询任务
 */
export async function handleDebugUserTasks(c: Context) {
  try {
    const userPhone = c.req.param('userPhone');
    
    const { data: userTasks, error } = await db.supabase
      .from('video_tasks')
      .select('*')
      .eq('user_phone', userPhone)
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (error) {
      return c.json({ error: error.message }, 500);
    }
    
    return c.json({
      success: true,
      userPhone,
      total: userTasks?.length || 0,
      tasks: userTasks || [],
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
}
