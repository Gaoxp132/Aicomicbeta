import type { Context } from "npm:hono@4.0.2";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * 获取社区作品列表
 */
export async function getCommunityWorks(c: Context) {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');
    const style = c.req.query('style');
    const phone = c.req.query('phone');
    const since = c.req.query('since'); // 增量刷新：只获取此时间之后的作品
    
    console.log('[Community Works] Fetching works:', { page, limit, style, phone, since });
    
    // 🔍 详细检查 Supabase URL 和 Key
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    console.log('[Community Works] 🔍 Environment variables:',{
      hasUrl: !!supabaseUrl,
      urlPreview: supabaseUrl?.substring(0, 40),
      hasKey: !!supabaseKey,
      keyPreview: supabaseKey?.substring(0, 30),
      urlLength: supabaseUrl?.length,
      keyLength: supabaseKey?.length,
    });
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('[Community Works] ❌ Missing environment variables!');
      return c.json({ 
        success: false, 
        error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
        works: [],
        total: 0 
      }, 500);
    }
    
    // 🔥 在请求时动态创建 Supabase 客户端（确保环境变量已加载）
    const supabase = createClient(supabaseUrl, supabaseKey, {
      db: { schema: 'public' },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    
    console.log('[Community Works] ✅ Supabase client created dynamically');

    try {
      // 只返回已转存到OSS的视频（永久有效）
      let query = supabase
        .from('video_tasks')
        .select('task_id, user_phone, video_url, thumbnail, prompt, style, duration, status, created_at, generation_metadata')
        .eq('status', 'completed')
        .not('video_url', 'is', null)
        .neq('video_url', '')
        .order('created_at', { ascending: false });
      
      // 增量刷新：只获取指定时间之后的作品
      if (since) {
        query = query.gt('created_at', since);
        console.log('[Community Works] 🔄 Incremental refresh: fetching works created after', since);
      } else {
        // 分页查询（只在非增量刷新时使用）
        query = query.limit(limit);
      }
      
      console.log('[Community Works] Query created (OSS videos only), executing...');
      
      if (style) {
        query = query.eq('style', style);
      }
      
      if (phone) {
        query = query.eq('user_phone', phone);
      }
      
      const { data: tasks, error: tasksError } = await query;
      
      if (tasksError) {
        console.error('[Community Works] Query error:', tasksError);
        
        // 🔍 详细错误诊断
        console.error('[Community Works] 🔍 Error details:', {
          message: tasksError.message,
          details: tasksError.details,
          hint: tasksError.hint,
          code: tasksError.code,
        });
        
        const errorMessage = typeof tasksError === 'string' 
          ? tasksError 
          : tasksError?.message 
            ? (typeof tasksError.message === 'string' ? tasksError.message : JSON.stringify(tasksError.message))
            : 'Unknown query error';
            
        console.error('[Community Works] Error message:', errorMessage);
        
        return c.json({ 
          success: false, 
          error: errorMessage,
          works: [],
          total: 0 
        }, 500);
      }
      
      console.log('[Community Works] Tasks found:', tasks?.length || 0);
      
      if (!tasks || tasks.length === 0) {
        return c.json({ 
          success: true, 
          works: [], 
          total: 0,
          page,
          limit,
          hasMore: false
        });
      }

      // 获取用户信息和点赞数据
      const phones = [...new Set(tasks.map(t => t.user_phone))];
      const taskIds = tasks.map(t => t.task_id);

      const [usersResult, likesResult] = await Promise.all([
        supabase
          .from('users')
          .select('phone, username, avatar_url')
          .in('phone', phones),
        supabase
          .from('likes')
          .select('work_id')
          .in('work_id', taskIds)
      ]);

      const usersMap = new Map(
        (usersResult.data || []).map(u => [u.phone, u])
      );

      const likesMap = new Map<string, number>();
      (likesResult.data || []).forEach(like => {
        likesMap.set(like.work_id, (likesMap.get(like.work_id) || 0) + 1);
      });

      // 构建作品列表
      const works = tasks.map(task => {
        const user = usersMap.get(task.user_phone);
        const likes = likesMap.get(task.task_id) || 0;

        let metadata = null;
        if (task.generation_metadata) {
          try {
            metadata = typeof task.generation_metadata === 'string' 
              ? JSON.parse(task.generation_metadata) 
              : task.generation_metadata;
          } catch (e) {
            console.warn('[Community Works] Failed to parse generation_metadata:', e);
          }
        }

        return {
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
          likes,
          createdAt: task.created_at,
          episodeNumber: metadata?.episodeNumber,
          storyboardNumber: metadata?.storyboardNumber,
        };
      });

      console.log('[Community Works] Returning works:', works.length);

      return c.json({
        success: true,
        works,
        total: works.length,
        page,
        limit,
        hasMore: since ? false : works.length >= limit
      });
    } catch (error: any) {
      console.error('[Community Works] Unexpected error:', error);
      return c.json({ 
        success: false, 
        error: error.message || 'Failed to fetch community works',
        works: [],
        total: 0
      }, 500);
    }
  } catch (error: any) {
    console.error('[Community Works] Error in getCommunityWorks:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Internal server error',
      works: [],
      total: 0
    }, 500);
  }
}