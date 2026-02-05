/**
 * 视频任务CRUD操作
 * v4.2.30: 完整重建，修复导出缺失问题
 */

// 🔥 CACHE BUSTER
export const VIDEO_TASKS_CRUD_VERSION = 'v4.2.30_REBUILD_2026-01-30';

// 🔥 延迟读取环境变量，避免模块顶层执行
let SUPABASE_URL: string;
let SUPABASE_SERVICE_ROLE_KEY: string;
let isInitialized = false;

function ensureInitialized() {
  if (!isInitialized) {
    SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    console.log('[video_tasks_crud] 🔍 Lazy initialization:');
    console.log('[video_tasks_crud] - SUPABASE_URL:', SUPABASE_URL ? `${SUPABASE_URL.substring(0, 30)}...` : '❌ MISSING');
    console.log('[video_tasks_crud] - SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? `${SUPABASE_SERVICE_ROLE_KEY.substring(0, 20)}...` : '❌ MISSING');
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    
    isInitialized = true;
  }
}

/**
 * 创建视频任务参数
 */
export interface CreateVideoTaskParams {
  seriesId: string;
  episodeId: string;
  userPhone: string;
  storyboards: any[];
  totalDuration: number;
}

/**
 * 创建视频任务
 */
export async function createVideoTask(params: CreateVideoTaskParams) {
  ensureInitialized(); // 🔥 延迟初始化
  
  const maxRetries = 3;
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[video_tasks_crud] Attempt ${attempt}/${maxRetries} - createVideoTask:`, params.episodeId);
      
      const taskData = {
        id: `task-${Date.now()}`,
        series_id: params.seriesId,
        episode_id: params.episodeId,
        user_phone: params.userPhone,
        status: 'pending',
        storyboards: params.storyboards,
        total_duration: params.totalDuration,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      const url = `${SUPABASE_URL}/rest/v1/video_tasks`;
      
      console.log('[video_tasks_crud] 🌐 Calling:', {
        url: url.substring(0, 60),
        method: 'POST',
        hasApiKey: !!SUPABASE_SERVICE_ROLE_KEY,
        taskId: taskData.id,
      });

      // 🔥 FIX: 添加超时控制，避免无限等待
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 🔥 60秒超时

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify(taskData),
          signal: controller.signal, // 🔥 添加 abort signal
        });

        clearTimeout(timeoutId);

        console.log('[video_tasks_crud] 📡 Response:', response.status, response.statusText);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[video_tasks_crud] ❌ Error response:', errorText);
          
          // 🔥 FIX: 503 错误特殊处理（Supabase服务暂时不可用）
          if (response.status === 503) {
            throw new Error(`Supabase temporarily unavailable (503): ${errorText}`);
          }
          
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        console.log(`[video_tasks_crud] ✅ Successfully created task ${taskData.id}`);
        return data[0] || taskData;
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        
        // 🔥 FIX: AbortError 特殊处理
        if (fetchError.name === 'AbortError') {
          throw new Error('Request timeout after 60 seconds');
        }
        
        throw fetchError;
      }
    } catch (error: any) {
      lastError = error;
      console.error(`[video_tasks_crud] Attempt ${attempt}/${maxRetries} failed:`, {
        message: error.message,
      });
      
      if (attempt < maxRetries) {
        // 🔥 FIX: 指数退避策略：5秒、15秒、30秒
        const waitTime = 5000 * Math.pow(2, attempt - 1);
        console.log(`[video_tasks_crud] ⏳ Waiting ${waitTime / 1000}s before retry (exponential backoff)...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  console.error(`[video_tasks_crud] ❌ All ${maxRetries} attempts failed for createVideoTask`);
  throw lastError;
}

/**
 * 获取单个视频任务
 */
export async function getVideoTask(taskId: string) {
  ensureInitialized(); // 🔥 延迟初始化
  
  const maxRetries = 3;
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[video_tasks_crud] Attempt ${attempt}/${maxRetries} - getVideoTask:`, taskId);
      
      const url = `${SUPABASE_URL}/rest/v1/video_tasks?id=eq.${taskId}`;
      
      console.log('[video_tasks_crud] 🌐 Calling:', {
        url: url.substring(0, 60),
        method: 'GET',
        hasApiKey: !!SUPABASE_SERVICE_ROLE_KEY,
      });

      // 🔥 FIX: 添加超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 🔥 30秒超时

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        console.log('[video_tasks_crud] 📡 Response:', response.status, response.statusText);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[video_tasks_crud] ❌ Error response:', errorText);
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        console.log(`[video_tasks_crud] ✅ Successfully got task ${taskId}`);
        return data[0] || null;
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        
        if (fetchError.name === 'AbortError') {
          throw new Error('Request timeout after 30 seconds');
        }
        
        throw fetchError;
      }
    } catch (error: any) {
      lastError = error;
      console.error(`[video_tasks_crud] Attempt ${attempt}/${maxRetries} failed:`, {
        message: error.message,
      });
      
      if (attempt < maxRetries) {
        const waitTime = 5000 * Math.pow(2, attempt - 1);
        console.log(`[video_tasks_crud] ⏳ Waiting ${waitTime / 1000}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  console.error(`[video_tasks_crud] ❌ All ${maxRetries} attempts failed for getVideoTask`);
  throw lastError;
}

/**
 * 获取用户的视频任务列表（分页）
 */
export async function getUserVideoTasks(userPhone: string, page: number = 1, pageSize: number = 20) {
  ensureInitialized(); // 🔥 延迟初始化
  
  const maxRetries = 3;
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[video_tasks_crud] Attempt ${attempt}/${maxRetries} - getUserVideoTasks:`, userPhone);
      
      const offset = (page - 1) * pageSize;
      const url = `${SUPABASE_URL}/rest/v1/video_tasks?user_phone=eq.${userPhone}&order=created_at.desc&limit=${pageSize}&offset=${offset}`;
      
      console.log('[video_tasks_crud] 🌐 Calling:', {
        url: url.substring(0, 80),
        method: 'GET',
        hasApiKey: !!SUPABASE_SERVICE_ROLE_KEY,
      });

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'count=exact',
        },
      });

      console.log('[video_tasks_crud] 📡 Response:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[video_tasks_crud] ❌ Error response:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const contentRange = response.headers.get('content-range');
      const total = contentRange ? parseInt(contentRange.split('/')[1]) : data.length;
      
      console.log(`[video_tasks_crud] ✅ Successfully got ${data.length} tasks (total: ${total})`);
      return { data, total };
    } catch (error: any) {
      lastError = error;
      console.error(`[video_tasks_crud] Attempt ${attempt}/${maxRetries} failed:`, {
        message: error.message,
      });
      
      if (attempt < maxRetries) {
        const waitTime = 2000 * attempt;
        console.log(`[video_tasks_crud] Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  console.error(`[video_tasks_crud] ❌ All ${maxRetries} attempts failed for getUserVideoTasks`);
  throw lastError;
}

/**
 * 更新视频任务状态
 */
export async function updateVideoTaskStatus(
  taskId: string,
  status: string,
  videoUrl?: string,
  thumbnail?: string
) {
  ensureInitialized(); // 🔥 延迟初始化
  
  const maxRetries = 3;
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[video_tasks_crud] Attempt ${attempt}/${maxRetries} - updateVideoTaskStatus:`, taskId, status);
      
      const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
      };
      
      if (videoUrl) updateData.video_url = videoUrl;
      if (thumbnail) updateData.thumbnail = thumbnail;
      
      const url = `${SUPABASE_URL}/rest/v1/video_tasks?id=eq.${taskId}`;
      
      console.log('[video_tasks_crud] 🌐 Calling:', {
        url: url.substring(0, 60),
        method: 'PATCH',
        hasApiKey: !!SUPABASE_SERVICE_ROLE_KEY,
        updateData,
      });

      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      console.log('[video_tasks_crud] 📡 Response:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[video_tasks_crud] ❌ Error response:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log(`[video_tasks_crud] ✅ Successfully updated task ${taskId}`);
      return data;
    } catch (error: any) {
      lastError = error;
      console.error(`[video_tasks_crud] Attempt ${attempt}/${maxRetries} failed:`, {
        message: error.message,
      });
      
      if (attempt < maxRetries) {
        const waitTime = 2000 * attempt;
        console.log(`[video_tasks_crud] Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  console.error(`[video_tasks_crud] ❌ All ${maxRetries} attempts failed for updateVideoTaskStatus`);
  throw lastError;
}

/**
 * 更新视频缩略图
 */
export async function updateVideoTaskThumbnail(taskId: string, thumbnail: string) {
  ensureInitialized(); // 🔥 延迟初始化
  
  const maxRetries = 3;
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[video_tasks_crud] Attempt ${attempt}/${maxRetries} - updateVideoTaskThumbnail:`, taskId);
      
      const url = `${SUPABASE_URL}/rest/v1/video_tasks?id=eq.${taskId}`;
      
      console.log('[video_tasks_crud] 🌐 Calling:', {
        url: url.substring(0, 60),
        method: 'PATCH',
        hasApiKey: !!SUPABASE_SERVICE_ROLE_KEY,
      });

      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          thumbnail,
          updated_at: new Date().toISOString(),
        }),
      });

      console.log('[video_tasks_crud] 📡 Response:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[video_tasks_crud] ❌ Error response:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log(`[video_tasks_crud] ✅ Successfully updated task ${taskId}`);
      return data;
    } catch (error: any) {
      lastError = error;
      console.error(`[video_tasks_crud] Attempt ${attempt}/${maxRetries} failed:`, {
        message: error.message,
      });
      
      if (attempt < maxRetries) {
        const waitTime = 2000 * attempt;
        console.log(`[video_tasks_crud] Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  console.error(`[video_tasks_crud] ❌ All ${maxRetries} attempts failed for updateVideoTaskThumbnail`);
  throw lastError;
}

/**
 * 删除视频任务
 */
export async function deleteVideoTask(taskId: string) {
  ensureInitialized(); // 🔥 延迟初始化
  
  const maxRetries = 3;
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[video_tasks_crud] Attempt ${attempt}/${maxRetries} - deleteVideoTask:`, taskId);
      
      const url = `${SUPABASE_URL}/rest/v1/video_tasks?id=eq.${taskId}`;
      
      console.log('[video_tasks_crud] 🌐 Calling:', {
        url: url.substring(0, 60),
        method: 'DELETE',
        hasApiKey: !!SUPABASE_SERVICE_ROLE_KEY,
      });

      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('[video_tasks_crud] 📡 Response:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[video_tasks_crud] ❌ Error response:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      console.log(`[video_tasks_crud] ✅ Successfully deleted task ${taskId}`);
      return true;
    } catch (error: any) {
      lastError = error;
      console.error(`[video_tasks_crud] Attempt ${attempt}/${maxRetries} failed:`, {
        message: error.message,
      });
      
      if (attempt < maxRetries) {
        const waitTime = 2000 * attempt;
        console.log(`[video_tasks_crud] Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  console.error(`[video_tasks_crud] ❌ All ${maxRetries} attempts failed for deleteVideoTask`);
  throw lastError;
}