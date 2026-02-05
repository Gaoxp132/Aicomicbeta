-- ==========================================
-- 数据库迁移验证脚本
-- AI漫剧/短剧生成工具 v4.0.0
-- ==========================================

-- ==========================================
-- 1. 检查所有表是否存在
-- ==========================================

DO $$
DECLARE
  table_count INTEGER;
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
BEGIN
  RAISE NOTICE '==========================================';
  RAISE NOTICE '📋 检查数据库表';
  RAISE NOTICE '==========================================';
  
  -- 检查每个期望的表
  FOREACH table_name IN ARRAY expected_tables
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = table_name
    ) THEN
      RAISE NOTICE '✅ 表 % 存在', table_name;
    ELSE
      RAISE NOTICE '❌ 表 % 不存在', table_name;
      missing_tables := array_append(missing_tables, table_name);
    END IF;
  END LOOP;
  
  IF array_length(missing_tables, 1) > 0 THEN
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  缺失的表: %', array_to_string(missing_tables, ', ');
    RAISE EXCEPTION '数据库表创建不完整，请执行 00_CREATE_BASE_TABLES.sql';
  ELSE
    RAISE NOTICE '';
    RAISE NOTICE '✅ 所有10个表都已创建成功！';
  END IF;
END $$;

-- ==========================================
-- 2. 检查关键列是否存在
-- ==========================================

DO $$
DECLARE
  column_exists BOOLEAN;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '📊 检查关键列';
  RAISE NOTICE '==========================================';
  
  -- 检查 works_refactored.likes 列
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'works_refactored' 
    AND column_name = 'likes'
  ) INTO column_exists;
  
  IF column_exists THEN
    RAISE NOTICE '✅ works_refactored.likes 列存在';
  ELSE
    RAISE NOTICE '❌ works_refactored.likes 列不存在';
    RAISE EXCEPTION '缺少关键列 likes，请重新执行迁移脚本';
  END IF;
  
  -- 检查 comments.parent_id 列
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'comments' 
    AND column_name = 'parent_id'
  ) INTO column_exists;
  
  IF column_exists THEN
    RAISE NOTICE '✅ comments.parent_id 列存在';
  ELSE
    RAISE NOTICE '❌ comments.parent_id 列不存在';
    RAISE EXCEPTION '缺少关键列 parent_id，请重新执行迁移脚本';
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ 所有关键列都已创建成功！';
END $$;

-- ==========================================
-- 3. 检查索引数量
-- ==========================================

DO $$
DECLARE
  index_count INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '🔍 检查性能索引';
  RAISE NOTICE '==========================================';
  
  -- 统计索引数量
  SELECT COUNT(*) INTO index_count
  FROM pg_indexes
  WHERE schemaname = 'public'
  AND tablename IN (
    'users', 'works_refactored', 'video_tasks', 'likes', 'comments',
    'series', 'series_episodes', 'series_storyboards', 
    'series_characters', 'series_chapters'
  );
  
  RAISE NOTICE '📊 已创建 % 个索引', index_count;
  
  IF index_count >= 63 THEN
    RAISE NOTICE '✅ 性能索引创建完整（期望: 63个，实际: %个）', index_count;
  ELSIF index_count > 0 THEN
    RAISE NOTICE '⚠️  索引创建不完整（期望: 63个，实际: %个）', index_count;
    RAISE NOTICE '💡 建议执行 CREATE_PERFORMANCE_INDEXES.sql 补充索引';
  ELSE
    RAISE NOTICE '❌ 未找到任何索引';
    RAISE NOTICE '💡 请执行 CREATE_PERFORMANCE_INDEXES.sql 创建性能索引';
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
  
  -- 统计触发器数量
  SELECT COUNT(*) INTO trigger_count
  FROM information_schema.triggers
  WHERE trigger_schema = 'public'
  AND event_object_table IN (
    'users', 'works_refactored', 'video_tasks', 'comments',
    'series', 'series_episodes', 'series_storyboards',
    'series_characters', 'series_chapters'
  );
  
  RAISE NOTICE '📊 已创建 % 个触发器', trigger_count;
  
  IF trigger_count >= 9 THEN
    RAISE NOTICE '✅ 触发器创建完整（期望: 9个，实际: %个）', trigger_count;
  ELSE
    RAISE NOTICE '⚠️  触发器创建不完整（期望: 9个，实际: %个）', trigger_count;
    RAISE NOTICE '💡 请重新执行 00_CREATE_BASE_TABLES.sql';
  END IF;
END $$;

-- ==========================================
-- 5. 检查数据库函数
-- ==========================================

DO $$
DECLARE
  function_exists BOOLEAN;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '🔧 检查数据库函数';
  RAISE NOTICE '==========================================';
  
  -- 检查 update_updated_at_column 函数
  SELECT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'update_updated_at_column'
  ) INTO function_exists;
  
  IF function_exists THEN
    RAISE NOTICE '✅ update_updated_at_column 函数存在';
  ELSE
    RAISE NOTICE '❌ update_updated_at_column 函数不存在';
  END IF;
  
  -- 检查 increment_views 函数
  SELECT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'increment_views'
  ) INTO function_exists;
  
  IF function_exists THEN
    RAISE NOTICE '✅ increment_views 函数存在';
  ELSE
    RAISE NOTICE '❌ increment_views 函数不存在';
  END IF;
  
  -- 检查 increment_shares 函数
  SELECT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'increment_shares'
  ) INTO function_exists;
  
  IF function_exists THEN
    RAISE NOTICE '✅ increment_shares 函数存在';
  ELSE
    RAISE NOTICE '❌ increment_shares 函数存在';
  END IF;
END $$;

-- ==========================================
-- 6. 检查外键约束
-- ==========================================

DO $$
DECLARE
  constraint_count INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '🔗 检查外键约束';
  RAISE NOTICE '==========================================';
  
  -- 统计外键约束数量
  SELECT COUNT(*) INTO constraint_count
  FROM information_schema.table_constraints
  WHERE constraint_schema = 'public'
  AND constraint_type = 'FOREIGN KEY';
  
  RAISE NOTICE '📊 已创建 % 个外键约束', constraint_count;
  
  -- 检查 comments 表的 parent_id 外键
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'comments' 
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%parent_id%'
  ) THEN
    RAISE NOTICE '✅ comments.parent_id 外键约束存在';
  ELSE
    RAISE NOTICE '⚠️  comments.parent_id 外键约束不存在';
  END IF;
END $$;

-- ==========================================
-- 7. 显示详细的表信息
-- ==========================================

\echo ''
\echo '=========================================='
\echo '📋 表详细信息'
\echo '=========================================='

SELECT 
  t.table_name AS "表名",
  (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_name = t.table_name) AS "列数",
  pg_size_pretty(pg_total_relation_size(quote_ident(t.table_name)::regclass)) AS "大小",
  (SELECT COUNT(*) FROM pg_indexes WHERE tablename = t.table_name) AS "索引数"
FROM information_schema.tables t
WHERE t.table_schema = 'public'
AND t.table_type = 'BASE TABLE'
AND t.table_name IN (
  'users', 'works_refactored', 'video_tasks', 'likes', 'comments',
  'series', 'series_episodes', 'series_storyboards', 
  'series_characters', 'series_chapters'
)
ORDER BY t.table_name;

-- ==========================================
-- 8. 最终总结
-- ==========================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '🎉 验证完成！';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '';
  RAISE NOTICE '📦 数据库版本: v4.0.1';
  RAISE NOTICE '📅 迁移日期: 2026-01-27';
  RAISE NOTICE '🎯 目标: 支持10万用户、1万并发';
  RAISE NOTICE '';
  RAISE NOTICE '✅ 如果所有检查都通过，你可以：';
  RAISE NOTICE '   1. 运行 STRESS_TEST.sql 进行压力测试';
  RAISE NOTICE '   2. 启动应用并测试功能';
  RAISE NOTICE '   3. 监控数据库性能指标';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  如果有检查失败，请：';
  RAISE NOTICE '   1. 重新执行 00_CREATE_BASE_TABLES.sql';
  RAISE NOTICE '   2. 执行 CREATE_PERFORMANCE_INDEXES.sql';
  RAISE NOTICE '   3. 再次运行本验证脚本';
  RAISE NOTICE '';
END $$;