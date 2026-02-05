-- ==========================================
-- 数据库迁移验证脚本
-- 用于检查所有表、索引、触发器是否正确创建
-- ==========================================

-- ==========================================
-- 1. 检查所有表是否存在
-- ==========================================

DO $$
DECLARE
  expected_tables TEXT[] := ARRAY[
    'users',
    'works_refactored',
    'video_tasks',
    'likes',
    'comments',
    'series',
    'series_episodes',
    'series_storyboards',
    'series_characters',
    'series_chapters'
  ];
  table_name TEXT;
  missing_tables TEXT[] := ARRAY[]::TEXT[];
  table_exists BOOLEAN;
BEGIN
  RAISE NOTICE '==========================================';
  RAISE NOTICE '📋 检查表结构';
  RAISE NOTICE '==========================================';
  
  FOREACH table_name IN ARRAY expected_tables
  LOOP
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = table_name
    ) INTO table_exists;
    
    IF table_exists THEN
      RAISE NOTICE '✅ 表 % 存在', table_name;
    ELSE
      RAISE WARNING '❌ 表 % 不存在', table_name;
      missing_tables := array_append(missing_tables, table_name);
    END IF;
  END LOOP;
  
  IF array_length(missing_tables, 1) IS NULL THEN
    RAISE NOTICE '🎉 所有必需的表都已创建！';
  ELSE
    RAISE WARNING '⚠️  缺失的表: %', array_to_string(missing_tables, ', ');
  END IF;
END $$;

-- ==========================================
-- 2. 检查索引数量
-- ==========================================

DO $$
DECLARE
  index_count INTEGER;
  table_rec RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '📊 检查索引';
  RAISE NOTICE '==========================================';
  
  -- 总索引数
  SELECT COUNT(*) INTO index_count
  FROM pg_indexes
  WHERE schemaname = 'public';
  
  RAISE NOTICE '总索引数: %', index_count;
  
  IF index_count >= 63 THEN
    RAISE NOTICE '✅ 索引数量达标（>= 63）';
  ELSE
    RAISE WARNING '⚠️  索引数量不足: % < 63', index_count;
  END IF;
  
  -- 每个表的索引数
  RAISE NOTICE '';
  RAISE NOTICE '各表索引分布:';
  FOR table_rec IN 
    SELECT 
      tablename,
      COUNT(*) as idx_count
    FROM pg_indexes
    WHERE schemaname = 'public'
    GROUP BY tablename
    ORDER BY tablename
  LOOP
    RAISE NOTICE '  % - % 个索引', table_rec.tablename, table_rec.idx_count;
  END LOOP;
END $$;

-- ==========================================
-- 3. 检查关键索引
-- ==========================================

DO $$
DECLARE
  critical_indexes TEXT[] := ARRAY[
    'idx_works_user_phone',
    'idx_works_user_status',
    'idx_works_community',
    'idx_series_user_phone',
    'idx_video_tasks_request_id',
    'idx_likes_user_work',
    'idx_comments_work_id',
    'idx_users_phone'
  ];
  index_name TEXT;
  index_exists BOOLEAN;
  missing_indexes TEXT[] := ARRAY[]::TEXT[];
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '🔍 检查关键索引';
  RAISE NOTICE '==========================================';
  
  FOREACH index_name IN ARRAY critical_indexes
  LOOP
    SELECT EXISTS (
      SELECT FROM pg_indexes 
      WHERE schemaname = 'public' 
      AND indexname = index_name
    ) INTO index_exists;
    
    IF index_exists THEN
      RAISE NOTICE '✅ 索引 % 存在', index_name;
    ELSE
      RAISE WARNING '❌ 索引 % 不存在', index_name;
      missing_indexes := array_append(missing_indexes, index_name);
    END IF;
  END LOOP;
  
  IF array_length(missing_indexes, 1) IS NULL THEN
    RAISE NOTICE '🎉 所有关键索引都已创建！';
  ELSE
    RAISE WARNING '⚠️  缺失的关键索引: %', array_to_string(missing_indexes, ', ');
  END IF;
END $$;

-- ==========================================
-- 4. 检查触发器
-- ==========================================

DO $$
DECLARE
  trigger_count INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '⚡ 检查触发器';
  RAISE NOTICE '==========================================';
  
  SELECT COUNT(*) INTO trigger_count
  FROM information_schema.triggers
  WHERE trigger_schema = 'public'
    AND trigger_name LIKE '%updated_at%';
  
  RAISE NOTICE '更新时间戳触发器数量: %', trigger_count;
  
  IF trigger_count >= 9 THEN
    RAISE NOTICE '✅ 触发器数量正常（>= 9）';
  ELSE
    RAISE WARNING '⚠️  触发器数量不足: % < 9', trigger_count;
  END IF;
END $$;

-- ==========================================
-- 5. 检查数据库函数
-- ==========================================

DO $$
DECLARE
  func_exists BOOLEAN;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '🔧 检查数据库函数';
  RAISE NOTICE '==========================================';
  
  -- 检查 increment_views
  SELECT EXISTS (
    SELECT FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'increment_views'
  ) INTO func_exists;
  
  IF func_exists THEN
    RAISE NOTICE '✅ 函数 increment_views 存在';
  ELSE
    RAISE WARNING '❌ 函数 increment_views 不存在';
  END IF;
  
  -- 检查 increment_shares
  SELECT EXISTS (
    SELECT FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'increment_shares'
  ) INTO func_exists;
  
  IF func_exists THEN
    RAISE NOTICE '✅ 函数 increment_shares 存在';
  ELSE
    RAISE WARNING '❌ 函数 increment_shares 不存在';
  END IF;
  
  -- 检查 update_updated_at_column
  SELECT EXISTS (
    SELECT FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column'
  ) INTO func_exists;
  
  IF func_exists THEN
    RAISE NOTICE '✅ 函数 update_updated_at_column 存在';
  ELSE
    RAISE WARNING '❌ 函数 update_updated_at_column 不存在';
  END IF;
END $$;

-- ==========================================
-- 6. 检查表字段
-- ==========================================

DO $$
DECLARE
  column_count INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '📝 检查表字段';
  RAISE NOTICE '==========================================';
  
  -- users 表
  SELECT COUNT(*) INTO column_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'users';
  RAISE NOTICE 'users 表字段数: %', column_count;
  
  -- works_refactored 表
  SELECT COUNT(*) INTO column_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'works_refactored';
  RAISE NOTICE 'works_refactored 表字段数: %', column_count;
  
  -- video_tasks 表
  SELECT COUNT(*) INTO column_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'video_tasks';
  RAISE NOTICE 'video_tasks 表字段数: %', column_count;
  
  -- series 表
  SELECT COUNT(*) INTO column_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'series';
  RAISE NOTICE 'series 表字段数: %', column_count;
END $$;

-- ==========================================
-- 7. 性能统计
-- ==========================================

SELECT 
  '==========================================' as separator;
SELECT '📈 数据库统计' as title;
SELECT 
  '==========================================' as separator;

-- 表大小
SELECT 
  tablename as "表名",
  pg_size_pretty(pg_total_relation_size('public.' || tablename)) AS "大小"
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size('public.' || tablename) DESC;

-- ==========================================
-- 8. 最终报告
-- ==========================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '🎯 验证完成';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '请检查上方输出，确保所有检查项都显示 ✅';
  RAISE NOTICE '如有 ❌ 或 ⚠️  标记，请重新执行相应的迁移脚本';
  RAISE NOTICE '';
  RAISE NOTICE '下一步建议:';
  RAISE NOTICE '1. 执行基本CRUD测试';
  RAISE NOTICE '2. 运行压力测试';
  RAISE NOTICE '3. 监控查询性能';
  RAISE NOTICE '==========================================';
END $$;
