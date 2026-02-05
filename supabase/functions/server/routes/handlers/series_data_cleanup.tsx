/**
 * 漫剧数据清理和修复工具
 * 用于修复异常数据、清理重复数据、恢复数据完整性
 */

import type { Context } from "npm:hono";
import * as db from "../../database/index.tsx";
import { supabase } from "../../database/client.tsx";

/**
 * 诊断并修复数据问题
 * POST /make-server-fc31472c/series/:id/fix-data
 */
export async function fixSeriesData(c: Context) {
  const seriesId = c.req.param("id");
  
  try {
    console.log('[DataCleanup] 🔧 Starting data fix for series:', seriesId);
    
    const issues: string[] = [];
    const fixes: string[] = [];
    
    // 1. 检查Series是否存在
    const series = await db.getSeries(seriesId);
    if (!series) {
      return c.json({ 
        success: false,
        error: 'Series not found' 
      }, 404);
    }
    
    console.log('[DataCleanup] Series found:', series.title);
    
    // 2. 检查并修复重复角色
    console.log('[DataCleanup] Checking for duplicate characters...');
    const characters = await db.getSeriesCharacters(seriesId);
    const characterNames = new Map<string, any[]>();
    
    for (const char of characters) {
      const name = char.name.trim().toLowerCase();
      if (!characterNames.has(name)) {
        characterNames.set(name, []);
      }
      characterNames.get(name)!.push(char);
    }
    
    // 删除重复角色（保留第一个）
    for (const [name, chars] of characterNames) {
      if (chars.length > 1) {
        issues.push(`发现重复角色: ${name} (${chars.length}个)`);
        console.log('[DataCleanup] Found duplicate characters:', name, chars.length);
        
        // 保留created_at最早的
        chars.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        const toKeep = chars[0];
        const toDelete = chars.slice(1);
        
        for (const char of toDelete) {
          await db.deleteCharacter(char.id);
          fixes.push(`删除重复角色: ${char.name} (${char.id})`);
          console.log('[DataCleanup] Deleted duplicate character:', char.id);
        }
      }
    }
    
    // 3. 检查并修复重复剧集
    console.log('[DataCleanup] Checking for duplicate episodes...');
    const episodes = await db.getSeriesEpisodes(seriesId);
    const episodeNumbers = new Map<number, any[]>();
    
    for (const ep of episodes) {
      if (!episodeNumbers.has(ep.episode_number)) {
        episodeNumbers.set(ep.episode_number, []);
      }
      episodeNumbers.get(ep.episode_number)!.push(ep);
    }
    
    // 删除重复剧集（保留第一个）
    for (const [num, eps] of episodeNumbers) {
      if (eps.length > 1) {
        issues.push(`发现重复剧集: 第${num}集 (${eps.length}个)`);
        console.log('[DataCleanup] Found duplicate episodes:', num, eps.length);
        
        // 保留created_at最早的
        eps.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        const toKeep = eps[0];
        const toDelete = eps.slice(1);
        
        for (const ep of toDelete) {
          // 先删除关联的分镜
          const storyboards = await db.getEpisodeStoryboards(ep.id);
          for (const sb of storyboards) {
            await db.deleteStoryboard(sb.id);
          }
          
          await db.deleteEpisode(ep.id);
          fixes.push(`删除重复剧集: 第${ep.episode_number}集 (${ep.id})`);
          console.log('[DataCleanup] Deleted duplicate episode:', ep.id);
        }
      }
    }
    
    // 4. 检查并修复孤立的分镜（没有关联剧集）
    console.log('[DataCleanup] Checking for orphaned storyboards...');
    const { data: allStoryboards, error: sbError } = await supabase
      .from('series_storyboards')
      .select('id, episode_id, scene_number')
      .eq('series_id', seriesId);
    
    if (sbError) {
      console.error('[DataCleanup] Failed to fetch storyboards:', sbError);
    } else if (allStoryboards) {
      const validEpisodeIds = new Set(episodes.map(ep => ep.id));
      const orphanedStoryboards = allStoryboards.filter(sb => !validEpisodeIds.has(sb.episode_id));
      
      if (orphanedStoryboards.length > 0) {
        issues.push(`发现孤立分镜: ${orphanedStoryboards.length}个`);
        console.log('[DataCleanup] Found orphaned storyboards:', orphanedStoryboards.length);
        
        for (const sb of orphanedStoryboards) {
          await db.deleteStoryboard(sb.id);
          fixes.push(`删除孤立分镜: ${sb.id}`);
          console.log('[DataCleanup] Deleted orphaned storyboard:', sb.id);
        }
      }
    }
    
    // 5. 检查剧集编号是否连续
    console.log('[DataCleanup] Checking episode numbering...');
    const sortedEpisodes = [...episodes].sort((a, b) => a.episode_number - b.episode_number);
    const episodeNumberGaps = [];
    
    for (let i = 1; i <= series.total_episodes; i++) {
      const found = sortedEpisodes.find(ep => ep.episode_number === i);
      if (!found) {
        episodeNumberGaps.push(i);
      }
    }
    
    if (episodeNumberGaps.length > 0) {
      issues.push(`剧集编号缺失: 第${episodeNumberGaps.join(', ')}集`);
      console.log('[DataCleanup] Missing episode numbers:', episodeNumberGaps);
    }
    
    // 6. 检查并修复分镜编号重复
    console.log('[DataCleanup] Checking for duplicate scene numbers...');
    for (const episode of episodes) {
      const storyboards = await db.getEpisodeStoryboards(episode.id);
      const sceneNumbers = new Map<number, any[]>();
      
      for (const sb of storyboards) {
        if (!sceneNumbers.has(sb.scene_number)) {
          sceneNumbers.set(sb.scene_number, []);
        }
        sceneNumbers.get(sb.scene_number)!.push(sb);
      }
      
      for (const [num, sbs] of sceneNumbers) {
        if (sbs.length > 1) {
          issues.push(`第${episode.episode_number}集存在重复分镜编号: ${num} (${sbs.length}个)`);
          console.log('[DataCleanup] Found duplicate scene numbers:', episode.episode_number, num, sbs.length);
          
          // 保留created_at最早的
          sbs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          const toDelete = sbs.slice(1);
          
          for (const sb of toDelete) {
            await db.deleteStoryboard(sb.id);
            fixes.push(`删除第${episode.episode_number}集重复分镜: 场景${sb.scene_number} (${sb.id})`);
            console.log('[DataCleanup] Deleted duplicate storyboard:', sb.id);
          }
        }
      }
    }
    
    // 7. 修复空字段
    console.log('[DataCleanup] Fixing null/empty fields...');
    let fixedFields = 0;
    
    for (const char of characters) {
      if (!char.name || char.name.trim() === '') {
        await db.updateCharacter(char.id, { name: '未命名角色' });
        fixes.push(`修复角色名称: ${char.id} -> 未命名角色`);
        fixedFields++;
      }
    }
    
    for (const ep of episodes) {
      const updates: any = {};
      if (!ep.title || ep.title.trim() === '') {
        updates.title = `第${ep.episode_number}集`;
      }
      if (!ep.status) {
        updates.status = 'draft';
      }
      
      if (Object.keys(updates).length > 0) {
        await db.updateEpisode(ep.id, updates);
        fixes.push(`修复剧集字段: 第${ep.episode_number}集`);
        fixedFields++;
      }
    }
    
    if (fixedFields > 0) {
      issues.push(`发现空字段: ${fixedFields}个`);
    }
    
    console.log('[DataCleanup] ✅ Data fix complete');
    console.log('[DataCleanup] Issues found:', issues.length);
    console.log('[DataCleanup] Fixes applied:', fixes.length);
    
    return c.json({
      success: true,
      summary: {
        issuesFound: issues.length,
        fixesApplied: fixes.length,
      },
      issues,
      fixes,
    });
    
  } catch (error: any) {
    console.error('[DataCleanup] ❌ Fix failed:', error);
    return c.json({
      success: false,
      error: error.message || 'Fix failed',
    }, 500);
  }
}

/**
 * 清理所有测试数据
 * DELETE /make-server-fc31472c/series/cleanup-test-data
 */
export async function cleanupTestData(c: Context) {
  try {
    console.log('[DataCleanup] 🗑️ Starting test data cleanup...');
    
    const testPatterns = [
      '测试',
      'test',
      'demo',
      'sample',
      '示例',
    ];
    
    const deleted = {
      series: 0,
      characters: 0,
      episodes: 0,
      storyboards: 0,
    };
    
    // 查找所有包含测试关键词的系列
    const { data: allSeries, error: seriesError } = await supabase
      .from('series')
      .select('id, title, user_phone');
    
    if (seriesError) {
      throw seriesError;
    }
    
    for (const series of allSeries || []) {
      const titleLower = series.title.toLowerCase();
      const isTestData = testPatterns.some(pattern => titleLower.includes(pattern));
      
      if (isTestData) {
        console.log('[DataCleanup] Deleting test series:', series.title);
        
        // 删除关联数据
        const characters = await db.getSeriesCharacters(series.id);
        const episodes = await db.getSeriesEpisodes(series.id);
        
        for (const ep of episodes) {
          const storyboards = await db.getEpisodeStoryboards(ep.id);
          for (const sb of storyboards) {
            await db.deleteStoryboard(sb.id);
            deleted.storyboards++;
          }
          await db.deleteEpisode(ep.id);
          deleted.episodes++;
        }
        
        for (const char of characters) {
          await db.deleteCharacter(char.id);
          deleted.characters++;
        }
        
        await db.deleteSeries(series.id);
        deleted.series++;
      }
    }
    
    console.log('[DataCleanup] ✅ Test data cleanup complete:', deleted);
    
    return c.json({
      success: true,
      deleted,
    });
    
  } catch (error: any) {
    console.error('[DataCleanup] ❌ Cleanup failed:', error);
    return c.json({
      success: false,
      error: error.message || 'Cleanup failed',
    }, 500);
  }
}

/**
 * 重建数据索引和统计信息
 * POST /make-server-fc31472c/series/:id/rebuild-stats
 */
export async function rebuildSeriesStats(c: Context) {
  const seriesId = c.req.param("id");
  
  try {
    console.log('[DataCleanup] 📊 Rebuilding stats for series:', seriesId);
    
    const series = await db.getSeries(seriesId);
    if (!series) {
      return c.json({ 
        success: false,
        error: 'Series not found' 
      }, 404);
    }
    
    // 重新计算统计信息
    const episodes = await db.getSeriesEpisodes(seriesId);
    const characters = await db.getSeriesCharacters(seriesId);
    
    let totalStoryboards = 0;
    let totalVideos = 0;
    
    for (const ep of episodes) {
      const storyboards = await db.getEpisodeStoryboards(ep.id);
      totalStoryboards += storyboards.length;
      totalVideos += storyboards.filter(sb => sb.video_url).length;
    }
    
    // 更新Series状态
    let status = 'draft';
    if (totalVideos === totalStoryboards && totalStoryboards > 0) {
      status = 'completed';
    } else if (totalVideos > 0) {
      status = 'in_progress';
    }
    
    await db.updateSeries(seriesId, { status });
    
    console.log('[DataCleanup] ✅ Stats rebuilt:', {
      episodes: episodes.length,
      characters: characters.length,
      storyboards: totalStoryboards,
      videos: totalVideos,
      status,
    });
    
    return c.json({
      success: true,
      stats: {
        episodes: episodes.length,
        characters: characters.length,
        storyboards: totalStoryboards,
        videos: totalVideos,
        status,
      },
    });
    
  } catch (error: any) {
    console.error('[DataCleanup] ❌ Rebuild failed:', error);
    return c.json({
      success: false,
      error: error.message || 'Rebuild failed',
    }, 500);
  }
}