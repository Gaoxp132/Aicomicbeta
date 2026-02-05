/**
 * 调试工具Handler
 * 从 video/task_query.tsx 提取调试相关函数
 */

import type { Context } from "npm:hono";
import * as kv from "../../kv_store.tsx";
import { API_CONFIG } from "../constants.tsx";
import { fetchWithRetry } from "../../utils.tsx";

/**
 * 调试任务（查看KV存储中的任务数据）
 */
export async function debugTask(c: Context) {
  try {
    const taskId = c.req.param("taskId");
    const taskData = await kv.get(`task:${taskId}`);

    if (!taskData) {
      return c.json({ error: "任务不存在" }, 404);
    }

    console.log("Debug task data:", JSON.stringify(taskData, null, 2));
    return c.json({ success: true, data: taskData });
  } catch (error) {
    console.log("Error in debug endpoint:", error);
    return c.json({ error: String(error) }, 500);
  }
}

/**
 * 直接查询火山引擎任务状态（用于后台同步）
 * @param volcengineTaskId - 火山引擎任务ID
 * @returns 任务状态信息
 */
export async function getVideoTask(volcengineTaskId: string) {
  try {
    console.log(`[getVideoTask] Querying Volcengine for task: ${volcengineTaskId}`);
    
    if (!volcengineTaskId || volcengineTaskId === 'undefined' || volcengineTaskId === 'null') {
      throw new Error('Invalid volcengine task ID');
    }
    
    const volcengineUrl = `${API_CONFIG.BASE_URL}/${volcengineTaskId}`;
    console.log(`[getVideoTask] URL: ${volcengineUrl}`);
    
    const apiKey = Deno.env.get("VOLCENGINE_API_KEY");
    if (!apiKey) {
      throw new Error('VOLCENGINE_API_KEY not configured');
    }
    
    // 使用增强的重试机制
    const response = await fetchWithRetry(
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
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[getVideoTask] API error: ${response.status} ${errorText}`);
      throw new Error(`API returned ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    console.log(`[getVideoTask] ✅ Task status: ${data.data?.status || 'unknown'}`);
    
    return data;
  } catch (error: any) {
    console.error(`[getVideoTask] ❌ Error:`, error.message);
    throw error;
  }
}
