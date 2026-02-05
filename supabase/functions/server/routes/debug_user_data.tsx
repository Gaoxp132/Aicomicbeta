/**
 * 用户数据调试端点
 * 帮助排查用户数据显示问题
 */

import type { Context } from "npm:hono";
import * as db from "../database/index.tsx";

/**
 * 调试用户数据
 * GET /debug/user-data/:userPhone
 */
export async function debugUserData(c: Context) {
  try {
    const userPhone = c.req.param('userPhone');
    
    if (!userPhone) {
      return c.json({
        success: false,
        error: 'Missing userPhone parameter',
      }, 400);
    }

    console.log(`[Debug] 🔍 Fetching data for user: ${userPhone}`);

    // 1. 检查用户是否存在
    const user = await db.getUserProfile(userPhone);
    
    // 2. 获取视频任务
    const tasks = await db.getUserVideoTasks(userPhone, 1, 100);
    
    // 3. 获取用户作品
    const works = await db.getUserWorks(userPhone, 1, 100);
    
    // 4. 获取用户的漫剧系列
    const { data: series, error: seriesError } = await db.supabase
      .from('series')
      .select('*')
      .eq('user_phone', userPhone)
      .order('created_at', { ascending: false });

    // 5. 获取用户的剧集
    const { data: episodes, error: episodesError } = await db.supabase
      .from('series_episodes')
      .select(`
        *,
        series:series_id (
          title,
          user_phone
        )
      `)
      .order('created_at', { ascending: false });

    // 过滤属于该用户的剧集
    const userEpisodes = episodes?.filter(ep => 
      ep.series && ep.series.user_phone === userPhone
    ) || [];

    const result = {
      success: true,
      userPhone,
      data: {
        user: user || null,
        tasks: {
          total: tasks.total,
          count: tasks.tasks?.length || 0,
          items: tasks.tasks?.slice(0, 5) || [], // 只返回前5个
        },
        works: {
          total: works.total,
          count: works.works?.length || 0,
          items: works.works?.slice(0, 5) || [], // 只返回前5个
        },
        series: {
          total: series?.length || 0,
          count: series?.length || 0,
          items: series?.slice(0, 5) || [],
          error: seriesError?.message || null,
        },
        episodes: {
          total: userEpisodes.length,
          count: userEpisodes.length,
          items: userEpisodes.slice(0, 5),
          error: episodesError?.message || null,
        },
      },
      summary: {
        hasUser: !!user,
        hasTasks: tasks.total > 0,
        hasWorks: works.total > 0,
        hasSeries: (series?.length || 0) > 0,
        hasEpisodes: userEpisodes.length > 0,
      }
    };

    console.log(`[Debug] ✅ User data summary:`, result.summary);

    return c.json(result);

  } catch (error: any) {
    console.error('[Debug] ❌ Error fetching user data:', error);
    return c.json({
      success: false,
      error: error.message,
      stack: error.stack,
    }, 500);
  }
}