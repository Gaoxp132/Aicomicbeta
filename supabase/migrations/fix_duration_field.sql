-- 修复 video_tasks 表的 duration 字段类型
-- 执行此脚本前请先备份数据！

-- 方案 1: 如果 duration 当前是 INTEGER 类型，改为 VARCHAR（推荐）
-- 这样可以存储 "5s", "10s" 等格式，更有语义

-- 先添加临时列
ALTER TABLE video_tasks ADD COLUMN duration_temp VARCHAR(20);

-- 将整数转换为字符串格式（加上 's' 后缀）
UPDATE video_tasks SET duration_temp = duration::text || 's' WHERE duration IS NOT NULL;

-- 删除旧列
ALTER TABLE video_tasks DROP COLUMN duration;

-- 重命名新列
ALTER TABLE video_tasks RENAME COLUMN duration_temp TO duration;

-- 验证结果
SELECT task_id, duration FROM video_tasks LIMIT 5;

-- =====================================
-- 如果上面的脚本出错，使用下面的回滚脚本：
-- =====================================

/*
-- 回滚脚本（如果需要）
ALTER TABLE video_tasks ADD COLUMN duration_int INTEGER;
UPDATE video_tasks SET duration_int = CAST(regexp_replace(duration, '[^0-9]', '', 'g') AS INTEGER) WHERE duration IS NOT NULL;
ALTER TABLE video_tasks DROP COLUMN duration;
ALTER TABLE video_tasks RENAME COLUMN duration_int TO duration;
*/
