import { useEffect, useState } from 'react';
import type { Comic } from '../types/index';
import { getApiUrl, getDefaultApiHeaders } from '../constants/api';
import * as volcengine from '../services/volcengine';
import { STYLE_THUMBNAILS } from '../constants/videoGeneration';

/**
 * 任务恢复Hook - 从数据库加载用户的历史任务并恢复轮询
 * 🔄 每15秒自动刷新一次，确保前后端状态同步
 * 🎯 数据库状态优先 - 已完成的任务不会被轮询结果覆盖
 */
export function useTaskRecovery(userPhone: string | null) {
  const [recoveredTasks, setRecoveredTasks] = useState<Comic[]>([]);
  const [isRecovering, setIsRecovering] = useState(false);

  useEffect(() => {
    if (!userPhone) {
      setRecoveredTasks([]);
      return;
    }

    let isMounted = true;
    let refreshInterval: NodeJS.Timeout | null = null;

    const recoverTasks = async () => {
      setIsRecovering(true);
      
      try {
        console.log('[Task Recovery] 🔄 Loading tasks for user:', userPhone);
        
        // 🔧 增加超时到120秒，支持冷启动和数据库查询
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
        }, 120000); // 120秒超时
        
        // 从数据库加载用户的所有任务
        const response = await fetch(getApiUrl(`/volcengine/tasks?userPhone=${encodeURIComponent(userPhone)}`), {
          headers: getDefaultApiHeaders(),
          signal: controller.signal,
        }).catch(error => {
          // 🔧 静默处理超时错误（这是正常情况，不需要警告）
          if (error.name === 'AbortError') {
            console.log('[Task Recovery] ⏰ Request timeout - server may be cold starting, will retry in 15s');
          } else {
            console.log('[Task Recovery] ⚠️ Network error:', error.name);
          }
          // 如果fetch失败，返回一个空结果而不是抛出错误
          return null;
        }).finally(() => {
          clearTimeout(timeoutId);
        });

        if (!response) {
          // 🔧 降低日志级别 - 从warn改为log
          if (isMounted) {
            setIsRecovering(false);
          }
          return;
        }

        if (!response.ok) {
          console.log(`[Task Recovery] Server returned ${response.status} - will retry in 15s`);
          if (isMounted) {
            setIsRecovering(false);
          }
          return;
        }

        const result = await response.json();
        
        if (!result.success || !result.tasks) {
          if (isMounted) {
            setIsRecovering(false);
          }
          return;
        }

        const dbTasks = result.tasks;
        console.log(`[Task Recovery] ✅ Loaded ${dbTasks.length} tasks from database`);

        // 转换为Comic格式
        const tasks: Comic[] = dbTasks.map((task: any) => {
          const thumbnail = task.thumbnail || 
                           STYLE_THUMBNAILS[task.style as keyof typeof STYLE_THUMBNAILS] || 
                           STYLE_THUMBNAILS.anime;
          
          // 🔧 严格的状态映射 - 确保 'completed' 状态被正确识别
          let mappedStatus: 'generating' | 'completed' | 'failed';
          
          if (task.status === 'completed') {
            mappedStatus = 'completed';
          } else if (task.status === 'failed') {
            mappedStatus = 'failed';
          } else if (task.status === 'processing' || task.status === 'pending' || task.status === 'generating') {
            mappedStatus = 'generating';
          } else {
            // 默认：如果状态未知，优先判断是否有视频URL
            mappedStatus = task.video_url ? 'completed' : 'generating';
          }
          
          return {
            id: task.task_id,
            taskId: task.task_id,
            title: task.prompt?.slice(0, 30) + '...' || '未命名作品',
            prompt: task.prompt || '',
            style: task.style || 'anime',
            duration: task.duration?.toString() || '5',
            thumbnail,
            videoUrl: task.video_url || '',
            createdAt: new Date(task.created_at),
            status: mappedStatus,
            userPhone: task.user_phone,
          };
        });

        if (!isMounted) return;

        // 🔄 更新任务列表（完全替换，确保数据库状态优先）
        setRecoveredTasks(tasks);

        // 对所有进行中的任务恢复轮询
        const generatingTasks = tasks.filter(t => t.status === 'generating');
        
        console.log(`[Task Recovery] 📊 Total: ${tasks.length}, Generating: ${generatingTasks.length}, Completed: ${tasks.filter(t => t.status === 'completed').length}`);
        
        if (generatingTasks.length > 0) {
          console.log(`[Task Recovery] 🔄 Resuming polling for ${generatingTasks.length} tasks`);
          
          generatingTasks.forEach((task) => {
            if (!task.taskId) {
              console.warn(`[Task Recovery] ⚠️ Task ${task.id} has no taskId, skipping`);
              return;
            }

            console.log(`[Task Recovery] 🎯 Starting poll for task: ${task.taskId}`);
            
            // 🔧 使用更长的轮询周期，减少服务器负载
            // 前端轮询主要用于实时反馈，实际状态由后台同步保证
            volcengine.pollTaskStatus(
              task.taskId,
              (status) => {
                // 🎯 关键修复：不要覆盖已完成的任务状态
                setRecoveredTasks((prev) =>
                  prev.map((t) => {
                    if (t.taskId !== task.taskId) return t;
                    
                    // 如果任务已经是 completed 或 failed，不要降级状态
                    if (t.status === 'completed' || t.status === 'failed') {
                      return t;
                    }
                    
                    // 只有在任务还在生成中时，才更新状态
                    const newStatus = status.status === 'completed' || status.status === 'success'
                      ? 'completed'
                      : status.status === 'failed' || status.status === 'error'
                      ? 'failed'
                      : 'generating';
                    
                    return {
                      ...t,
                      status: newStatus,
                      videoUrl: status.videoUrl || t.videoUrl,
                    };
                  })
                );
              },
              40, // 减少轮询次数（40次 × 15秒 = 10分钟）
              15000 // 15秒轮询间隔，减少服务器压力
            ).then((finalStatus) => {
              console.log(`[Task Recovery] ✅ Task ${task.taskId} completed`);
              
              if (!isMounted) return;
              
              setRecoveredTasks((prev) =>
                prev.map((t) =>
                  t.taskId === task.taskId
                    ? {
                        ...t,
                        status: 'completed',
                        videoUrl: finalStatus.videoUrl || t.videoUrl,
                      }
                    : t
                )
              );
            }).catch((error) => {
              // 🔧 特殊处理：任务不存在 - 静默标记为失败并停止轮询
              const isTaskNotFound = 
                error.message?.includes('任务不存在') ||
                error.message?.includes('Task not found') ||
                error.message?.includes('not found in database') ||
                error.message?.includes('已过期');
              
              if (isTaskNotFound) {
                console.log(`[Task Recovery] 📋 Task ${task.taskId} not found, quietly marking as failed`);
                
                if (!isMounted) return;
                
                // 标记任务为失败状态，不再轮询
                setRecoveredTasks((prev) =>
                  prev.map((t) =>
                    t.taskId === task.taskId
                      ? {
                          ...t,
                          status: 'failed',
                          error: '任务已过期或不存在',
                        }
                      : t
                  )
                );
                return; // 直接返回，不继续处理
              }
              
              // 其他轮询失败不标记为失败，依赖后台同步更新状态
              // 只记录非超时的错误，减少日志噪音
              if (error.message && !error.message.includes('timeout')) {
                console.log(`[Task Recovery] ⚠️ Task ${task.taskId} poll error:`, error.message);
              }
            });
          });
        }

      } catch (error: any) {
        // 减少错误日志噪音
        if (error.name !== 'AbortError') {
          console.error('[Task Recovery] ❌ Failed to recover tasks:', error.message);
        }
      } finally {
        if (isMounted) {
          setIsRecovering(false);
        }
      }
    };

    // 立即加载一次
    recoverTasks();

    // 🔄 每15秒自动刷新一次，快速同步数据库状态
    refreshInterval = setInterval(() => {
      console.log('[Task Recovery] 🔄 Auto-refresh cycle');
      recoverTasks();
    }, 15000); // 15秒

    return () => {
      isMounted = false;
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [userPhone]);

  return {
    recoveredTasks,
    isRecovering,
    setRecoveredTasks,
  };
}