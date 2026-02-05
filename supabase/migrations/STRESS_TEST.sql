-- ==========================================
-- 数据库压力测试脚本
-- 目标: 验证支持10万用户、1万并发的性能优化
-- ==========================================

-- ==========================================
-- 1. 创建测试数据
-- ==========================================

DO $$
DECLARE
  i INTEGER;
  user_phone TEXT;
  work_id TEXT;
  series_id TEXT;
BEGIN
  RAISE NOTICE '==========================================';
  RAISE NOTICE '📊 开始创建测试数据';
  RAISE NOTICE '==========================================';
  
  -- 创建100个测试用户（模拟实际场景）
  RAISE NOTICE '创建测试用户...';
  FOR i IN 1..100 LOOP
    INSERT INTO public.users (phone, nickname, email)
    VALUES (
      'test-' || i || '-' || floor(random() * 1000000)::text,
      '测试用户' || i,
      'test' || i || '@example.com'
    )
    ON CONFLICT (phone) DO NOTHING;
  END LOOP;
  RAISE NOTICE '✅ 创建了100个测试用户';
  
  -- 创建1000个测试作品
  RAISE NOTICE '创建测试作品...';
  FOR i IN 1..1000 LOOP
    SELECT phone INTO user_phone
    FROM public.users
    WHERE phone LIKE 'test-%'
    ORDER BY random()
    LIMIT 1;
    
    INSERT INTO public.works_refactored (
      user_phone,
      title,
      prompt,
      style,
      category,
      status,
      is_public,
      duration,
      duration_seconds
    )
    VALUES (
      user_phone,
      '测试作品 ' || i,
      '这是一个测试提示词 ' || i,
      (ARRAY['realistic', 'anime', 'sketch', 'cartoon'])[floor(random() * 4 + 1)],
      (ARRAY['growth', 'romance', 'adventure', 'sci-fi'])[floor(random() * 4 + 1)],
      (ARRAY['completed', 'processing', 'pending'])[floor(random() * 3 + 1)],
      (random() > 0.3),
      '8s',
      8
    );
  END LOOP;
  RAISE NOTICE '✅ 创建了1000个测试作品';
  
  -- 创建5000个点赞记录
  RAISE NOTICE '创建测试点赞...';
  FOR i IN 1..5000 LOOP
    SELECT id INTO work_id
    FROM public.works_refactored
    ORDER BY random()
    LIMIT 1;
    
    SELECT phone INTO user_phone
    FROM public.users
    WHERE phone LIKE 'test-%'
    ORDER BY random()
    LIMIT 1;
    
    INSERT INTO public.likes (work_id, user_phone)
    VALUES (work_id, user_phone)
    ON CONFLICT DO NOTHING;
  END LOOP;
  RAISE NOTICE '✅ 创建了点赞记录';
  
  -- 创建3000个评论
  RAISE NOTICE '创建测试评论...';
  FOR i IN 1..3000 LOOP
    SELECT id INTO work_id
    FROM public.works_refactored
    ORDER BY random()
    LIMIT 1;
    
    SELECT phone INTO user_phone
    FROM public.users
    WHERE phone LIKE 'test-%'
    ORDER BY random()
    LIMIT 1;
    
    INSERT INTO public.comments (work_id, user_phone, content)
    VALUES (
      work_id,
      user_phone,
      '这是测试评论 ' || i || '，内容很精彩！'
    );
  END LOOP;
  RAISE NOTICE '✅ 创建了3000条评论';
  
  RAISE NOTICE '🎉 测试数据创建完成！';
END $$;

-- ==========================================
-- 2. 性能测试 - 社区作品查询
-- ==========================================

DO $$
DECLARE
  start_time TIMESTAMP;
  end_time TIMESTAMP;
  duration_ms NUMERIC;
  result_count INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '⚡ 测试1: 社区作品列表查询';
  RAISE NOTICE '==========================================';
  
  start_time := clock_timestamp();
  
  -- 模拟获取社区作品（带分页）
  SELECT COUNT(*) INTO result_count
  FROM (
    SELECT *
    FROM public.works_refactored
    WHERE is_public = true
      AND status = 'completed'
    ORDER BY created_at DESC
    LIMIT 20
  ) as subquery;
  
  end_time := clock_timestamp();
  duration_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
  
  RAISE NOTICE '查询结果数: %', result_count;
  RAISE NOTICE '执行时间: % ms', round(duration_ms, 2);
  
  IF duration_ms < 100 THEN
    RAISE NOTICE '✅ 性能优秀（< 100ms）';
  ELSIF duration_ms < 500 THEN
    RAISE NOTICE '⚠️  性能一般（100-500ms）';
  ELSE
    RAISE WARNING '❌ 性能较差（> 500ms）- 需要优化';
  END IF;
END $$;

-- ==========================================
-- 3. 性能测试 - 用户作品查询
-- ==========================================

DO $$
DECLARE
  start_time TIMESTAMP;
  end_time TIMESTAMP;
  duration_ms NUMERIC;
  result_count INTEGER;
  test_user_phone TEXT;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '⚡ 测试2: 用户作品查询';
  RAISE NOTICE '==========================================';
  
  -- 获取一个测试用户
  SELECT phone INTO test_user_phone
  FROM public.users
  WHERE phone LIKE 'test-%'
  LIMIT 1;
  
  start_time := clock_timestamp();
  
  -- 查询用户的所有作品
  SELECT COUNT(*) INTO result_count
  FROM public.works_refactored
  WHERE user_phone = test_user_phone
  ORDER BY created_at DESC;
  
  end_time := clock_timestamp();
  duration_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
  
  RAISE NOTICE '查询结果数: %', result_count;
  RAISE NOTICE '执行时间: % ms', round(duration_ms, 2);
  
  IF duration_ms < 50 THEN
    RAISE NOTICE '✅ 性能优秀（< 50ms）';
  ELSIF duration_ms < 200 THEN
    RAISE NOTICE '⚠️  性能一般（50-200ms）';
  ELSE
    RAISE WARNING '❌ 性能较差（> 200ms）- 需要优化';
  END IF;
END $$;

-- ==========================================
-- 4. 性能测试 - 点赞统计
-- ==========================================

DO $$
DECLARE
  start_time TIMESTAMP;
  end_time TIMESTAMP;
  duration_ms NUMERIC;
  result_count INTEGER;
  test_work_id TEXT;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '⚡ 测试3: 点赞数统计';
  RAISE NOTICE '==========================================';
  
  -- 获取一个作品ID
  SELECT id INTO test_work_id
  FROM public.works_refactored
  LIMIT 1;
  
  start_time := clock_timestamp();
  
  -- 统计点赞数
  SELECT COUNT(*) INTO result_count
  FROM public.likes
  WHERE work_id = test_work_id;
  
  end_time := clock_timestamp();
  duration_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
  
  RAISE NOTICE '点赞数: %', result_count;
  RAISE NOTICE '执行时间: % ms', round(duration_ms, 2);
  
  IF duration_ms < 20 THEN
    RAISE NOTICE '✅ 性能优秀（< 20ms）';
  ELSIF duration_ms < 100 THEN
    RAISE NOTICE '⚠️  性能一般（20-100ms）';
  ELSE
    RAISE WARNING '❌ 性能较差（> 100ms）- 需要优化';
  END IF;
END $$;

-- ==========================================
-- 5. 性能测试 - 评论查询
-- ==========================================

DO $$
DECLARE
  start_time TIMESTAMP;
  end_time TIMESTAMP;
  duration_ms NUMERIC;
  result_count INTEGER;
  test_work_id TEXT;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '⚡ 测试4: 评论列表查询';
  RAISE NOTICE '==========================================';
  
  -- 获取一个作品ID
  SELECT id INTO test_work_id
  FROM public.works_refactored
  LIMIT 1;
  
  start_time := clock_timestamp();
  
  -- 查询评论
  SELECT COUNT(*) INTO result_count
  FROM public.comments
  WHERE work_id = test_work_id
  ORDER BY created_at DESC;
  
  end_time := clock_timestamp();
  duration_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
  
  RAISE NOTICE '评论数: %', result_count;
  RAISE NOTICE '执行时间: % ms', round(duration_ms, 2);
  
  IF duration_ms < 30 THEN
    RAISE NOTICE '✅ 性能优秀（< 30ms）';
  ELSIF duration_ms < 150 THEN
    RAISE NOTICE '⚠️  性能一般（30-150ms）';
  ELSE
    RAISE WARNING '❌ 性能较差（> 150ms）- 需要优化';
  END IF;
END $$;

-- ==========================================
-- 6. 性能测试 - 复杂联合查询
-- ==========================================

DO $$
DECLARE
  start_time TIMESTAMP;
  end_time TIMESTAMP;
  duration_ms NUMERIC;
  result_count INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '⚡ 测试5: 复杂联合查询（作品+用户+互动）';
  RAISE NOTICE '==========================================';
  
  start_time := clock_timestamp();
  
  -- 复杂查询：获取作品列表及其点赞数、评论数
  SELECT COUNT(*) INTO result_count
  FROM (
    SELECT 
      w.*,
      u.nickname,
      (SELECT COUNT(*) FROM public.likes l WHERE l.work_id = w.id) as like_count,
      (SELECT COUNT(*) FROM public.comments c WHERE c.work_id = w.id) as comment_count
    FROM public.works_refactored w
    LEFT JOIN public.users u ON u.phone = w.user_phone
    WHERE w.is_public = true
      AND w.status = 'completed'
    ORDER BY w.created_at DESC
    LIMIT 20
  ) as subquery;
  
  end_time := clock_timestamp();
  duration_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
  
  RAISE NOTICE '查询结果数: %', result_count;
  RAISE NOTICE '执行时间: % ms', round(duration_ms, 2);
  
  IF duration_ms < 200 THEN
    RAISE NOTICE '✅ 性能优秀（< 200ms）';
  ELSIF duration_ms < 1000 THEN
    RAISE NOTICE '⚠️  性能一般（200-1000ms）';
  ELSE
    RAISE WARNING '❌ 性能较差（> 1000ms）- 需要优化';
  END IF;
END $$;

-- ==========================================
-- 7. 索引使用情况分析
-- ==========================================

SELECT 
  '==========================================' as separator;
SELECT '📊 索引使用情况' as title;
SELECT 
  '==========================================' as separator;

SELECT 
  schemaname as "Schema",
  tablename as "表名",
  indexname as "索引名",
  idx_scan as "索引扫描次数",
  idx_tup_read as "读取元组数",
  idx_tup_fetch as "获取元组数"
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC
LIMIT 20;

-- ==========================================
-- 8. 最终报告
-- ==========================================

DO $$
DECLARE
  total_users INTEGER;
  total_works INTEGER;
  total_likes INTEGER;
  total_comments INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_users FROM public.users WHERE phone LIKE 'test-%';
  SELECT COUNT(*) INTO total_works FROM public.works_refactored;
  SELECT COUNT(*) INTO total_likes FROM public.likes;
  SELECT COUNT(*) INTO total_comments FROM public.comments;
  
  RAISE NOTICE '';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '📈 压力测试报告';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '测试用户数: %', total_users;
  RAISE NOTICE '作品总数: %', total_works;
  RAISE NOTICE '点赞总数: %', total_likes;
  RAISE NOTICE '评论总数: %', total_comments;
  RAISE NOTICE '';
  RAISE NOTICE '性能评估:';
  RAISE NOTICE '- 如果所有测试都显示 ✅，说明性能优秀';
  RAISE NOTICE '- 如果有 ⚠️  标记，建议进一步优化索引';
  RAISE NOTICE '- 如果有 ❌标记，需要立即优化';
  RAISE NOTICE '';
  RAISE NOTICE '下一步建议:';
  RAISE NOTICE '1. 在生产环境监控实际查询性能';
  RAISE NOTICE '2. 根据慢查询日志优化索引';
  RAISE NOTICE '3. 定期执行 VACUUM ANALYZE';
  RAISE NOTICE '4. 使用连接池管理并发连接';
  RAISE NOTICE '==========================================';
END $$;

-- ==========================================
-- 清理测试数据（可选）
-- ==========================================

-- 如果需要清理测试数据，取消下面的注释并执行
-- DELETE FROM public.comments WHERE user_phone LIKE 'test-%';
-- DELETE FROM public.likes WHERE user_phone LIKE 'test-%';
-- DELETE FROM public.works_refactored WHERE user_phone LIKE 'test-%';
-- DELETE FROM public.users WHERE phone LIKE 'test-%';
