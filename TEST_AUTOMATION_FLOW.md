# 🧪 全流程自动化测试指南

## 快速测试（5分钟）

### 测试1: 创建漫剧并检查任务持久化

**步骤**:
1. 打开应用，登录账号
2. 进入"长剧创作"标签
3. 点击"新建漫剧"
4. 填写以下信息：
   - 标题: "测试自动化流程"
   - 简介: "这是一个测试漫剧，用于验证全流程自动化"
   - 类型: 任选
   - 风格: 任选
   - 集数: 3集（小规模测试）
   - 大纲: "主角从迷茫到自信的成长故事"
5. 点击"创建"

**预期结果**:
```
✅ 创建成功
✅ 自动跳转到列表页
✅ 显示"生成中"状态
✅ 进度条开始更新：
   - Step 1/6: 分析故事大纲
   - Step 2/6: 生成角色
   - Step 3/6: 生成剧集
   - Step 4/6: 生成分镜
   - Step 5/6: 提交视频任务 ← 重点关注
   - Step 6/6: 创作完成
```

**验证点**:
- [ ] 进度条显示"Step 5/6: 提交视频任务 (1/9)"等字样
- [ ] 约30-60秒后完成到Step 6/6
- [ ] 状态变为"已完成"

---

### 测试2: 刷新页面检查任务保留

**步骤**:
1. **在Step 5/6 执行时**，按F5刷新页面
2. 重新登录（如需要）
3. 进入"长剧创作"标签
4. 查看漫剧列表

**预期结果**:
```
✅ 漫剧仍然存在
✅ 状态显示"生成中"或"已完成"
✅ 如果是"生成中"，进度条继续更新
```

**关键验证**:
- [ ] 漫剧没有消失（修复前会消失）
- [ ] 进度正确显示

---

### 测试3: 检查视频任务

**步骤**:
1. 等待漫剧完成生成（状态变为"已完成"）
2. 点击漫剧卡片，进入编辑页面
3. 查看剧集列表
4. 展开第一集，查看分镜

**预期结果**:
```
✅ 显示3个剧集（每集约3个分镜，共9个分镜）
✅ 每个分镜显示：
   - 分镜描述
   - 视频状态：
     - "生成中" 或
     - "已完成" 或
     - 视频播放器（如已完成）
```

**关键验证**:
- [ ] 分镜状态正确（不是空白）
- [ ] 如果显示"生成中"，说明任务已提交
- [ ] 可以在"我的作品"看到视频进度

---

### 测试4: 前端任务恢复

**步骤**:
1. 在视频生成中时，进入"我的作品"标签
2. 查看作品列表
3. 按F5刷新页面
4. 重新进入"我的作品"

**预期结果**:
```
✅ 刷新前：显示3个生成中的视频任务
✅ 刷新后：视频任务仍然存在（修复前会消失）
✅ 任务状态正确显示：
   - "创作中" 带进度条
   - 或 "已完成" 带视频预览
```

**关键验证**:
- [ ] 刷新后任务没有消失（这是关键修复点）
- [ ] 任务数量正确（应该是9个，每个分镜一个任务）

---

## 🔍 高级测试（10分钟）

### 测试5: 数据库验证

**如果您有数据库访问权限**，可以直接查询：

```sql
-- 1. 查看最新创建的漫剧
SELECT id, title, status, generation_progress
FROM series
WHERE user_phone = '您的手机号'
ORDER BY created_at DESC
LIMIT 1;

-- 2. 查看该漫剧的剧集
SELECT id, episode_number, title, total_duration
FROM series_episodes
WHERE series_id = '上一步查到的series_id'
ORDER BY episode_number;

-- 3. 查看分镜
SELECT id, scene_number, description, status, video_task_id
FROM storyboards
WHERE episode_id IN (
  SELECT id FROM series_episodes WHERE series_id = '漫剧ID'
)
ORDER BY episode_id, scene_number;

-- 4. 查看视频任务（关键验证）
SELECT task_id, user_phone, prompt, status, video_url
FROM video_tasks
WHERE user_phone = '您的手机号'
  AND storyboard_id IN (
    SELECT id FROM storyboards WHERE episode_id IN (
      SELECT id FROM series_episodes WHERE series_id = '漫剧ID'
    )
  )
ORDER BY created_at DESC;
```

**验证点**:
- [ ] `storyboards.video_task_id` 不为空（修复前为空）
- [ ] `video_tasks` 表有对应记录（修复前没有）
- [ ] `video_tasks.user_phone` 正确（修复前可能为空）
- [ ] `video_tasks.storyboard_id` 正确关联

---

### 测试6: 控制台日志验证

**步骤**:
1. 按F12打开浏览器开发者工具
2. 切换到"Console"标签
3. 创建新漫剧
4. 观察日志输出

**预期日志**:
```
[SeriesService] Creating series with auto-generation...
[AutoGen] 🚀 Starting full auto-generation from outline: series_xxx
[AutoGen] 📖 Step 1/6: Analyzing story outline...
[AutoGen] 👥 Step 2/6: Creating characters...
[AutoGen] 📚 Step 3/6: Creating episodes...
[AutoGen] 🎨 Step 4/6: Generating storyboards...
[AutoGen] 🎥 Starting video generation for all storyboards...
[AutoGen] 🚀 批量提交视频生成任务（异步生成，不等待完成）...
[AutoGen] 🎬 Submitting video task for Episode 1, Scene 1...
[AutoGen] 🎬 Calling unified video generation service...  ← 关键日志
[AutoGen] ✅ Video task submitted for Scene 1, TaskID: task_xxx  ← 关键日志
[AutoGen] ✅ Video task submission completed:
[AutoGen]    - Total: 9
[AutoGen]    - Submitted: 9
[AutoGen]    - Failed: 0
[AutoGen] 📝 所有视频任务已提交，将在后台异步生成
```

**关键验证**:
- [ ] 看到"Calling unified video generation service"（修复后才有）
- [ ] 看到"Video task submitted"和taskId
- [ ] 没有看到错误日志

---

## ⚠️ 常见问题排查

### 问题1: 创建漫剧后立即消失

**原因**: 可能是前端ID同步问题
**检查**:
1. 打开控制台，搜索"taskId"
2. 确认看到`{ ...c, id: taskId, taskId }`的更新

**解决**: 已在本次修复中解决

---

### 问题2: 刷新后视频任务消失

**原因**: video_tasks表没有记录
**检查**:
```sql
SELECT COUNT(*) FROM video_tasks WHERE user_phone = '您的手机号';
```

**解决**: 已在本次修复中解决（使用统一服务）

---

### 问题3: 进度卡在Step 5/6

**原因**: 可能是API密钥配置问题
**检查**:
1. 查看控制台是否有错误
2. 检查后端日志

**解决**:
```bash
# 检查环境变量
echo $VOLCENGINE_API_KEY
```

---

### 问题4: 视频生成失败

**原因**: 火山引擎API错误或网络问题
**检查**:
```sql
SELECT task_id, status, error 
FROM video_tasks 
WHERE status = 'failed'
ORDER BY created_at DESC 
LIMIT 10;
```

**解决**: 查看error字段，根据具体错误处理

---

## 📊 性能基准

### 小规模测试（3集，共9个分镜）
- **创建时间**: 30-60秒
- **视频提交**: 5-10秒
- **总耗时**: 约1分钟

### 中等规模（10集，共30个分镜）
- **创建时间**: 60-90秒
- **视频提交**: 15-20秒
- **总耗时**: 约2分钟

### 大规模（30集，共90个分镜）
- **创建时间**: 90-120秒
- **视频提交**: 30-40秒
- **总耗时**: 约3分钟

**注意**: 视频实际生成需要额外时间（由火山引擎处理），但不会阻塞漫剧创建流程

---

## ✅ 测试通过标准

### 必须全部通过 ✅
1. [ ] 创建漫剧成功
2. [ ] 自动生成角色
3. [ ] 自动生成剧集
4. [ ] 自动生成分镜
5. [ ] 自动提交视频任务
6. [ ] 刷新页面任务保留
7. [ ] 控制台无错误日志

### 数据库验证 ✅
8. [ ] series表有记录
9. [ ] series_characters表有记录
10. [ ] series_episodes表有记录
11. [ ] storyboards表有记录
12. [ ] **video_tasks表有记录**（关键）
13. [ ] storyboards.video_task_id不为空（关键）

### 前端验证 ✅
14. [ ] useTaskRecovery正确恢复任务
15. [ ] 任务列表显示正确
16. [ ] 进度更新实时

---

## 🎯 测试结论模板

请在测试后填写：

```
测试日期: _____________
测试人员: _____________

基础功能测试:
  - 创建漫剧: [ ] 通过 [ ] 失败
  - 自动生成: [ ] 通过 [ ] 失败
  - 任务持久化: [ ] 通过 [ ] 失败
  
高级测试:
  - 数据库验证: [ ] 通过 [ ] 失败
  - 控制台日志: [ ] 通过 [ ] 失败
  
问题记录:
  1. ___________________________
  2. ___________________________
  
总体评价:
  [ ] ✅ 全部通过，可以上线
  [ ] ⚠️ 部分问题，需要修复
  [ ] ❌ 严重问题，需要回滚
```

---

**测试完成后，请反馈结果！如有任何问题，我将立即协助解决。**
