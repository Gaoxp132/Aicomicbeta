import { useState, useEffect } from 'react';
import type { Comic } from '../App';
import * as volcengine from '../services/volcengine';
import { publishToCommunity } from '../services/community';
import { buildApiUrl, getDefaultApiHeaders, getApiUrl } from '../constants/api';
import { STYLE_THUMBNAILS } from '../constants/videoGeneration';
import { estimateGenerationTime } from '../utils/formatters';
import { useTaskRecovery } from './useTaskRecovery';

interface GenerateParams {
  prompt: string;
  style: string;
  duration: string;
  imageUrls?: string[];
  resolution?: string;
  fps?: number;
  enableAudio?: boolean;
  model?: string;
}

export function useVideoGeneration(userPhone: string) {
  const [comics, setComics] = useState<Comic[]>([]);
  
  // 🔄 任务恢复 - 从数据库加载历史任务
  const { recoveredTasks, isRecovering, setRecoveredTasks } = useTaskRecovery(userPhone);
  
  // 🔧 直接使用数据库恢复的任务，确保前后端状态完全一致
  // recoveredTasks 每15秒会自动刷新，所以 comics 也会自动更新
  useEffect(() => {
    if (recoveredTasks.length > 0) {
      console.log(`[Video Generation] Syncing ${recoveredTasks.length} tasks from database`);
      setComics(recoveredTasks);
    } else if (!userPhone) {
      // 🔧 用户注销时清空任务列表
      console.log('[Video Generation] User logged out, clearing tasks');
      setComics([]);
    }
  }, [recoveredTasks, userPhone]);

  const handleGenerate = async (data: GenerateParams) => {
    // ✨ 计算当前活跃任务数（generating状态）
    const activeTasksCount = comics.filter(c => c.status === 'generating').length;
    
    // 🚨 限制最多3个并发任务
    if (activeTasksCount >= 3) {
      console.log('[Video Generation] ⚠️ Maximum 3 concurrent tasks allowed');
      return false;
    }

    if (!userPhone) {
      console.error('User not logged in');
      return false;
    }
    
    // 健康检查
    try {
      const healthCheck = await fetch(buildApiUrl('/health'), {
        headers: getDefaultApiHeaders(),
      });
      
      if (!healthCheck.ok) {
        console.error('Backend service unavailable');
        return false;
      }
      
      const healthData = await healthCheck.json();
      
      if (!healthData.apiKeyConfigured) {
        console.error('Video generation service not configured');
        return false;
      }
    } catch (healthError) {
      console.error('Cannot connect to backend service');
      return false;
    }
    
    const durationNum = parseInt(data.duration) || 5;
    const estimatedMinutes = estimateGenerationTime(durationNum);
    
    const thumbnail = data.imageUrls?.[0] || STYLE_THUMBNAILS[data.style as keyof typeof STYLE_THUMBNAILS] || STYLE_THUMBNAILS.anime;
    
    const newComic: Comic = {
      id: Date.now().toString(),
      title: data.prompt.slice(0, 30) + '...',
      prompt: data.prompt,
      style: data.style,
      duration: data.duration,
      thumbnail: thumbnail,
      videoUrl: '',
      createdAt: new Date(),
      status: 'generating',
      imageUrls: data.imageUrls,
      resolution: data.resolution,
      fps: data.fps,
      enableAudio: data.enableAudio,
      model: data.model,
      userPhone: userPhone,
    };

    setComics((prev) => [newComic, ...prev]);

    try {
      const result = await volcengine.createVideoTask({
        prompt: data.prompt,
        style: data.style,
        duration: data.duration,
        imageUrls: data.imageUrls,
        resolution: data.resolution,
        fps: data.fps,
        enableAudio: data.enableAudio,
        model: data.model,
        userPhone: userPhone,
      });

      // 检查result是否有效
      if (!result) {
        throw new Error('服务器返回空数据，请重试');
      }

      const taskId = result.id || result.task_id;
      
      // 再次检查taskId
      if (!taskId) {
        console.error('无法从result中提取taskId:', result);
        throw new Error('无法获取任务ID，请检查后端服务');
      }
      
      // 🔧 关键修复：更新任务的 id 和 taskId，确保与数据库中的ID一致
      // 这样刷新页面后，从数据库恢复的任务ID可以正确匹配
      setComics((prev) =>
        prev.map((c) => (c.id === newComic.id ? { ...c, id: taskId, taskId } : c))
      );

      // 任务创建成功后静默处理，进度在右上角查看

      volcengine.pollTaskStatus(
        taskId,
        (status) => {
          // 🎯 关键修复：不要覆盖已完成的任务状态
          setComics((prev) =>
            prev.map((c) => {
              // 🔧 使用 taskId 匹配，因为 id 已经更新为 taskId
              if (c.taskId !== taskId && c.id !== taskId) return c;
              
              // 如果任务已经是 completed 或 failed，不要降级状态
              if (c.status === 'completed' || c.status === 'failed') {
                console.log(`[Video Generation] ⏭️ Task ${c.id} already ${c.status}, skipping status update`);
                return c;
              }
              
              // 只有在任务还在生成中时，才更新状态
              const newStatus = status.status === 'completed' || status.status === 'success'
                ? 'completed'
                : status.status === 'failed' || status.status === 'error'
                ? 'failed'
                : 'generating';
              
              console.log(`[Video Generation] Updating task ${c.id}: ${c.status} -> ${newStatus}`);
              
              return {
                ...c,
                status: newStatus,
                videoUrl: status.videoUrl || c.videoUrl,
              };
            })
          );
        },
        120,
        5000
      ).then(async (finalStatus) => {
        const updatedComic = {
          ...newComic,
          id: taskId, // 🔧 确保使用正确的 taskId
          status: 'completed' as const,
          videoUrl: finalStatus.videoUrl || '',
          taskId,
        };
        
        setComics((prev) =>
          prev.map((c) => (c.taskId === taskId || c.id === taskId ? updatedComic : c))
        );
        
        if (finalStatus.videoUrl && userPhone) {
          try {
            // 🔧 验证 videoUrl 是否有效（不是taskId）
            console.log('[OSS Transfer] finalStatus:', finalStatus);
            console.log('[OSS Transfer] taskId:', taskId);
            console.log('[OSS Transfer] videoUrl:', finalStatus.videoUrl);
            
            // 检查 videoUrl 是否看起来像URL而不是taskId
            const isValidUrl = finalStatus.videoUrl.startsWith('http://') || finalStatus.videoUrl.startsWith('https://');
            
            if (!isValidUrl) {
              console.error('[OSS Transfer] ❌ Invalid videoUrl (not a URL):', finalStatus.videoUrl);
              console.error('[OSS Transfer] Skipping OSS transfer');
              
              // 直接发布到社区，使用火山引擎URL
              await publishToCommunity({
                phone: userPhone,
                taskId,
                title: newComic.title,
                prompt: newComic.prompt,
                style: newComic.style,
                duration: newComic.duration,
                thumbnail: newComic.thumbnail,
                videoUrl: finalStatus.videoUrl,
              });
              return;
            }
            
            // ✨ 自动转存到阿里云OSS（静默处理，不提示用户）
            const transferResponse = await fetch(getApiUrl('/video/transfer'), {
              method: 'POST',
              headers: getDefaultApiHeaders(),
              body: JSON.stringify({
                taskId,
                volcengineUrl: finalStatus.videoUrl,
              }),
            });
            
            const transferResult = await transferResponse.json();
            
            let finalVideoUrl = finalStatus.videoUrl;
            
            if (transferResult.success && transferResult.data?.ossUrl) {
              finalVideoUrl = transferResult.data.ossUrl;
              console.log('✅ 视频已转存到阿里云OSS:', finalVideoUrl);
              
              // 更新本地状态中的URL
              setComics((prev) =>
                prev.map((c) => ((c.taskId === taskId || c.id === taskId) ? { ...c, videoUrl: finalVideoUrl } : c))
              );
            } else {
              console.warn('⚠️ 视频转存失败，使用火山引擎URL:', transferResult.error);
            }
            
            // 发布到社区（使用OSS URL或原始URL）
            await publishToCommunity({
              phone: userPhone,
              taskId,
              title: newComic.title,
              prompt: newComic.prompt,
              style: newComic.style,
              duration: newComic.duration,
              thumbnail: newComic.thumbnail,
              videoUrl: finalVideoUrl,
            });
          } catch (publishError) {
            console.error('自动发布失败:', publishError);
          }
        }
      }).catch((error) => {
        if (error.message.includes('网络连接问题') || error.message.includes('轮询超时') || 
            error.message.includes('请求超时') || error.message.includes('timeout')) {
          console.log('Task is being processed in background');
        } else {
          console.error('Video generation failed:', error.message);
          setComics((prev) =>
            prev.map((c) => ((c.taskId === taskId || c.id === taskId) ? { ...c, status: 'failed' as const } : c))
          );
        }
      });

      return true;
    } catch (error: any) {
      console.error('Failed to create task:', error.message);
      setComics((prev) =>
        prev.map((c) => (c.id === newComic.id ? { ...c, status: 'failed' as const } : c))
      );
      return false;
    }
  };

  const activeTasks = comics.filter(c => c.status === 'generating');

  return {
    comics,
    setComics,
    activeTasks,
    handleGenerate,
  };
}