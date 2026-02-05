import { getApiUrl, getDefaultApiHeaders } from '../constants/api';

export interface GenerateVideoParams {
  prompt: string;
  style: string;
  duration: string;
  imageUrls?: string[];
  resolution?: string;
  fps?: number;
  enableAudio?: boolean;
  model?: string;
  userPhone?: string;
}

export interface TaskStatus {
  taskId: string;
  status: string;
  videoUrl?: string;
  progress?: number;
}

/**
 * 创建视频生成任务
 */
export async function createVideoTask(params: GenerateVideoParams) {
  try {
    console.log('Creating video task with params:', params);
    
    // 添加超时控制（120秒，适应Edge Function冷启动和网络延迟）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    
    try {
      const response = await fetch(getApiUrl('/volcengine/generate'), {
        method: 'POST',
        headers: getDefaultApiHeaders(),
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      
      console.log('Response status:', response.status);
      const result = await response.json();
      console.log('Response data:', result);

      if (!response.ok) {
        const errorMsg = result.details?.error?.message 
          || result.error 
          || result.message 
          || '创建任务失败';
        console.error('API Error:', errorMsg, result);
        throw new Error(errorMsg);
      }

      // 🔧 适配两种API返回格式：
      // 格式1（新）: { success: true, task_id: "...", local_task_id: "..." }
      // 格式2（旧）: { success: true, data: { id: "...", task_id: "..." } }
      
      let taskData;
      if (result.data) {
        // 格式2：数据在data字段中
        taskData = result.data;
      } else if (result.task_id || result.local_task_id) {
        // 格式1：数据在根级别
        taskData = {
          id: result.task_id || result.local_task_id,
          task_id: result.task_id,
          local_task_id: result.local_task_id,
        };
      } else {
        // 都没有，报错
        console.error('API返回格式错误，缺少任务ID:', result);
        throw new Error('服务器未返回任务ID，请重试或联系管理员');
      }

      console.log('Extracted task data:', taskData);
      return taskData;
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      // 处理中止错误（超时）
      if (fetchError.name === 'AbortError') {
        throw new Error('请求超时，请检查网络连接或稍后重试');
      }
      
      // 处理网络错误
      if (fetchError.message === 'Failed to fetch') {
        throw new Error('网络连接失败，请检查网络或服务端是否正常运行');
      }
      
      throw fetchError;
    }
  } catch (error: any) {
    console.error('创建视频生成任务失败:', error);
    
    // 提供更友好的错误提示
    if (error.message.includes('Failed to fetch')) {
      throw new Error('网络连接失败，请检查：\n1. 网络连接是否正常\n2. 后端服务是否运行\n3. CORS配置是否正确');
    }
    
    throw error;
  }
}

/**
 * 查询视频生成任务状态
 */
export async function getTaskStatus(taskId: string) {
  try {
    // 🚀 增加超时时间到180秒，匹配后端的跨境API优化策略
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000); // 180秒 = 3分钟
    
    const response = await fetch(getApiUrl(`/volcengine/status/${taskId}`), {
      headers: getDefaultApiHeaders(),
      signal: controller.signal,
    }).finally(() => {
      clearTimeout(timeoutId);
    });
    
    // 先获取响应文本
    const responseText = await response.text();
    
    let result: any;
    try {
      result = JSON.parse(responseText);
    } catch (parseError: any) {
      console.error('[Volcengine] Failed to parse response as JSON');
      throw new Error(`API response parse error: ${parseError.message}`);
    }

    // 🔧 检查是否是"任务不存在"的情况（即使HTTP状态码是200）
    if (!result.success && (result.error === '任务不存在' || result.status === 'failed')) {
      console.warn('[Volcengine] Task not found or failed:', result.message);
      throw new Error(result.error || result.message || '任务不存在');
    }

    if (!response.ok) {
      const errorMsg = result.error || result.message || 'Query task status failed';
      console.error('[Volcengine] Status API error:', errorMsg);
      
      // 如果是API响应格式错误，提供更详细的信息
      if (result.parseError) {
        throw new Error(`API response parse failed: ${result.message || result.parseError}`);
      }
      
      throw new Error(errorMsg);
    }

    const data = result.data || {};
    const status = data.status || 'unknown';
    
    // 根据API示例，content是对象，不是数组
    // 正确路径：data.content.video_url
    let videoUrl = '';
    if (status === 'succeeded' || status === 'completed' || status === 'success') {
      videoUrl = data.content?.video_url || data.video_url || '';
    }

    return {
      status: status === 'succeeded' ? 'success' : status,
      videoUrl,
      taskId,
      rawData: data,
    };
  } catch (error: any) {
    // 提供更友好的错误信息
    if (error.name === 'AbortError') {
      console.warn('[Volcengine] Task status query timeout after 180s, task may still be processing');
      throw new Error('Task status query timeout - Task is still processing, please wait');
    }
    throw error;
  }
}

/**
 * 轮询任务状态直到完成
 */
export async function pollTaskStatus(
  taskId: string,
  onProgress?: (status: TaskStatus) => void,
  maxAttempts: number = 120,
  interval: number = 5000
): Promise<TaskStatus> {
  let attempts = 0;
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 5; // 🚀 增加到5次，避免网络波动导致提前失败

  while (attempts < maxAttempts) {
    try {
      const status = await getTaskStatus(taskId);
      
      const elapsedTime = Math.floor((attempts * interval) / 1000);
      
      // 🔧 减少日志输出 - 只在特定间隔记录
      if (attempts % 5 === 0 || status.status === 'completed' || status.status === 'failed') {
        console.log(`[Poll] Attempt ${attempts + 1}/${maxAttempts} (${elapsedTime}s), status: ${status.status}`);
      }
      
      // 成功获取状态，重置错误计数
      consecutiveErrors = 0;
      
      if (onProgress) {
        onProgress(status);
      }

      // 任务完成
      if (status.status === 'completed' || status.status === 'success') {
        console.log('Task completed successfully after', elapsedTime, 'seconds');
        return status;
      }

      // 任务失败
      if (status.status === 'failed' || status.status === 'error') {
        console.error('Task failed with status:', status.status);
        throw new Error(`视频生成失败 (状态: ${status.status})`);
      }

      // 继续等待
      await new Promise(resolve => setTimeout(resolve, interval));
      attempts++;
    } catch (error: any) {
      consecutiveErrors++;
      
      // 🔧 特殊处理：任务不存在 - 立即停止轮询
      const isTaskNotFound = 
        error.message?.includes('任务不存在') ||
        error.message?.includes('Task not found') ||
        error.message?.includes('not found in database') ||
        error.response?.status === 404;
      
      if (isTaskNotFound) {
        console.warn(`⚠️ Task ${taskId} not found, stopping poll`);
        throw new Error(`任务不存在或已过期 (ID: ${taskId})`);
      }
      
      // 🚀 区分超时错误和其他错误
      const isTimeoutError = error.message?.includes('timeout') || error.name === 'AbortError';
      const isNetworkError = error.message?.includes('Failed to fetch');
      
      // 🔧 静默处理临时网络错误
      if (isNetworkError && consecutiveErrors < maxConsecutiveErrors) {
        // 不记录日志，静默重试
      } else if (isTimeoutError) {
        console.warn(`⏱️ Query timeout on attempt ${attempts + 1} (consecutive: ${consecutiveErrors}/${maxConsecutiveErrors})`);
      } else if (consecutiveErrors === maxConsecutiveErrors - 1) {
        // 即将达到最大错误次数时警告
        console.error(`❌ Error on attempt ${attempts + 1} (consecutive: ${consecutiveErrors}/${maxConsecutiveErrors}):`, error.message);
      }
      
      // 如果连续错误次数过多，给出友好提示
      if (consecutiveErrors >= maxConsecutiveErrors) {
        console.error('❌ Too many consecutive errors, stopping poll');
        throw new Error(`网络连接不稳定，无法持续查询任务状态。任务ID: ${taskId}。\n\n任务可能仍在后台处理中，请稍后刷新页面查看结果。`);
      }
      
      // 🚀 超时错误时使用更长的等待时间（10秒），避免频繁重试
      const retryDelay = isTimeoutError ? 10000 : interval;
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      attempts++;
    }
  }

  console.error('Task polling timeout after', maxAttempts, 'attempts');
  throw new Error(`轮询超时。任务ID: ${taskId}。\n\n视频可能仍在生成中，请稍后刷新页面查看结果。`);
}

/**
 * 获取历史任务列表
 */
export async function getTaskHistory(page: number = 1, pageSize: number = 10) {
  try {
    console.log('Fetching task history from:', `${getApiUrl(`/volcengine/tasks?page_num=${page}&page_size=${pageSize}`)}`);
    
    const response = await fetch(`${getApiUrl(`/volcengine/tasks?page_num=${page}&page_size=${pageSize}`)}`, {
      headers: getDefaultApiHeaders(),
    });

    console.log('Response status:', response.status);
    console.log('Response ok:', response.ok);

    const result = await response.json();
    console.log('Response data:', result);

    if (!response.ok) {
      console.error('获取历史记录API错误:', result);
      // 返回空结果而不是抛出错误
      return {
        tasks: [],
        total: 0,
        page,
        pageSize,
        message: result.error || result.message || '获取历史记录失败',
      };
    }

    return {
      tasks: result.tasks || [],
      total: result.total || 0,
      page,
      pageSize,
      message: result.message, // 包含API返回的提示信息（如API密钥未配置）
    };
  } catch (error) {
    console.error('获取历史记录失败:', error);
    console.error('Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    // 网络错误或其他异常，返回空结果
    return {
      tasks: [],
      total: 0,
      page,
      pageSize,
      message: error instanceof Error ? error.message : '网络连接败，请检查网络或稍后重试',
    };
  }
}

/**
 * 调试工具 - 获取任务的原始数据
 */
export async function debugTask(taskId: string) {
  try {
    const response = await fetch(getApiUrl(`/volcengine/debug/${taskId}`), {
      headers: getDefaultApiHeaders(),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || '获取调试信息失败');
    }

    console.log('=== 任务调试信息 ===');
    console.log('任务ID:', taskId);
    console.log('完整数据:', JSON.stringify(result.data, null, 2));
    console.log('状态:', result.data?.status);
    console.log('VideoURL (直接):', result.data?.videoUrl);
    console.log('Result数据:', result.data?.result);
    
    // 根据API示例提取视频URL（content是对象）
    const apiData = result.data?.result?.data?.data || result.data?.result?.data;
    if (apiData) {
      console.log('API返回状态:', apiData.status);
      console.log('Content对象:', apiData.content);
      // content是对象，不是数组
      if (apiData.content) {
        console.log('Video URL (content.video_url):', apiData.content.video_url);
      }
    }
    console.log('===================');
    
    return result.data;
  } catch (error) {
    console.error('调试失败:', error);
    throw error;
  }
}