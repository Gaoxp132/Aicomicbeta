-- ==========================================
-- 清理旧表脚本
-- AI漫剧/短剧生成工具 - 删除所有旧表
-- ⚠️ 警告：此脚本会删除所有数据！
-- 执行时间: 2026-01-27
-- ==========================================

-- ⚠️ 重要提示：此脚本会删除所有现有表和数据
-- 请确保已备份重要数据后再执行

DO $$
BEGIN
    RAISE NOTICE '⚠️  开始清理旧表...';
    RAISE NOTICE '📋 此操作将删除所有现有表和数据';
END $$;

-- ==========================================
-- 按依赖关系顺序删除表（从子表到父表）
-- ==========================================

-- 1. 删除剧集相关的子表
DROP TABLE IF EXISTS public.series_chapters CASCADE;
DROP TABLE IF EXISTS public.series_characters CASCADE;
DROP TABLE IF EXISTS public.series_storyboards CASCADE;
DROP TABLE IF EXISTS public.series_episodes CASCADE;

-- 2. 删除评论和点赞表
DROP TABLE IF EXISTS public.comments CASCADE;
DROP TABLE IF EXISTS public.likes CASCADE;

-- 3. 删除视频任务表
DROP TABLE IF EXISTS public.video_tasks CASCADE;

-- 4. 删除作品表
DROP TABLE IF EXISTS public.works_refactored CASCADE;

-- 5. 删除剧集主表
DROP TABLE IF EXISTS public.series CASCADE;

-- 6. 删除用户表
DROP TABLE IF EXISTS public.users CASCADE;

-- ==========================================
-- 删除旧的触发器函数（如果存在）
-- ==========================================

DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS increment_views(TEXT) CASCADE;
DROP FUNCTION IF EXISTS increment_shares(TEXT) CASCADE;

-- ==========================================
-- 完成清理
-- ==========================================

DO $$
BEGIN
    RAISE NOTICE '✅ 所有旧表已删除';
    RAISE NOTICE '📊 已删除的表: users, works_refactored, video_tasks, likes, comments, series, series_episodes, series_storyboards, series_characters, series_chapters';
    RAISE NOTICE '🔧 已删除的函数: update_updated_at_column, increment_views, increment_shares';
    RAISE NOTICE '⏭️  下一步: 执行 00_CREATE_BASE_TABLES.sql 创建新表';
END $$;
