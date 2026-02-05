/**
 * 漫剧系统数据库表创建脚本
 * 
 * 说明：此脚本需要在Supabase Dashboard中手动执行
 * 路径：Supabase Dashboard > SQL Editor > New Query
 * 
 * 功能：创建漫剧、角色、剧集、分镜表，支持完整的漫剧创作流程
 */

-- ==================== 1. 漫剧表 (series) ====================

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

-- 索引
CREATE INDEX IF NOT EXISTS idx_series_user_phone ON public.series(user_phone);
CREATE INDEX IF NOT EXISTS idx_series_status ON public.series(status);
CREATE INDEX IF NOT EXISTS idx_series_created_at ON public.series(created_at DESC);

-- RLS策略
ALTER TABLE public.series ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to read their own series" ON public.series;
CREATE POLICY "Allow users to read their own series" ON public.series
  FOR SELECT USING (user_phone = current_setting('request.jwt.claims', true)::json->>'phone');

DROP POLICY IF EXISTS "Allow users to insert their own series" ON public.series;
CREATE POLICY "Allow users to insert their own series" ON public.series
  FOR INSERT WITH CHECK (user_phone = current_setting('request.jwt.claims', true)::json->>'phone');

DROP POLICY IF EXISTS "Allow users to update their own series" ON public.series;
CREATE POLICY "Allow users to update their own series" ON public.series
  FOR UPDATE USING (user_phone = current_setting('request.jwt.claims', true)::json->>'phone');

DROP POLICY IF EXISTS "Allow users to delete their own series" ON public.series;
CREATE POLICY "Allow users to delete their own series" ON public.series
  FOR DELETE USING (user_phone = current_setting('request.jwt.claims', true)::json->>'phone');

-- ==================== 2. 角色表 (characters) ====================

CREATE TABLE IF NOT EXISTS public.characters (
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

-- 索引
CREATE INDEX IF NOT EXISTS idx_characters_series_id ON public.characters(series_id);
CREATE INDEX IF NOT EXISTS idx_characters_role ON public.characters(role);

-- RLS策略（继承series的权限）
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow access to characters of owned series" ON public.characters;
CREATE POLICY "Allow access to characters of owned series" ON public.characters
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.series 
      WHERE series.id = characters.series_id 
      AND series.user_phone = current_setting('request.jwt.claims', true)::json->>'phone'
    )
  );

-- ==================== 3. 剧集表 (episodes) ====================

CREATE TABLE IF NOT EXISTS public.episodes (
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

-- 索引
CREATE INDEX IF NOT EXISTS idx_episodes_series_id ON public.episodes(series_id);
CREATE INDEX IF NOT EXISTS idx_episodes_episode_number ON public.episodes(episode_number);
CREATE INDEX IF NOT EXISTS idx_episodes_status ON public.episodes(status);

-- RLS策略
ALTER TABLE public.episodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow access to episodes of owned series" ON public.episodes;
CREATE POLICY "Allow access to episodes of owned series" ON public.episodes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.series 
      WHERE series.id = episodes.series_id 
      AND series.user_phone = current_setting('request.jwt.claims', true)::json->>'phone'
    )
  );

-- ==================== 4. 分镜表 (storyboards) ====================

CREATE TABLE IF NOT EXISTS public.storyboards (
  id TEXT PRIMARY KEY DEFAULT ('sb-' || gen_random_uuid()::text),
  episode_id TEXT NOT NULL REFERENCES public.episodes(id) ON DELETE CASCADE,
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
  UNIQUE(episode_id, scene_number)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_storyboards_episode_id ON public.storyboards(episode_id);
CREATE INDEX IF NOT EXISTS idx_storyboards_scene_number ON public.storyboards(scene_number);
CREATE INDEX IF NOT EXISTS idx_storyboards_status ON public.storyboards(status);
CREATE INDEX IF NOT EXISTS idx_storyboards_video_task_id ON public.storyboards(video_task_id);

-- RLS策略
ALTER TABLE public.storyboards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow access to storyboards of owned episodes" ON public.storyboards;
CREATE POLICY "Allow access to storyboards of owned episodes" ON public.storyboards
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.episodes 
      JOIN public.series ON series.id = episodes.series_id
      WHERE episodes.id = storyboards.episode_id 
      AND series.user_phone = current_setting('request.jwt.claims', true)::json->>'phone'
    )
  );

-- ==================== 5. 触发器：自动更新 updated_at ====================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Series表触发器
DROP TRIGGER IF EXISTS update_series_updated_at ON public.series;
CREATE TRIGGER update_series_updated_at
  BEFORE UPDATE ON public.series
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Characters表触发器
DROP TRIGGER IF EXISTS update_characters_updated_at ON public.characters;
CREATE TRIGGER update_characters_updated_at
  BEFORE UPDATE ON public.characters
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Episodes表触发器
DROP TRIGGER IF EXISTS update_episodes_updated_at ON public.episodes;
CREATE TRIGGER update_episodes_updated_at
  BEFORE UPDATE ON public.episodes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Storyboards表触发器
DROP TRIGGER IF EXISTS update_storyboards_updated_at ON public.storyboards;
CREATE TRIGGER update_storyboards_updated_at
  BEFORE UPDATE ON public.storyboards
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ==================== 6. 视图：方便查询 ====================

-- 完整漫剧视图（包含统计信息）
CREATE OR REPLACE VIEW public.series_with_stats AS
SELECT 
  s.*,
  COUNT(DISTINCT e.id) as actual_episodes_count,
  COUNT(DISTINCT c.id) as characters_count,
  COUNT(DISTINCT sb.id) as total_storyboards_count,
  COUNT(DISTINCT CASE WHEN sb.status = 'completed' THEN sb.id END) as completed_storyboards_count,
  COUNT(DISTINCT CASE WHEN sb.video_url IS NOT NULL THEN sb.id END) as videos_count
FROM public.series s
LEFT JOIN public.episodes e ON e.series_id = s.id
LEFT JOIN public.characters c ON c.series_id = s.id
LEFT JOIN public.storyboards sb ON sb.episode_id = e.id
GROUP BY s.id;

-- ==================== 完成 ====================

COMMENT ON TABLE public.series IS '漫剧主表，存储漫剧基本信息和生成进度';
COMMENT ON TABLE public.characters IS '角色表，存储漫剧中的所有角色';
COMMENT ON TABLE public.episodes IS '剧集表，存储每集的基本信息';
COMMENT ON TABLE public.storyboards IS '分镜表，存储每个场景的详细信息和视频链接';

-- 显示统计
SELECT 
  'Tables created successfully!' as status,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('series', 'characters', 'episodes', 'storyboards')) as tables_count;