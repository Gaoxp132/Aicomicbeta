/**
 * 任务查询路由（重构版）
 * 已重构：拆分为多个模块
 * - query/task_fetcher.tsx: 任务获取工具
 * - query/api_client.tsx: API客户端
 * - query/response_processor.tsx: 响应处理
 * - query/single_task_handler.tsx: 单个任务查询
 * - query/batch_handler.tsx: 批量任务查询
 * - query/user_tasks_handler.tsx: 用户任务列表
 * - query/debug_handler.tsx: 调试工具
 * 
 * 注意：此文件为video/task_query.tsx的重构版本
 * 原文件(881行)保留为备份
 */

// 导出所有Handler函数
export { queryTaskStatus } from "./query/single_task_handler.tsx";
export { batchQueryTaskStatus } from "./query/batch_handler.tsx";
export { getUserTasks } from "./query/user_tasks_handler.tsx";
export { debugTask, getVideoTask } from "./query/debug_handler.tsx";

// 导出工具函数（供其他模块使用）
export {
  fetchTaskFromDB,
  isTaskCompleted,
  isTaskStuck,
  formatTaskResponse,
  getVolcengineTaskId,
} from "./query/task_fetcher.tsx";

export {
  queryVolcengineTask,
  isNetworkError,
  buildFallbackResponse,
  buildOldTaskResponse,
} from "./query/api_client.tsx";

export {
  parseApiResponse,
  handleApiError,
  extractVideoInfo,
  handleVideoTransfer,
  updateTaskInDB,
  buildSuccessResponse,
} from "./query/response_processor.tsx";

console.log('[task_query_refactored.tsx] ✅ All query handlers loaded successfully');
console.log('[task_query_refactored.tsx] 📋 Module summary:');
console.log('[task_query_refactored.tsx]   Task Fetcher: 5 functions');
console.log('[task_query_refactored.tsx]   API Client: 4 functions');
console.log('[task_query_refactored.tsx]   Response Processor: 6 functions');
console.log('[task_query_refactored.tsx]   Handlers: 5 functions');
console.log('[task_query_refactored.tsx]   Total: 20 exported functions');
