/**
 * 为 series 表添加进度跟踪字段
 * 
 * 用途：添加独立的进度字段，避免使用 JSONB 导致代码复杂
 * 执行方式：Supabase Dashboard > SQL Editor > 粘贴并执行
 * 
 * 这个脚本会：
 * ✅ 添加 current_step, completed_steps, total_steps, error 字段
 * ✅ 安全执行，不会删除已有数据
 * ✅ 可以重复执行
 */

-- ==================== 步骤1：添加 current_step 字段 ====================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'series' 
    AND column_name = 'current_step'
  ) THEN
    ALTER TABLE public.series ADD COLUMN current_step TEXT;
    RAISE NOTICE '✅ Added column: current_step';
  ELSE
    RAISE NOTICE '⏭️  Column current_step already exists';
  END IF;
END $$;

-- ==================== 步骤2：添加 completed_steps 字段 ====================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'series' 
    AND column_name = 'completed_steps'
  ) THEN
    ALTER TABLE public.series ADD COLUMN completed_steps INTEGER DEFAULT 0;
    RAISE NOTICE '✅ Added column: completed_steps';
  ELSE
    RAISE NOTICE '⏭️  Column completed_steps already exists';
  END IF;
END $$;

-- ==================== 步骤3：添加 total_steps 字段 ====================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'series' 
    AND column_name = 'total_steps'
  ) THEN
    ALTER TABLE public.series ADD COLUMN total_steps INTEGER DEFAULT 0;
    RAISE NOTICE '✅ Added column: total_steps';
  ELSE
    RAISE NOTICE '⏭️  Column total_steps already exists';
  END IF;
END $$;

-- ==================== 步骤4：添加 error 字段 ====================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'series' 
    AND column_name = 'error'
  ) THEN
    ALTER TABLE public.series ADD COLUMN error TEXT;
    RAISE NOTICE '✅ Added column: error';
  ELSE
    RAISE NOTICE '⏭️  Column error already exists';
  END IF;
END $$;

-- ==================== 步骤5：创建索引（可选，用于性能优化） ====================

-- 为 status 创建索引（如果不存在）
CREATE INDEX IF NOT EXISTS idx_series_status ON public.series(status);

-- ==================== 步骤6：验证结果 ====================

SELECT 
  '✅ Series表字段添加完成！' as status,
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
