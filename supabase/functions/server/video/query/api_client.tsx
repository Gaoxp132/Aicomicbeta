/**
 * 火山引擎API查询客户端
 * 从 video/task_query.tsx 提取
 */

import { API_CONFIG } from "../constants.tsx";
import { fetchWithRetry } from "../../utils.tsx";

/**
 * 查询火山引擎任务状态
 */
export async function queryVolcengineTask(volcengineTaskId: string): Promise<Response> {
  const volcengineUrl = `${API_CONFIG.BASE_URL}/${volcengineTaskId}`;
  console.log("🌐 Querying Volcengine API:", volcengineUrl);

  console.log('[API Client] ========== REQUEST DETAILS ==========');
  console.log('[API Client] URL:', volcengineUrl);
  console.log('[API Client] Method: GET');
  const apiKey = Deno.env.get("VOLCENGINE_API_KEY");
  console.log('[API Client] API Key present:', !!apiKey);
  if (apiKey) {
    console.log('[API Client] API Key prefix:', apiKey.substring(0, 20) + '...');
  }
  console.log('[API Client] ===========================================');

  console.log('[API Client] 🔄 Using enhanced retry mechanism for task status query...');
  
  // 查询任务使用智能超时策略：
  // - fetchWithRetry 会自动检测跨境API调用并优化配置
  // - 跨境调用会使用180秒超时（3分钟）和指数退避重试
  // - 国内调用会使用默认配置
  const QUERY_TIMEOUT = 180000; // 180秒，会被 fetchWithRetry 自动优化
  const QUERY_MAX_RETRIES = 3;  // 3次重试
  
  console.log('[API Client] ⚙️ Query config: timeout=180s, retries=3 (auto-optimized for cross-region)');
  
  return await fetchWithRetry(
    volcengineUrl, 
    {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("VOLCENGINE_API_KEY")}`,
        "Content-Type": "application/json",
      },
    },
    QUERY_TIMEOUT,      // fetchWithRetry会自动优化这个值
    QUERY_MAX_RETRIES,  // 重试次数
    undefined           // 使用默认的智能重试延迟（会根据跨境情况自动调整）
  );
}

/**
 * 判断是否为网络错误
 */
export function isNetworkError(error: any): boolean {
  return (
    error.name === 'NetworkError' ||
    error.name === 'TimeoutError' ||
    error.message?.includes('TCP连接超时') ||
    error.message?.includes('Connection timed out') ||
    error.message?.includes('tcp connect error') ||
    error.message?.includes('Request timeout') ||
    error.message?.includes('timeout') ||
    error.message?.includes('ETIMEDOUT') ||
    error.message?.includes('ECONNREFUSED')
  );
}

/**
 * 构建数据库回退响应
 */
export function buildFallbackResponse(dbTask: any) {
  const fallbackData: any = {
    data: {
      task_id: dbTask.task_id,
      status: dbTask.status,
      created_at: dbTask.created_at,
      updated_at: dbTask.updated_at,
    }
  };
  
  // 如果有视频URL，添加到响应中
  if (dbTask.video_url) {
    fallbackData.data.content = {
      video_url: dbTask.video_url,
      cover_url: dbTask.thumbnail || '',
    };
  }
  
  // 添加提示：这是旧任务，使用数据库状态
  fallbackData.warning = '网络错误，显示的是数据库缓存状态';
  fallbackData.isFallback = true;
  
  return fallbackData;
}

/**
 * 构建旧任务响应（没有volcengine_task_id的任务）
 */
export function buildOldTaskResponse(dbTask: any) {
  const fallbackData: any = {
    data: {
      task_id: dbTask.task_id,
      status: dbTask.status,
      created_at: dbTask.created_at,
      updated_at: dbTask.updated_at,
    }
  };
  
  // 如果有视频URL，添加到响应中
  if (dbTask.video_url) {
    fallbackData.data.content = {
      video_url: dbTask.video_url,
      cover_url: dbTask.thumbnail || '',
    };
  }
  
  // 添加提示：这是旧任务，使用数据库状态
  fallbackData.warning = '这是旧格式的任务，显示的是数据库状态';
  fallbackData.isOldTask = true;
  
  return fallbackData;
}
