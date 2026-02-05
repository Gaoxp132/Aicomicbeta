/**
 * 漫剧系列增强功能数据库迁移
 * 
 * 新增功能：
 * 1. episodes表添加缩略图和合成视频字段
 * 2. 创建series_interactions表（点赞、评论、分享统计）
 * 3. 创建viewing_history表（播放历史记录）
 * 4. 扩展互动表支持漫剧系列
 */

-- ==================== 1. 扩展episodes表 ====================

-- 添加缩略图字段
ALTER TABLE public.episodes 
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- 添加合成视频URL字段（合并所有分镜后的完整视频）
ALTER TABLE public.episodes 
ADD COLUMN IF NOT EXISTS merged_video_url TEXT;

-- 添加合成视频任务ID
ALTER TABLE public.episodes 
ADD COLUMN IF NOT EXISTS merge_task_id TEXT;

-- 添加合成状态
ALTER TABLE public.episodes 
ADD COLUMN IF NOT EXISTS merge_status TEXT DEFAULT 'pending' CHECK (merge_status IN ('pending', 'merging', 'completed', 'failed'));

-- 添加合成错误信息
ALTER TABLE public.episodes 
ADD COLUMN IF NOT EXISTS merge_error TEXT;

COMMENT ON COLUMN public.episodes.thumbnail_url IS '剧集缩略图URL';
COMMENT ON COLUMN public.episodes.merged_video_url IS '合成后的完整剧集视频URL';
COMMENT ON COLUMN public.episodes.merge_task_id IS '视频合成任务ID';
COMMENT ON COLUMN public.episodes.merge_status IS '视频合成状态';

-- ==================== 2. 扩展likes表支持漫剧系列 ====================

-- 添加series_id字段（可选，与work_id互斥）
ALTER TABLE public.likes 
ADD COLUMN IF NOT EXISTS series_id TEXT;

-- 修改约束：work_id和series_id至少有一个
-- 注意：这需要检查现有约束
DO $$ 
BEGIN
  -- 修改唯一约束，支持同一用户对同一作品或系列只能点赞一次
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'likes_user_phone_work_id_key' 
    AND conrelid = 'public.likes'::regclass
  ) THEN
    ALTER TABLE public.likes DROP CONSTRAINT likes_user_phone_work_id_key;
  END IF;
  
  -- 创建新的唯一索引
  CREATE UNIQUE INDEX IF NOT EXISTS idx_likes_user_work 
    ON public.likes(user_phone, work_id) WHERE work_id IS NOT NULL;
  
  CREATE UNIQUE INDEX IF NOT EXISTS idx_likes_user_series 
    ON public.likes(user_phone, series_id) WHERE series_id IS NOT NULL;
END $$;

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_likes_series_id ON public.likes(series_id);

COMMENT ON COLUMN public.likes.series_id IS '漫剧系列ID（与work_id互斥）';

-- ==================== 3. 扩展comments表支持漫剧系列 ====================

-- 添加series_id字段
ALTER TABLE public.comments 
ADD COLUMN IF NOT EXISTS series_id TEXT;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_comments_series_id ON public.comments(series_id);

COMMENT ON COLUMN public.comments.series_id IS '漫剧系列ID（与work_id互斥）';

-- ==================== 4. 创建分享记录表 ====================

CREATE TABLE IF NOT EXISTS public.shares (
  id TEXT PRIMARY KEY DEFAULT ('share-' || gen_random_uuid()::text),
  user_phone TEXT NOT NULL,
  work_id TEXT,
  series_id TEXT,
  platform TEXT DEFAULT 'link' CHECK (platform IN ('link', 'wechat', 'weibo', 'douyin', 'other')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT shares_target_check CHECK (
    (work_id IS NOT NULL AND series_id IS NULL) OR 
    (work_id IS NULL AND series_id IS NOT NULL)
  )
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_shares_work_id ON public.shares(work_id);
CREATE INDEX IF NOT EXISTS idx_shares_series_id ON public.shares(series_id);
CREATE INDEX IF NOT EXISTS idx_shares_user_phone ON public.shares(user_phone);
CREATE INDEX IF NOT EXISTS idx_shares_created_at ON public.shares(created_at DESC);

-- RLS策略
ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to shares" ON public.shares;
CREATE POLICY "Allow public read access to shares" ON public.shares
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow users to create shares" ON public.shares;
CREATE POLICY "Allow users to create shares" ON public.shares
  FOR INSERT WITH CHECK (user_phone = current_setting('request.jwt.claims', true)::json->>'phone');

COMMENT ON TABLE public.shares IS '分享记录表，记录用户分享作品和漫剧系列的行为';

-- ==================== 5. 创建浏览记录表（已存在works表中，需扩展） ====================

-- 检查works表是否有views字段
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'works' 
    AND column_name = 'views'
  ) THEN
    ALTER TABLE public.works ADD COLUMN views INTEGER DEFAULT 0;
  END IF;
END $$;

-- 为series表添加浏览量字段
ALTER TABLE public.series 
ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;

-- 为series表添加点赞数字段（缓存）
ALTER TABLE public.series 
ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0;

-- 为series表添加评论数字段（缓存）
ALTER TABLE public.series 
ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0;

-- 为series表添加分享数字段（缓存）
ALTER TABLE public.series 
ADD COLUMN IF NOT EXISTS shares_count INTEGER DEFAULT 0;

COMMENT ON COLUMN public.series.views IS '浏览量';
COMMENT ON COLUMN public.series.likes_count IS '点赞数（缓存）';
COMMENT ON COLUMN public.series.comments_count IS '评论数（缓存）';
COMMENT ON COLUMN public.series.shares_count IS '分享数（缓存）';

-- ==================== 6. 创建播放历史记录表 ====================

CREATE TABLE IF NOT EXISTS public.viewing_history (
  id TEXT PRIMARY KEY DEFAULT ('vh-' || gen_random_uuid()::text),
  user_phone TEXT NOT NULL,
  series_id TEXT NOT NULL REFERENCES public.series(id) ON DELETE CASCADE,
  episode_id TEXT REFERENCES public.episodes(id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL,
  last_position FLOAT DEFAULT 0, -- 上次播放位置（秒）
  duration FLOAT DEFAULT 0, -- 视频总时长（秒）
  completed BOOLEAN DEFAULT false, -- 是否看完
  last_watched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_phone, series_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_viewing_history_user_phone ON public.viewing_history(user_phone);
CREATE INDEX IF NOT EXISTS idx_viewing_history_series_id ON public.viewing_history(series_id);
CREATE INDEX IF NOT EXISTS idx_viewing_history_last_watched ON public.viewing_history(last_watched_at DESC);

-- RLS策略
ALTER TABLE public.viewing_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to read their own viewing history" ON public.viewing_history;
CREATE POLICY "Allow users to read their own viewing history" ON public.viewing_history
  FOR SELECT USING (user_phone = current_setting('request.jwt.claims', true)::json->>'phone');

DROP POLICY IF EXISTS "Allow users to upsert their own viewing history" ON public.viewing_history;
CREATE POLICY "Allow users to upsert their own viewing history" ON public.viewing_history
  FOR INSERT WITH CHECK (user_phone = current_setting('request.jwt.claims', true)::json->>'phone');

DROP POLICY IF EXISTS "Allow users to update their own viewing history" ON public.viewing_history;
CREATE POLICY "Allow users to update their own viewing history" ON public.viewing_history
  FOR UPDATE USING (user_phone = current_setting('request.jwt.claims', true)::json->>'phone');

-- 触发器
DROP TRIGGER IF EXISTS update_viewing_history_updated_at ON public.viewing_history;
CREATE TRIGGER update_viewing_history_updated_at
  BEFORE UPDATE ON public.viewing_history
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.viewing_history IS '播放历史记录表，记录用户观看漫剧系列的进度';
COMMENT ON COLUMN public.viewing_history.last_position IS '上次播放位置（秒）';
COMMENT ON COLUMN public.viewing_history.episode_number IS '上次观看到第几集';

-- ==================== 7. 创建辅助函数 ====================

-- 增加浏览量
CREATE OR REPLACE FUNCTION increment_series_views(p_series_id TEXT)
RETURNS void AS $$
BEGIN
  UPDATE public.series 
  SET views = views + 1 
  WHERE id = p_series_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 更新互动数统计（点赞）
CREATE OR REPLACE FUNCTION update_series_likes_count(p_series_id TEXT)
RETURNS void AS $$
BEGIN
  UPDATE public.series 
  SET likes_count = (
    SELECT COUNT(*) FROM public.likes WHERE series_id = p_series_id
  )
  WHERE id = p_series_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 更新互动数统计（评论）
CREATE OR REPLACE FUNCTION update_series_comments_count(p_series_id TEXT)
RETURNS void AS $$
BEGIN
  UPDATE public.series 
  SET comments_count = (
    SELECT COUNT(*) FROM public.comments WHERE series_id = p_series_id
  )
  WHERE id = p_series_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 更新互动数统计（分享）
CREATE OR REPLACE FUNCTION update_series_shares_count(p_series_id TEXT)
RETURNS void AS $$
BEGIN
  UPDATE public.series 
  SET shares_count = (
    SELECT COUNT(*) FROM public.shares WHERE series_id = p_series_id
  )
  WHERE id = p_series_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==================== 8. 创建触发器自动更新统计 ====================

-- 点赞触发器
CREATE OR REPLACE FUNCTION trigger_update_series_likes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.series_id IS NOT NULL THEN
    PERFORM update_series_likes_count(NEW.series_id);
  ELSIF TG_OP = 'DELETE' AND OLD.series_id IS NOT NULL THEN
    PERFORM update_series_likes_count(OLD.series_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_series_likes_trigger ON public.likes;
CREATE TRIGGER update_series_likes_trigger
  AFTER INSERT OR DELETE ON public.likes
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_series_likes();

-- 评论触发器
CREATE OR REPLACE FUNCTION trigger_update_series_comments()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.series_id IS NOT NULL THEN
    PERFORM update_series_comments_count(NEW.series_id);
  ELSIF TG_OP = 'DELETE' AND OLD.series_id IS NOT NULL THEN
    PERFORM update_series_comments_count(OLD.series_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_series_comments_trigger ON public.comments;
CREATE TRIGGER update_series_comments_trigger
  AFTER INSERT OR DELETE ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_series_comments();

-- 分享触发器
CREATE OR REPLACE FUNCTION trigger_update_series_shares()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.series_id IS NOT NULL THEN
    PERFORM update_series_shares_count(NEW.series_id);
  ELSIF TG_OP = 'DELETE' AND OLD.series_id IS NOT NULL THEN
    PERFORM update_series_shares_count(OLD.series_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_series_shares_trigger ON public.shares;
CREATE TRIGGER update_series_shares_trigger
  AFTER INSERT OR DELETE ON public.shares
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_series_shares();

-- ==================== 完成 ====================

SELECT 
  'Series enhancement migration completed!' as status,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'episodes' AND column_name IN ('thumbnail_url', 'merged_video_url')) as new_episode_columns,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name IN ('shares', 'viewing_history')) as new_tables;
