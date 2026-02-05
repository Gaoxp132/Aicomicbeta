-- ==========================================
-- 基础数据库表创建脚本
-- AI漫剧/短剧生成工具 - 完整表结构
-- 目标: 支持10万用户、1万并发
-- 创建时间: 2026-01-27
-- ==========================================

-- ==========================================
-- 1. 用户表 (users)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY DEFAULT ('user-' || gen_random_uuid()::text),
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  nickname TEXT DEFAULT '用户',
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE public.users IS '用户基础信息表';

-- ==========================================
-- 2. 作品表 (works_refactored)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.works_refactored (
  id TEXT PRIMARY KEY DEFAULT ('work-' || gen_random_uuid()::text),
  task_id TEXT UNIQUE,
  user_phone TEXT NOT NULL,
  title TEXT NOT NULL,
  prompt TEXT,
  style TEXT DEFAULT 'realistic',
  duration TEXT DEFAULT '8s',
  duration_seconds INTEGER DEFAULT 8,
  category TEXT DEFAULT 'growth',
  video_url TEXT,
  thumbnail TEXT,
  cover_image TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error TEXT,
  is_public BOOLEAN DEFAULT true,
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- 视频生成相关字段
  volcengine_task_id TEXT,
  request_id TEXT,
  generation_metadata JSONB DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.works_refactored IS '用户创作的单个短视频作品表';
COMMENT ON COLUMN public.works_refactored.duration_seconds IS '视频时长（秒）';
COMMENT ON COLUMN public.works_refactored.category IS '作品分类：growth/romance/adventure等12种类型';
COMMENT ON COLUMN public.works_refactored.style IS '视频风格：realistic/anime/sketch等12种风格';
COMMENT ON COLUMN public.works_refactored.likes IS '点赞数统计';

-- ==========================================
-- 3. 视频任务表 (video_tasks)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.video_tasks (
  id TEXT PRIMARY KEY DEFAULT ('vtask-' || gen_random_uuid()::text),
  task_id TEXT UNIQUE NOT NULL,
  user_phone TEXT NOT NULL,
  
  -- 任务基本信息
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  style TEXT DEFAULT 'realistic',
  duration TEXT DEFAULT '8s',
  category TEXT DEFAULT 'growth',
  
  -- 任务状态
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  progress INTEGER DEFAULT 0,
  error TEXT,
  
  -- 视频结果
  video_url TEXT,
  thumbnail TEXT,
  cover_image TEXT,
  
  -- 火山引擎相关
  volcengine_task_id TEXT,
  request_id TEXT,
  volcengine_status TEXT,
  volcengine_progress INTEGER DEFAULT 0,
  
  -- 剧集关联（可选）
  series_id TEXT,
  episode_number INTEGER,
  scene_number INTEGER,
  
  -- 元数据
  generation_metadata JSONB DEFAULT '{}'::jsonb,
  
  -- 时间戳
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE public.video_tasks IS '视频生成任务表，跟踪所有视频生成进度';
COMMENT ON COLUMN public.video_tasks.volcengine_task_id IS '火山引擎返回的任务ID';

-- ==========================================
-- 4. 点赞表 (likes)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.likes (
  id TEXT PRIMARY KEY DEFAULT ('like-' || gen_random_uuid()::text),
  work_id TEXT NOT NULL,
  series_id TEXT,
  user_phone TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE public.likes IS '作品和剧集点赞记录表';
COMMENT ON COLUMN public.likes.work_id IS '关联的作品ID（单个视频）';
COMMENT ON COLUMN public.likes.series_id IS '关联的剧集ID（长剧）';

-- ==========================================
-- 5. 评论表 (comments)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.comments (
  id TEXT PRIMARY KEY DEFAULT ('comment-' || gen_random_uuid()::text),
  work_id TEXT,
  series_id TEXT,
  user_phone TEXT NOT NULL,
  content TEXT NOT NULL,
  parent_id TEXT REFERENCES public.comments(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE public.comments IS '评论表，支持作品评论和剧集评论';
COMMENT ON COLUMN public.comments.parent_id IS '父评论ID，用于回复功能';

-- ==========================================
-- 6. 剧集表 (series) - 已存在检查
-- ==========================================

CREATE TABLE IF NOT EXISTS public.series (
  id TEXT PRIMARY KEY DEFAULT ('series-' || gen_random_uuid()::text),
  user_phone TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  genre TEXT DEFAULT 'growth',
  style TEXT DEFAULT 'realistic',
  theme TEXT,
  story_outline TEXT,
  core_values JSONB DEFAULT '[]'::jsonb,
  total_episodes INTEGER DEFAULT 5,
  cover_image_url TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'generating', 'in-progress', 'completed', 'failed')),
  generation_progress JSONB DEFAULT '{}'::jsonb,
  coherence_check JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE public.series IS '长剧主表，支持30-80集长剧创作';

-- ==========================================
-- 7. 剧集章节表 (series_episodes)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.series_episodes (
  id TEXT PRIMARY KEY DEFAULT ('ep-' || gen_random_uuid()::text),
  series_id TEXT NOT NULL REFERENCES public.series(id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  synopsis TEXT DEFAULT '',
  growth_theme TEXT,
  growth_insight TEXT,
  key_moment TEXT,
  total_duration INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'generating', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(series_id, episode_number)
);

COMMENT ON TABLE public.series_episodes IS '剧集章节表';

-- ==========================================
-- 8. 分镜表 (series_storyboards)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.series_storyboards (
  id TEXT PRIMARY KEY DEFAULT ('sb-' || gen_random_uuid()::text),
  series_id TEXT NOT NULL REFERENCES public.series(id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL,
  scene_number INTEGER NOT NULL,
  description TEXT NOT NULL,
  dialogue TEXT,
  characters JSONB DEFAULT '[]'::jsonb,
  location TEXT,
  time_of_day TEXT,
  camera_angle TEXT,
  duration INTEGER DEFAULT 8,
  emotional_tone TEXT,
  growth_insight TEXT,
  image_url TEXT,
  video_url TEXT,
  video_task_id TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'generating', 'completed', 'failed')),
  error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(series_id, episode_number, scene_number)
);

COMMENT ON TABLE public.series_storyboards IS '分镜表，每个场景的详细信息';

-- ==========================================
-- 9. 角色表 (series_characters)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.series_characters (
  id TEXT PRIMARY KEY DEFAULT ('char-' || gen_random_uuid()::text),
  series_id TEXT NOT NULL REFERENCES public.series(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  appearance TEXT DEFAULT '',
  personality TEXT DEFAULT '',
  role TEXT DEFAULT 'supporting' CHECK (role IN ('protagonist', 'supporting', 'antagonist', 'mentor')),
  growth_arc TEXT,
  core_values JSONB DEFAULT '[]'::jsonb,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE public.series_characters IS '剧集角色表';

-- ==========================================
-- 10. 章节表 (series_chapters) - 如需要
-- ==========================================

CREATE TABLE IF NOT EXISTS public.series_chapters (
  id TEXT PRIMARY KEY DEFAULT ('chapter-' || gen_random_uuid()::text),
  series_id TEXT NOT NULL REFERENCES public.series(id) ON DELETE CASCADE,
  chapter_order INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(series_id, chapter_order)
);

COMMENT ON TABLE public.series_chapters IS '章节表，用于组织剧集结构';

-- ==========================================
-- 触发器：自动更新 updated_at
-- ==========================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Users表触发器
DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Works表触发器
DROP TRIGGER IF EXISTS update_works_updated_at ON public.works_refactored;
CREATE TRIGGER update_works_updated_at
  BEFORE UPDATE ON public.works_refactored
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Video Tasks表触发器
DROP TRIGGER IF EXISTS update_video_tasks_updated_at ON public.video_tasks;
CREATE TRIGGER update_video_tasks_updated_at
  BEFORE UPDATE ON public.video_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments表触发器
DROP TRIGGER IF EXISTS update_comments_updated_at ON public.comments;
CREATE TRIGGER update_comments_updated_at
  BEFORE UPDATE ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Series表触发器
DROP TRIGGER IF EXISTS update_series_updated_at ON public.series;
CREATE TRIGGER update_series_updated_at
  BEFORE UPDATE ON public.series
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Series Episodes表触发器
DROP TRIGGER IF EXISTS update_series_episodes_updated_at ON public.series_episodes;
CREATE TRIGGER update_series_episodes_updated_at
  BEFORE UPDATE ON public.series_episodes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Series Storyboards表触发器
DROP TRIGGER IF EXISTS update_series_storyboards_updated_at ON public.series_storyboards;
CREATE TRIGGER update_series_storyboards_updated_at
  BEFORE UPDATE ON public.series_storyboards
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Series Characters表触发器
DROP TRIGGER IF EXISTS update_series_characters_updated_at ON public.series_characters;
CREATE TRIGGER update_series_characters_updated_at
  BEFORE UPDATE ON public.series_characters
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Series Chapters表触发器
DROP TRIGGER IF EXISTS update_series_chapters_updated_at ON public.series_chapters;
CREATE TRIGGER update_series_chapters_updated_at
  BEFORE UPDATE ON public.series_chapters
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- 数据库函数：增加浏览数
-- ==========================================

CREATE OR REPLACE FUNCTION increment_views(work_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE public.works_refactored
  SET views = views + 1
  WHERE id = work_id;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 数据库函数：增加分享数
-- ==========================================

CREATE OR REPLACE FUNCTION increment_shares(work_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE public.works_refactored
  SET shares = shares + 1
  WHERE id = work_id;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 完成
-- ==========================================

DO $$
BEGIN
    RAISE NOTICE '✅ 所有基础表创建完成';
    RAISE NOTICE '📊 表列表: users, works_refactored, video_tasks, likes, comments, series, series_episodes, series_storyboards, series_characters, series_chapters';
    RAISE NOTICE '🔧 触发器和函数已创建';
    RAISE NOTICE '⏭️  下一步: 执行 CREATE_PERFORMANCE_INDEXES.sql 创建性能索引';
END $$;