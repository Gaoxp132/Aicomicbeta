/**
 * 添加章节表 - v3.8.0章节管理功能
 * 
 * 说明：此脚本添加chapters表和相关字段，支持长剧（30-80集）章节管理
 * 路径：Supabase Dashboard > SQL Editor > New Query
 * 
 * 功能：
 * 1. 创建chapters表用于组织多集内容
 * 2. 在series表添加is_long_series字段
 * 3. 创建必要的索引和RLS策略
 */

-- ==================== 1. 在series表添加新字段 ====================

-- 添加is_long_series字段（标记长剧）
ALTER TABLE public.series 
ADD COLUMN IF NOT EXISTS is_long_series BOOLEAN DEFAULT FALSE;

-- 更新现有数据：totalEpisodes > 15的标记为长剧
UPDATE public.series 
SET is_long_series = TRUE 
WHERE total_episodes > 15;

-- ==================== 2. 创建章节表 (chapters) ====================

CREATE TABLE IF NOT EXISTS public.chapters (
  id TEXT PRIMARY KEY DEFAULT ('chapter-' || gen_random_uuid()::text),
  series_id TEXT NOT NULL REFERENCES public.series(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  episode_range_start INTEGER NOT NULL,
  episode_range_end INTEGER NOT NULL,
  theme TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'in-progress', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  -- 约束：确保章节号唯一
  UNIQUE(series_id, chapter_number),
  -- 约束：确保集数范围合理
  CHECK (episode_range_start > 0),
  CHECK (episode_range_end >= episode_range_start)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_chapters_series_id ON public.chapters(series_id);
CREATE INDEX IF NOT EXISTS idx_chapters_chapter_number ON public.chapters(chapter_number);
CREATE INDEX IF NOT EXISTS idx_chapters_status ON public.chapters(status);

-- RLS策略（继承series的权限）
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow access to chapters of owned series" ON public.chapters;
CREATE POLICY "Allow access to chapters of owned series" ON public.chapters
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.series 
      WHERE series.id = chapters.series_id 
      AND series.user_phone = current_setting('request.jwt.claims', true)::json->>'phone'
    )
  );

-- ==================== 3. 创建触发器自动更新updated_at ====================

-- 为chapters表创建更新触发器
CREATE OR REPLACE FUNCTION update_chapters_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_chapters_updated_at ON public.chapters;
CREATE TRIGGER trigger_update_chapters_updated_at
  BEFORE UPDATE ON public.chapters
  FOR EACH ROW
  EXECUTE FUNCTION update_chapters_updated_at();

-- ==================== 4. 创建辅助函数 ====================

-- 获取章节内的所有剧集
CREATE OR REPLACE FUNCTION get_chapter_episodes(chapter_id_param TEXT)
RETURNS TABLE (
  id TEXT,
  episode_number INTEGER,
  title TEXT,
  synopsis TEXT,
  status TEXT,
  total_duration INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.episode_number,
    e.title,
    e.synopsis,
    e.status,
    e.total_duration
  FROM public.episodes e
  INNER JOIN public.chapters c ON e.series_id = c.series_id
  WHERE c.id = chapter_id_param
    AND e.episode_number >= c.episode_range_start
    AND e.episode_number <= c.episode_range_end
  ORDER BY e.episode_number;
END;
$$ LANGUAGE plpgsql;

-- 自动更新章节状态（基于其包含的剧集状态）
CREATE OR REPLACE FUNCTION update_chapter_status(chapter_id_param TEXT)
RETURNS VOID AS $$
DECLARE
  total_episodes INTEGER;
  completed_episodes INTEGER;
  new_status TEXT;
BEGIN
  -- 计算章节内剧集数量
  SELECT COUNT(*), SUM(CASE WHEN e.status = 'completed' THEN 1 ELSE 0 END)
  INTO total_episodes, completed_episodes
  FROM public.episodes e
  INNER JOIN public.chapters c ON e.series_id = c.series_id
  WHERE c.id = chapter_id_param
    AND e.episode_number >= c.episode_range_start
    AND e.episode_number <= c.episode_range_end;
  
  -- 确定新状态
  IF total_episodes = 0 THEN
    new_status := 'draft';
  ELSIF completed_episodes = total_episodes THEN
    new_status := 'completed';
  ELSIF completed_episodes > 0 THEN
    new_status := 'in-progress';
  ELSE
    new_status := 'draft';
  END IF;
  
  -- 更新章节状态
  UPDATE public.chapters
  SET status = new_status
  WHERE id = chapter_id_param;
END;
$$ LANGUAGE plpgsql;

-- ==================== 5. 创建视图：带章节信息的系列 ====================

CREATE OR REPLACE VIEW series_with_chapters AS
SELECT 
  s.*,
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'chapterNumber', c.chapter_number,
        'title', c.title,
        'description', c.description,
        'episodeRangeStart', c.episode_range_start,
        'episodeRangeEnd', c.episode_range_end,
        'theme', c.theme,
        'status', c.status,
        'createdAt', c.created_at,
        'updatedAt', c.updated_at
      ) ORDER BY c.chapter_number
    )
    FROM public.chapters c
    WHERE c.series_id = s.id
  ) as chapters
FROM public.series s
WHERE s.is_long_series = TRUE;

-- ==================== 6. 添加注释 ====================

COMMENT ON TABLE public.chapters IS '章节表 - 用于组织长剧（30-80集）的多集内容';
COMMENT ON COLUMN public.chapters.id IS '章节唯一标识';
COMMENT ON COLUMN public.chapters.series_id IS '所属漫剧ID';
COMMENT ON COLUMN public.chapters.chapter_number IS '章节序号';
COMMENT ON COLUMN public.chapters.title IS '章节标题';
COMMENT ON COLUMN public.chapters.description IS '章节描述';
COMMENT ON COLUMN public.chapters.episode_range_start IS '包含的起始集数';
COMMENT ON COLUMN public.chapters.episode_range_end IS '包含的结束集数';
COMMENT ON COLUMN public.chapters.theme IS '章节主题';
COMMENT ON COLUMN public.chapters.status IS '章节状态：draft-草稿, in-progress-进行中, completed-已完成';

COMMENT ON COLUMN public.series.is_long_series IS '是否为长剧（总集数>15）';

-- ==================== 完成 ====================

-- 输出完成信息
DO $$
BEGIN
  RAISE NOTICE '✅ 章节表创建完成';
  RAISE NOTICE '✅ 已添加 is_long_series 字段到 series 表';
  RAISE NOTICE '✅ 已创建索引和RLS策略';
  RAISE NOTICE '✅ 已创建辅助函数和视图';
  RAISE NOTICE '📊 系统现已支持30-80集长剧的章节管理';
END $$;
