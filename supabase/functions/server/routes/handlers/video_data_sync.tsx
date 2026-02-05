import type { Context } from "npm:hono";
import { supabase } from "../../database/client.tsx";
import * as db from "../../database/series.tsx";

/**
 * 同步单个漫剧的视频数据
 * POST /series/:id/sync-video-data
 */
export async function syncSeriesVideoData(c: Context) {
  const seriesId = c.req.param('id');
  
  try {
    console.log(`[Video Data Sync] 🔄 Syncing series: ${seriesId}`);
    
    // 🔍 先获取所有video_tasks（不限制series_id）
    console.log(`[Video Data Sync] 📊 Fetching ALL video_tasks...`);
    
    const { data: allVideoTasks, error: allTasksError } = await supabase
      .from('video_tasks')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (allTasksError) {
      console.error('[Video Data Sync] ❌ Error fetching video_tasks:', allTasksError);
    }
    
    console.log(`[Video Data Sync] 📊 Total video_tasks in DB: ${allVideoTasks?.length || 0}`);
    
    // 🔍 从generation_metadata中过滤属于当前series的tasks
    const seriesVideoTasks = allVideoTasks?.filter(task => {
      try {
        const metadata = task.generation_metadata ? JSON.parse(task.generation_metadata) : null; // 🔥 v4.2.67: 使用 generation_metadata
        return metadata?.seriesId === seriesId;
      } catch (e) {
        return false;
      }
    }) || [];
    
    console.log(`[Video Data Sync] 📊 Filtered video_tasks for series ${seriesId}: ${seriesVideoTasks.length}`);
    
    // 获取所有剧集及分镜
    const { data: episodes, error: episodesError } = await supabase
      .from('series_episodes')
      .select(`
        id,
        episode_number,
        title
      `)
      .eq('series_id', seriesId)
      .order('episode_number', { ascending: true });
    
    if (episodesError) throw episodesError;
    
    let synced = 0;
    let errors = 0;
    let skipped = 0;
    let alreadyHasVideo = 0;
    let noTaskId = 0;
    let syncedByStoryboardId = 0; // 通过storyboard_id同步
    let syncedByMetadata = 0; // 通过metadata组合同步
    let fixedHistoricalLinks = 0; // 修复历史关联
    
    for (const episode of episodes) {
      const storyboards = await db.getEpisodeStoryboards(episode.id);
      console.log(`[Video Data Sync] 📊 Episode ${episode.episode_number}: ${storyboards.length} storyboards`);
      
      for (const sb of storyboards) {
        // 统计状态
        if (sb.video_url) {
          alreadyHasVideo++;
          console.log(`[Video Data Sync] ⏭️  Storyboard ${sb.id} already has video_url`);
          continue;
        }
        
        // 🆕 详细输出当前storyboard信息
        console.log(`[Video Data Sync] 📍 Processing storyboard:`, {
          id: sb.id,
          scene_number: sb.scene_number,
          video_task_id: sb.video_task_id,
          status: sb.status,
          episode_id: episode.id,
          series_id: seriesId,
        });
        
        // 🆕 策略0: 修复历史关联（如果没有video_task_id，先尝试从video_tasks反向查找并修复）
        if (!sb.video_task_id) {
          console.log(`[Video Data Sync] 🔧 Strategy 0: Fixing historical link for storyboard: ${sb.id}`);
          
          const { data: historicalTask, error: histError } = await supabase
            .from('video_tasks')
            .select('task_id, video_url, status')
            .eq('storyboard_id', sb.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          console.log(`[Video Data Sync] 🔍 Strategy 0 result for ${sb.id}:`, {
            found: !!historicalTask,
            error: histError?.message,
            taskId: historicalTask?.task_id,
            hasVideoUrl: !!historicalTask?.video_url,
          });
          
          if (!histError && historicalTask) {
            console.log(`[Video Data Sync] 🎯 Found historical task! Fixing link: ${historicalTask.task_id}`);
            
            // 只更新video_url和status（不更新task_id，因为表中没有此列）
            await db.updateStoryboard(sb.id, {
              video_url: historicalTask.video_url || sb.video_url,
              status: historicalTask.status === 'completed' ? 'completed' : sb.status,
            });
            
            fixedHistoricalLinks++;
            
            // 如果有video_url，算作同步成功
            if (historicalTask.video_url) {
              synced++;
            }
            
            // 更新sb对象，继续后续检查
            sb.video_task_id = historicalTask.task_id;
            sb.video_url = historicalTask.video_url || sb.video_url;
            
            // 如果已经有video_url，跳过后续策略
            if (sb.video_url) {
              console.log(`[Video Data Sync] ✅ Historical link fixed with video_url`);
              continue;
            }
          } else if (histError) {
            console.error(`[Video Data Sync] ⚠️  Strategy 0 error for ${sb.id}:`, histError);
          } else {
            console.log(`[Video Data Sync] 🔍 Strategy 0: No historical task found for storyboard ${sb.id}`);
          }
        }
        
        // 策略1: 通过video_task_id查找（双向关联）
        if (sb.video_task_id) {
          console.log(`[Video Data Sync] 🔍 Strategy 1: Checking video_task_id: ${sb.video_task_id}`);
          
          const { data: task, error: taskError } = await supabase
            .from('video_tasks')
            .select('video_url, status')
            .eq('task_id', sb.video_task_id)
            .single();
          
          if (taskError && taskError.code !== 'PGRST116') {
            console.error(`[Video Data Sync] ❌ Error fetching task ${sb.video_task_id}:`, taskError);
            errors++;
            continue;
          }
          
          if (task?.video_url) {
            console.log(`[Video Data Sync] ✅ Found video_url for task ${sb.video_task_id}, syncing...`);
            await db.updateStoryboard(sb.id, {
              video_url: task.video_url,
              status: task.status === 'completed' ? 'completed' : sb.status,
            });
            synced++;
            continue;
          } else {
            console.log(`[Video Data Sync] ⏭️  Task ${sb.video_task_id} has no video_url (status: ${task?.status || 'not found'})`);
          }
        }
        
        // 策略2: 通过storyboard_id反向查找（如果video_tasks表有此字段）
        console.log(`[Video Data Sync] 🔍 Strategy 2: Reverse lookup by storyboard_id: ${sb.id}`);
        
        const { data: taskByStoryboard, error: reverseError } = await supabase
          .from('video_tasks')
          .select('task_id, video_url, status, storyboard_id')
          .eq('storyboard_id', sb.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (!reverseError && taskByStoryboard?.video_url) {
          console.log(`[Video Data Sync] 🎯 Found video via reverse lookup! task_id: ${taskByStoryboard.task_id}`);
          
          // 只更新video_url和status
          await db.updateStoryboard(sb.id, {
            video_url: taskByStoryboard.video_url,
            status: taskByStoryboard.status === 'completed' ? 'completed' : sb.status,
          });
          
          syncedByStoryboardId++;
          synced++;
          continue;
        }
        
        // 策略3: 通过metadata匹配（从seriesVideoTasks中过滤该episode的tasks）
        console.log(`[Video Data Sync] 🔍 Strategy 3: Lookup by metadata for episode: ${episode.id}`);
        
        // 🔍 从seriesVideoTasks中过滤出属于该episode的tasks
        const episodeVideoTasks = seriesVideoTasks.filter(task => {
          try {
            const metadata = task.generation_metadata ? JSON.parse(task.generation_metadata) : null; // 🔥 v4.2.67: 使用 generation_metadata
            return metadata?.episodeId === episode.id;
          } catch (e) {
            return false;
          }
        });
        
        console.log(`[Video Data Sync] 🔍 Strategy 3: Found ${episodeVideoTasks.length} tasks for episode ${episode.episode_number}`);
        
        // 🆕 增强匹配：从metadata中提取storyboardId或storyboardNumber
        let matchedForCurrentSb = false; // 🔧 新增：记录当前storyboard是否匹配成功
        
        for (const task of episodeVideoTasks) {
          try {
            const metadata = task.generation_metadata ? JSON.parse(task.generation_metadata) : null; // 🔥 v4.2.67: 使用 generation_metadata
            const storyboardId = metadata?.storyboardId;
            const storyboardNumber = metadata?.storyboardNumber;
            
            console.log(`[Video Data Sync] 🔍 Checking task ${task.task_id}:`, {
              metadataRaw: task.generation_metadata?.substring(0, 100), // 🆕 输出原始metadata前100字符
              storyboardId,
              storyboardNumber,
              storyboardIdInColumn: task.storyboard_id, // 🆕 输出列值
              targetId: sb.id,
              targetNumber: sb.scene_number,
              hasVideoUrl: !!task.video_url,
            });
            
            // 🎯 匹配策略1：通过storyboardId精确匹配（最优先）
            if (storyboardId === sb.id) {
              console.log(`[Video Data Sync] 🎯 Found matching video via metadata.storyboardId! task_id: ${task.task_id}`);
              
              // 只更新video_url和status
              await db.updateStoryboard(sb.id, {
                video_url: task.video_url || sb.video_url,
                status: task.status === 'completed' ? 'completed' : sb.status,
              });
              
              syncedByMetadata++;
              if (task.video_url) {
                synced++;
              }
              matchedForCurrentSb = true; // 🔧 标记为已匹配
              break; // 找到就跳出循环
            }
            
            // 🎯 匹配策略2：通过storyboardNumber匹配（次优先）
            if (storyboardNumber === sb.scene_number) {
              console.log(`[Video Data Sync] 🎯 Found matching video via metadata.storyboardNumber! task_id: ${task.task_id}`);
              
              // 只更新video_url和status
              await db.updateStoryboard(sb.id, {
                video_url: task.video_url || sb.video_url,
                status: task.status === 'completed' ? 'completed' : sb.status,
              });
              
              syncedByMetadata++;
              if (task.video_url) {
                synced++;
              }
              matchedForCurrentSb = true; // 🔧 标记为已匹配
              break; // 找到就跳出循环
            }
          } catch (parseError) {
            console.error(`[Video Data Sync] ⚠️  Error parsing metadata for task ${task.task_id}:`, parseError);
          }
        }
        
        // 检查是否已经同步
        if (matchedForCurrentSb) {
          continue; // 已经同步，跳到下一个storyboard
        }
        
        // 所有策略都没找到
        if (!sb.task_id) {
          noTaskId++;
          console.log(`[Video Data Sync] ⚠️  Storyboard ${sb.id} has no task_id and no video_tasks match`);
        } else {
          skipped++;
          console.log(`[Video Data Sync] ⏭️  No video found for storyboard ${sb.id}`);
        }
      }
    }
    
    console.log(`[Video Data Sync] ✅ Sync complete for series ${seriesId}`);
    console.log(`[Video Data Sync] 📊 Stats: synced=${synced}, fixedHistoricalLinks=${fixedHistoricalLinks}, alreadyHasVideo=${alreadyHasVideo}, noTaskId=${noTaskId}, skipped=${skipped}, errors=${errors}`);
    
    return c.json({
      success: true,
      data: {
        seriesId,
        synced,
        errors,
        stats: {
          alreadyHasVideo,
          noTaskId,
          skipped,
          syncedByStoryboardId,
          syncedByMetadata,
          fixedHistoricalLinks, // 修复历史关联
        },
      },
    });
    
  } catch (error: any) {
    console.error('[Video Data Sync] ❌ Sync error:', error);
    return c.json({
      success: false,
      error: error.message || '同步失败',
    }, 500);
  }
}

/**
 * 批量同步用户的视频数据
 * POST /series/batch-sync-video-data
 */
export async function batchSyncVideoData(c: Context) {
  try {
    const userPhone = c.req.header('x-user-phone') || c.req.query('userPhone');
    
    if (!userPhone) {
      return c.json({ error: '缺少用户手机号' }, 400);
    }
    
    console.log(`[Video Data Sync] 🔄 Batch syncing for user: ${userPhone}`);
    
    // 获取用户所有漫剧
    const seriesList = await db.getUserSeries(userPhone);
    
    let totalSynced = 0;
    let totalErrors = 0;
    
    for (const series of seriesList) {
      const episodes = await db.getSeriesEpisodes(series.id);
      
      for (const episode of episodes) {
        const storyboards = await db.getEpisodeStoryboards(episode.id);
        
        for (const sb of storyboards) {
          if (sb.video_task_id && !sb.video_url) {
            try {
              const { data: task } = await supabase
                .from('video_tasks')
                .select('video_url, status')
                .eq('task_id', sb.video_task_id)
                .single();
              
              if (task?.video_url) {
                await db.updateStoryboard(sb.id, {
                  video_url: task.video_url,
                  status: task.status === 'completed' ? 'completed' : sb.status,
                });
                totalSynced++;
              }
            } catch (err) {
              totalErrors++;
            }
          }
        }
      }
    }
    
    console.log(`[Video Data Sync] ✅ Batch sync complete: ${totalSynced} synced, ${totalErrors} errors`);
    
    return c.json({
      success: true,
      data: {
        userPhone,
        totalSeries: seriesList.length,
        synced: totalSynced,
        errors: totalErrors,
      },
    });
    
  } catch (error: any) {
    console.error('[Video Data Sync] ❌ Batch sync error:', error);
    return c.json({
      success: false,
      error: error.message || '批量同步失败',
    }, 500);
  }
}

/**
 * 诊断漫剧的视频数据状态
 * GET /series/:id/diagnose-video-data-status
 */
export async function diagnoseVideoDataStatus(c: Context) {
  const seriesId = c.req.param('id');
  
  try {
    console.log(`[Video Data Sync] 🔍 Diagnosing series: ${seriesId}`);
    
    // 获取所有剧集及分镜
    const { data: episodes, error: episodesError } = await supabase
      .from('series_episodes')
      .select(`
        id,
        episode_number,
        title
      `)
      .eq('series_id', seriesId)
      .order('episode_number', { ascending: true });
    
    if (episodesError) throw episodesError;
    
    const diagnosis: any[] = [];
    let totalStoryboards = 0;
    let withVideo = 0;
    let withTaskId = 0;
    let withoutVideo = 0;
    
    for (const episode of episodes || []) {
      const { data: storyboards } = await supabase
        .from('series_storyboards')
        .select('id, scene_number, video_task_id, video_url, status')
        .eq('episode_id', episode.id)
        .order('scene_number', { ascending: true });
      
      if (!storyboards || storyboards.length === 0) continue;
      
      const episodeStats = {
        episodeNumber: episode.episode_number,
        title: episode.title,
        totalStoryboards: storyboards.length,
        withVideo: 0,
        withTaskId: 0,
        withoutVideo: 0,
        storyboards: [] as any[],
      };
      
      for (const sb of storyboards) {
        totalStoryboards++;
        
        const sbInfo: any = {
          sceneNumber: sb.scene_number,
          hasVideo: !!sb.video_url,
          hasTaskId: !!sb.video_task_id,
          status: sb.status,
        };
        
        if (sb.video_url) {
          withVideo++;
          episodeStats.withVideo++;
        } else {
          withoutVideo++;
          episodeStats.withoutVideo++;
        }
        
        if (sb.video_task_id) {
          withTaskId++;
          episodeStats.withTaskId++;
          
          // 查询video_tasks表
          const { data: task } = await supabase
            .from('video_tasks')
            .select('video_url, status')
            .eq('task_id', sb.video_task_id)
            .single();
          
          if (task) {
            sbInfo.taskVideoUrl = task.video_url;
            sbInfo.taskStatus = task.status;
            sbInfo.needsSync = !sb.video_url && !!task.video_url;
          }
        }
        
        episodeStats.storyboards.push(sbInfo);
      }
      
      diagnosis.push(episodeStats);
    }
    
    return c.json({
      success: true,
      data: {
        seriesId,
        summary: {
          totalEpisodes: episodes?.length || 0,
          totalStoryboards,
          withVideo,
          withTaskId,
          withoutVideo,
          syncNeeded: withoutVideo > 0 && withTaskId > 0,
        },
        episodes: diagnosis,
      },
    });
    
  } catch (error: any) {
    console.error('[Video Data Sync] ❌ Diagnosis error:', error);
    return c.json({
      success: false,
      error: error.message || '诊断失败',
    }, 500);
  }
}