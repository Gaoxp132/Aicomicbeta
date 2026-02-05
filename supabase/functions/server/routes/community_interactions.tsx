import type { Hono } from "npm:hono";
import * as db from "../database/index.tsx";
import { createDualRouteRegistrar } from "../utils.tsx";

/**
 * 社区互动路由（点赞、评论、分享、浏览）
 */
export function registerCommunityInteractionsRoutes(app: Hono) {
  const register = createDualRouteRegistrar(app);
  
  // 👁️ 增加浏览量
  register('post', '/community/works/:workId/increment-view', async (c) => {
    try {
      const workId = c.req.param('workId');
      
      await db.incrementViews(workId);
      
      return c.json({ success: true });
    } catch (error: any) {
      console.error('[Increment View] Error:', error);
      return c.json({ 
        success: false, 
        error: error.message 
      }, 500);
    }
  });
  
  // ❤️ 切换点赞状态
  register('post', '/community/works/:workId/toggle-like', async (c) => {
    try {
      const workId = c.req.param('workId');
      const { userPhone } = await c.req.json();
      
      if (!userPhone) {
        return c.json({ 
          success: false, 
          error: 'User phone is required' 
        }, 400);
      }
      
      const result = await db.toggleLike(workId, userPhone);
      
      return c.json({ 
        success: true, 
        isLiked: result.isLiked,
        likes: result.likes 
      });
    } catch (error: any) {
      console.error('[Toggle Like] Error:', error);
      return c.json({ 
        success: false, 
        error: error.message 
      }, 500);
    }
  });
  
  // ❤️ 获取点赞状态
  register('get', '/community/works/:workId/like-status', async (c) => {
    try {
      const workId = c.req.param('workId');
      const userPhone = c.req.query('userPhone');
      
      if (!userPhone) {
        return c.json({ 
          success: false, 
          error: 'User phone is required' 
        }, 400);
      }
      
      const isLiked = await db.isLiked(workId, userPhone);
      const likes = await db.getLikesCount(workId);
      
      return c.json({ 
        success: true, 
        isLiked,
        likes 
      });
    } catch (error: any) {
      console.error('[Like Status] Error:', error);
      return c.json({ 
        success: false, 
        error: error.message 
      }, 500);
    }
  });
  
  // 🔗 增分享量
  register('post', '/community/works/:workId/increment-share', async (c) => {
    try {
      const workId = c.req.param('workId');
      
      await db.incrementShares(workId);
      
      return c.json({ success: true });
    } catch (error: any) {
      console.error('[Increment Share] Error:', error);
      return c.json({ 
        success: false, 
        error: error.message 
      }, 500);
    }
  });
  
  // 💬 发表评论
  register('post', '/community/works/:workId/comments', async (c) => {
    try {
      const workId = c.req.param('workId');
      const { userPhone, content } = await c.req.json();
      
      if (!userPhone || !content) {
        return c.json({ 
          success: false, 
          error: 'User phone and content are required' 
        }, 400);
      }
      
      const comment = await db.createComment(workId, userPhone, content);
      
      return c.json({ 
        success: true, 
        comment 
      });
    } catch (error: any) {
      console.error('[Create Comment] Error:', error);
      return c.json({ 
        success: false, 
        error: error.message 
      }, 500);
    }
  });
  
  // 💬 获取评论列表
  register('get', '/community/works/:workId/comments', async (c) => {
    try {
      const workId = c.req.param('workId');
      
      const comments = await db.getComments(workId);
      
      return c.json({ 
        success: true, 
        comments 
      });
    } catch (error: any) {
      console.error('[Get Comments] Error:', error);
      return c.json({ 
        success: false, 
        error: error.message,
        comments: [] 
      }, 500);
    }
  });
  
  // 📊 发布作品到社区
  register('post', '/community/publish', async (c) => {
    try {
      // 🔧 支持两种参数格式：phone 或 userPhone（向后兼容）
      const body = await c.req.json();
      const taskId = body.taskId;
      const userPhone = body.userPhone || body.phone;
      
      if (!taskId || !userPhone) {
        return c.json({ 
          success: false, 
          error: 'Task ID and user phone are required' 
        }, 400);
      }
      
      console.log('[Publish Work] Publishing:', { taskId, userPhone });
      
      // 🔧 使用 maybeSingle() 避免 PGRST116 错误
      const { data: task, error: taskError } = await db.supabase
        .from('video_tasks')
        .select('*')
        .eq('task_id', taskId)
        .maybeSingle(); // ✅ 使用 maybeSingle() 而不是 single()
      
      if (taskError) {
        console.error('[Publish Work] Database error:', taskError);
        return c.json({ 
          success: false, 
          error: '数据库查询失败',
          details: taskError.message,
        }, 500);
      }
      
      if (!task) {
        console.error('[Publish Work] Task not found:', taskId);
        return c.json({ 
          success: false, 
          error: '视频任务不存在' 
        }, 404);
      }
      
      // 🔧 验证任务属于该用户
      if (task.user_phone !== userPhone) {
        console.error('[Publish Work] User mismatch:', {
          taskUserPhone: task.user_phone,
          requestUserPhone: userPhone,
        });
        return c.json({ 
          success: false, 
          error: '无权限发布此视频' 
        }, 403);
      }
      
      if (task.status !== 'completed') {
        return c.json({ 
          success: false, 
          error: '只有完成的视频才能发布' 
        }, 400);
      }
      
      const { data: existingWork } = await db.supabase
        .from('works')
        .select('id')
        .eq('task_id', taskId)
        .single();
      
      if (existingWork) {
        return c.json({ 
          success: true, 
          message: 'Work already published',
          workId: existingWork.id 
        });
      }
      
      const { data: newWork, error: insertError } = await db.supabase
        .from('works')
        .insert({
          task_id: taskId,
          user_phone: userPhone,
          title: task.prompt?.substring(0, 50) || '无标题',
          prompt: task.prompt,
          style: task.style,
          duration: task.duration,
          video_url: task.video_url,
          thumbnail: task.thumbnail,
          published_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (insertError) {
        console.error('[Publish Work] Insert error:', insertError);
        return c.json({ 
          success: false, 
          error: insertError.message 
        }, 500);
      }
      
      console.log('[Publish Work] ✅ Published:', newWork.id);
      
      return c.json({ 
        success: true, 
        workId: newWork.id 
      });
      
    } catch (error: any) {
      console.error('[Publish Work] Error:', error);
      return c.json({ 
        success: false, 
        error: error.message 
      }, 500);
    }
  });
}