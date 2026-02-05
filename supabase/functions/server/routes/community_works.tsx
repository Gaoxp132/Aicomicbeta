import type { Hono } from "npm:hono";

// 导入处理器
import { getCommunityWorks } from "./handlers/community_works_list.tsx";
import { getUserWorks, deleteUserWork } from "./handlers/community_works_user.tsx";
import { 
  batchCheckWorksStatus, 
  batchCheckTasksStatus, 
  cleanupFailedTasks 
} from "./handlers/community_works_batch.tsx";

/**
 * 注册社区作品相关路由
 */
export function registerCommunityWorksRoutes(app: Hono) {
  const PREFIX = "/make-server-fc31472c";
  
  console.log('[Community Works Routes] Starting registration...');
  
  try {
    // 📋 获取社区作品列表
    console.log('[Community Works Routes] Registering GET /community/works...');
    app.get('/community/works', getCommunityWorks);
    app.get(`${PREFIX}/community/works`, getCommunityWorks);
    console.log('[Community Works Routes] ✅ GET /community/works registered');
    
    // 👤 获取指定用户的作品列表
    console.log('[Community Works Routes] Registering GET /community/user/:phone/works...');
    app.get('/community/user/:phone/works', getUserWorks);
    app.get(`${PREFIX}/community/user/:phone/works`, getUserWorks);
    console.log('[Community Works Routes] ✅ GET /community/user/:phone/works registered');
    
    // 🗑️ 删除用户作品
    console.log('[Community Works Routes] Registering DELETE /community/user/:phone/works/:taskId...');
    app.delete('/community/user/:phone/works/:taskId', deleteUserWork);
    app.delete(`${PREFIX}/community/user/:phone/works/:taskId`, deleteUserWork);
    console.log('[Community Works Routes] ✅ DELETE /community/user/:phone/works/:taskId registered');
    
    // 🔄 批量查询作品状态
    console.log('[Community Works Routes] Registering POST /community/works/batch-status...');
    app.post('/community/works/batch-status', batchCheckWorksStatus);
    app.post(`${PREFIX}/community/works/batch-status`, batchCheckWorksStatus);
    console.log('[Community Works Routes] ✅ POST /community/works/batch-status registered');
    
    // 🔄 批量查询任务状态（含火山引擎同步）
    console.log('[Community Works Routes] Registering POST /community/tasks/batch-status...');
    app.post('/community/tasks/batch-status', batchCheckTasksStatus);
    app.post(`${PREFIX}/community/tasks/batch-status`, batchCheckTasksStatus);
    console.log('[Community Works Routes] ✅ POST /community/tasks/batch-status registered');
    
    // 🧹 清理失败的任务
    console.log('[Community Works Routes] Registering POST /community/tasks/cleanup-failed...');
    app.post('/community/tasks/cleanup-failed', cleanupFailedTasks);
    app.post(`${PREFIX}/community/tasks/cleanup-failed`, cleanupFailedTasks);
    console.log('[Community Works Routes] ✅ POST /community/tasks/cleanup-failed registered');
    
    console.log('[Community Works Routes] ✅ All routes registered successfully');
  } catch (error: any) {
    console.error('[Community Works Routes] ❌ Registration failed:', error);
    console.error('[Community Works Routes] ❌ Error details:', {
      message: error.message,
      stack: error.stack,
    });
    throw error;
  }
}