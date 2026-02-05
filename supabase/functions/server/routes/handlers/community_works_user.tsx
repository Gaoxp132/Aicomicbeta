/**
 * 用户作品查询和删除处理器
 * 从 community_works.tsx 提取的用户作品相关逻辑
 */

import type { Context } from "npm:hono";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * 获取指定用户的作品列表
 */
export async function getUserWorks(c: Context) {
  try {
    const phone = c.req.param('phone');
    
    if (!phone) {
      return c.json({ 
        success: false, 
        error: 'Phone number is required' 
      }, 400);
    }

    console.log('[Community Works] Fetching works for user:', phone);

    // 🔥 动态创建 Supabase 客户端
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      return c.json({ 
        success: false, 
        error: 'Missing Supabase configuration' 
      }, 500);
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      db: { schema: 'public' },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: tasks, error: tasksError } = await supabase
      .from('video_tasks')
      .select('*')
      .eq('user_phone', phone)
      .eq('status', 'completed')
      .not('video_url', 'is', null)
      .order('created_at', { ascending: false });

    if (tasksError) {
      console.error('[Community Works] Error fetching user works:', tasksError);
      return c.json({ 
        success: false, 
        error: tasksError.message 
      }, 500);
    }

    if (!tasks || tasks.length === 0) {
      return c.json({ 
        success: true, 
        works: [] 
      });
    }

    // 获取用户信息
    const { data: user } = await supabase
      .from('users')
      .select('phone, username, avatar_url')
      .eq('phone', phone)
      .single();

    // 获取点赞数据
    const taskIds = tasks.map(t => t.task_id);
    const { data: likes } = await supabase
      .from('likes')
      .select('work_id')
      .in('work_id', taskIds);

    const likesMap = new Map<string, number>();
    (likes || []).forEach(like => {
      likesMap.set(like.work_id, (likesMap.get(like.work_id) || 0) + 1);
    });

    const works = tasks.map(task => ({
      id: task.task_id,
      taskId: task.task_id,
      userPhone: task.user_phone,
      username: user?.username || '匿名用户',
      userAvatar: user?.avatar_url || '',
      videoUrl: task.video_url,
      thumbnail: task.thumbnail || task.video_url,
      prompt: task.prompt,
      style: task.style,
      duration: task.duration,
      likes: likesMap.get(task.task_id) || 0,
      createdAt: task.created_at,
    }));

    return c.json({
      success: true,
      works
    });
  } catch (error: any) {
    console.error('[Community Works] Error in getUserWorks:', error);
    return c.json({ 
      success: false, 
      error: error.message 
    }, 500);
  }
}

/**
 * 删除用户的指定作品
 */
export async function deleteUserWork(c: Context) {
  try {
    const phone = c.req.param('phone');
    const taskId = c.req.param('taskId');

    if (!phone || !taskId) {
      return c.json({ 
        success: false, 
        error: 'Phone and taskId are required' 
      }, 400);
    }

    console.log('[Community Works] Deleting work:', { phone, taskId });

    // 🔥 动态创建 Supabase 客户端
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      return c.json({ 
        success: false, 
        error: 'Missing Supabase configuration' 
      }, 500);
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      db: { schema: 'public' },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 删除视频任务
    await supabase
      .from('video_tasks')
      .delete()
      .eq('task_id', taskId)
      .eq('user_phone', phone);

    return c.json({ 
      success: true 
    });
  } catch (error: any) {
    console.error('[Community Works] Error in deleteUserWork:', error);
    return c.json({ 
      success: false, 
      error: error.message 
    }, 500);
  }
}