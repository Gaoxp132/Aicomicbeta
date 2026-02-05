/**
 * 后台同步服务
 * 定期检查进行中的任务状态并同步到数据库
 * 
 * ⚠️ 临时禁用：正在从video_tasks表迁移到PostgreSQL新架构
 */

// import { updateVideoTaskFromVolcengine } from './database/video_tasks.tsx';

/**
 * 后台同步服务 - 定期同步火山引擎任务状态
 * ⚠️ 临时禁用，等待完成数据库迁移
 */
let syncInterval: number | null = null;
let isSyncing = false;

export function startBackgroundSync() {
  console.log('[BackgroundSync] ⏸️ Background sync is temporarily disabled during database migration');
  return; // 临时禁用
  
  /* 原代码保留，迁移完成后恢复
  if (syncInterval) {
    clearInterval(syncInterval);
  }
  
  console.log('[BackgroundSync] 🚀 Starting background sync service (interval: 30s)');
  
  // 延迟5秒后首次执行，避免启动时负载过大
  setTimeout(() => {
    syncPendingTasks();
  }, 5000);
  
  // 每30秒执行一次
  syncInterval = setInterval(() => {
    syncPendingTasks();
  }, 30 * 1000); // 30秒
  */
}

export function stopBackgroundSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('[BackgroundSync] ⏹️ Background sync service stopped');
  }
}

async function syncPendingTasks() {
  // 如果正在同步，跳过本次
  if (isSyncing) {
    console.log('[BackgroundSync] ⏭️ Already syncing, skipping this cycle');
    return;
  }
  
  isSyncing = true;
  
  try {
    console.log('[BackgroundSync] 🔄 Syncing pending tasks...');
    
    // 从数据库获取所有进行中的任务
    const { getAllProcessingTasks } = await import('./database/video_tasks.tsx');
    const tasks = await getAllProcessingTasks();
    
    if (tasks.length === 0) {
      console.log('[BackgroundSync] ✅ No pending tasks to sync');
      return;
    }
    
    console.log(`[BackgroundSync] 📋 Found ${tasks.length} pending tasks`);
    
    // 串行处理每个任务（避免并发过多）
    for (const task of tasks) {
      try {
        console.log(`[BackgroundSync] 🔄 Syncing task ${task.task_id}...`);
        await updateVideoTaskFromVolcengine(task.task_id);
        
        // 每个任务之间等待1秒，避免API限流
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error: any) {
        console.error(`[BackgroundSync] ⚠️ Failed to sync task ${task.task_id}:`, error.message);
        // 继续处理下一个任务
      }
    }
    
    console.log('[BackgroundSync] ✅ Sync cycle completed');
  } catch (error: any) {
    console.error('[BackgroundSync] ❌ Sync error:', error.message);
  } finally {
    isSyncing = false;
  }
}

/**
 * 🆕 启动定期自动转存任务
 * 每2分钟检查一次是否有待转存的视频（确保24小时内转存）
 */
let autoTransferInterval: number | null = null;

export function startAutoTransfer() {
  if (autoTransferInterval) {
    clearInterval(autoTransferInterval);
  }
  
  console.log('[AutoTransfer] 🚀 Starting auto-transfer service (interval: 2 minutes)');
  
  // 延迟10秒后首次执行，避免启动时负载过大
  setTimeout(() => {
    autoTransferPendingVideos();
  }, 10000);
  
  // 每2分钟执行一次（确保视频在24小时内被转存到OSS）
  autoTransferInterval = setInterval(() => {
    autoTransferPendingVideos();
  }, 2 * 60 * 1000); // 2分钟
}

export function stopAutoTransfer() {
  if (autoTransferInterval) {
    clearInterval(autoTransferInterval);
    autoTransferInterval = null;
    console.log('[AutoTransfer] ⏹️ Auto-transfer service stopped');
  }
}

let isTransferring = false;

async function autoTransferPendingVideos() {
  // 如果正在转存，跳过本次
  if (isTransferring) {
    console.log('[AutoTransfer] ⏭️ Already transferring, skipping this cycle');
    return;
  }
  
  isTransferring = true;
  
  try {
    console.log('[AutoTransfer] 🔄 Checking for videos to transfer...');
    
    const { autoTransferPendingVideos: doTransfer } = await import('./routes_video_transfer.tsx');
    const result = await doTransfer();
    
    console.log(`[AutoTransfer] ✅ Transfer cycle completed: ${result.transferred} transferred, ${result.skipped} skipped`);
  } catch (error: any) {
    console.error('[AutoTransfer] ❌ Transfer error:', error.message);
  } finally {
    isTransferring = false;
  }
}