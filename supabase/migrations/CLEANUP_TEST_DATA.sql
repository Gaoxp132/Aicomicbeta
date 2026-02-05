-- ==========================================
-- 清理测试数据脚本
-- 用于删除压力测试创建的测试数据
-- ==========================================

-- ⚠️ 警告：此脚本会删除所有测试数据
-- 请在执行前确认你想要清理测试数据

DO $$
DECLARE
  comments_deleted INTEGER;
  likes_deleted INTEGER;
  works_deleted INTEGER;
  users_deleted INTEGER;
BEGIN
  RAISE NOTICE '==========================================';
  RAISE NOTICE '🗑️  开始清理测试数据';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '';
  
  -- 1. 删除测试评论
  RAISE NOTICE '删除测试评论...';
  DELETE FROM public.comments 
  WHERE user_phone LIKE 'test-%';
  GET DIAGNOSTICS comments_deleted = ROW_COUNT;
  RAISE NOTICE '✅ 删除了 % 条评论', comments_deleted;
  
  -- 2. 删除测试点赞
  RAISE NOTICE '删除测试点赞...';
  DELETE FROM public.likes 
  WHERE user_phone LIKE 'test-%';
  GET DIAGNOSTICS likes_deleted = ROW_COUNT;
  RAISE NOTICE '✅ 删除了 % 个点赞', likes_deleted;
  
  -- 3. 删除测试作品
  RAISE NOTICE '删除测试作品...';
  DELETE FROM public.works_refactored 
  WHERE user_phone LIKE 'test-%';
  GET DIAGNOSTICS works_deleted = ROW_COUNT;
  RAISE NOTICE '✅ 删除了 % 个作品', works_deleted;
  
  -- 4. 删除测试用户
  RAISE NOTICE '删除测试用户...';
  DELETE FROM public.users 
  WHERE phone LIKE 'test-%';
  GET DIAGNOSTICS users_deleted = ROW_COUNT;
  RAISE NOTICE '✅ 删除了 % 个用户', users_deleted;
  
  RAISE NOTICE '';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '📊 清理完成统计';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '评论: %', comments_deleted;
  RAISE NOTICE '点赞: %', likes_deleted;
  RAISE NOTICE '作品: %', works_deleted;
  RAISE NOTICE '用户: %', users_deleted;
  RAISE NOTICE '';
  RAISE NOTICE '🎉 测试数据清理完成！';
  RAISE NOTICE '==========================================';
END $$;

-- 执行 VACUUM 回收空间
VACUUM ANALYZE public.comments;
VACUUM ANALYZE public.likes;
VACUUM ANALYZE public.works_refactored;
VACUUM ANALYZE public.users;

-- 显示清理后的表统计
SELECT 
  '==========================================' as separator;
SELECT '📊 清理后的表统计' as title;
SELECT 
  '==========================================' as separator;

SELECT 
  tablename as "表名",
  n_tup_ins as "插入数",
  n_tup_upd as "更新数",
  n_tup_del as "删除数",
  n_live_tup as "当前行数",
  n_dead_tup as "死亡行数",
  last_vacuum as "最后VACUUM",
  last_autovacuum as "最后自动VACUUM"
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND tablename IN ('users', 'works_refactored', 'likes', 'comments')
ORDER BY tablename;
