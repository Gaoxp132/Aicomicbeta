/**
 * 🔧 修复series表结构 - 增量更新脚本
 * 
 * 用途：为已存在的series表添加缺失的字段
 * 执行方式：Supabase Dashboard > SQL Editor > 粘贴并执行
 * 
 * 这个脚本会：
 * ✅ 检查并添加缺失的字段（views, likes_count, comments_count, shares_count）
 * ✅ 安全执行，不会删除已有数据
 * ✅ 可以重复执行
 */

-- ==================== 步骤1：检查并添加views字段 ====================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'series' 
    AND column_name = 'views'
  ) THEN
    ALTER TABLE public.series ADD COLUMN views INTEGER DEFAULT 0;
    RAISE NOTICE '✅ Added column: views';
  ELSE
    RAISE NOTICE '⏭️  Column views already exists';
  END IF;
END $$;

-- ==================== 步骤2：检查并添加likes_count字段 ====================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'series' 
    AND column_name = 'likes_count'
  ) THEN
    ALTER TABLE public.series ADD COLUMN likes_count INTEGER DEFAULT 0;
    RAISE NOTICE '✅ Added column: likes_count';
  ELSE
    RAISE NOTICE '⏭️  Column likes_count already exists';
  END IF;
END $$;

-- ==================== 步骤3：检查并添加comments_count字段 ====================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'series' 
    AND column_name = 'comments_count'
  ) THEN
    ALTER TABLE public.series ADD COLUMN comments_count INTEGER DEFAULT 0;
    RAISE NOTICE '✅ Added column: comments_count';
  ELSE
    RAISE NOTICE '⏭️  Column comments_count already exists';
  END IF;
END $$;

-- ==================== 步骤4：检查并添加shares_count字段 ====================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'series' 
    AND column_name = 'shares_count'
  ) THEN
    ALTER TABLE public.series ADD COLUMN shares_count INTEGER DEFAULT 0;
    RAISE NOTICE '✅ Added column: shares_count';
  ELSE
    RAISE NOTICE '⏭️  Column shares_count already exists';
  END IF;
END $$;

-- ==================== 步骤5：检查并添加coherence_check字段 ====================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'series' 
    AND column_name = 'coherence_check'
  ) THEN
    ALTER TABLE public.series ADD COLUMN coherence_check JSONB;
    RAISE NOTICE '✅ Added column: coherence_check';
  ELSE
    RAISE NOTICE '⏭️  Column coherence_check already exists';
  END IF;
END $$;

-- ==================== 步骤6：验证结果 ====================

SELECT 
  '✅ Series表修复完成！' as status,
  COUNT(*) as total_columns
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'series';

-- ==================== 步骤7：显示所有字段 ====================

SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'series'
ORDER BY ordinal_position;
