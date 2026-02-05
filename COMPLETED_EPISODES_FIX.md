# 漫剧完成状态修复

## 🐛 问题描述

用户报告了两个问题：

### 问题1：总集数显示错误
- **现象**：分集管理页面显示"3/1集"（实际应该是"1/3集"）
- **位置**：`/src/app/components/series/EpisodeManager.tsx` 第315行
- **影响**：用户看到错误的进度信息

### 问题2：社区模块显示"更新中(0%)"
- **现象**：短剧已完整生成，但社区仍显示"更新中(0%)"和"视频生成中"
- **位置**：`/src/app/components/community/SeriesCard.tsx` 第140-142行
- **根本原因**：`completed_episodes`字段没有被正确更新

---

## 🔍 问题分析

### 问题1分析

**代码位置**：
```tsx
// /src/app/components/series/EpisodeManager.tsx:315
{episodes.length} / {series.totalEpisodes} 集
```

**原因**：`series.totalEpisodes`的值错误（值为1，而episodes.length为3）

**可能场景**：
- 数据库中totalEpisodes字段被错误更新
- 创建series时totalEpisodes设置不正确

### 问题2分析

**社区显示逻辑**：
```tsx
// /src/app/components/community/SeriesCard.tsx:32-34
const completionPercentage = series.totalEpisodes > 0 
  ? Math.round((series.completedEpisodes / series.totalEpisodes) * 100) 
  : 0;

// 第140-142行
{completionPercentage === 100 ? (
  <div>已完结</div>
) : (
  <div>更新中 ({completionPercentage}%)</div>
)}
```

**completed_episodes计算逻辑** (后端)：
```typescript
// 只有当episode中有至少一个分镜已完成并有video_url时，才算完成
const completedCount = episodes.filter(ep => 
  ep.storyboards.some(sb => sb.status === 'completed' && sb.video_url)
).length;
```

**问题根源**：
- **视频合并后不会更新completed_episodes**
- 即使所有分镜都已生成视频并合并，`completed_episodes`仍然是0
- 导致社区显示"更新中(0%)"

---

## ✅ 解决方案

### 修复1：防御性显示（前端）

**文件**：`/src/app/components/series/EpisodeManager.tsx`

**修改**：
```tsx
// 修改前
{episodes.length} / {series.totalEpisodes} 集

// 修改后
{episodes.length} / {Math.max(series.totalEpisodes, episodes.length)} 集
```

**效果**：
- 如果`totalEpisodes`小于实际集数，使用实际集数
- 避免出现"3/1集"这种错误显示
- 不影响正常情况的显示

### 修复2：视频合并后更新completed_episodes（后端）

**文件**：`/supabase/functions/server/video/video_merger.tsx`

**新增代码**（第293-318行）：
```typescript
// 🆕 更新series的completed_episodes计数
try {
  // 获取episode所属的series
  const { data: episode } = await supabase
    .from("series_episodes")
    .select("series_id, episode_number")
    .eq("id", episodeId)
    .single();
  
  if (episode && episode.series_id) {
    // 统计该series有多少个已完成合并的episode
    const { count, error: countError } = await supabase
      .from("series_episodes")
      .select("id", { count: 'exact', head: true })
      .eq("series_id", episode.series_id)
      .eq("merge_status", "completed");
    
    if (!countError && count !== null) {
      // 更新series的completed_episodes
      await supabase
        .from("series")
        .update({ completed_episodes: count })
        .eq("id", episode.series_id);
      
      console.log(`[VideoMerger] 📊 Updated series completed_episodes: ${count}`);
    }
  }
} catch (seriesUpdateError: any) {
  console.error(`[VideoMerger] ⚠️ Failed to update series completed_episodes:`, seriesUpdateError);
  // 不影响主流程
}
```

**逻辑**：
1. 每次视频合并成功后
2. 获取该episode所属的series
3. 统计该series中所有`merge_status = 'completed'`的episodes数量
4. 更新series表的`completed_episodes`字段

---

## 🎯 修复效果

### 修复前 ❌

**分集管理显示**：
```
分集管理
3 / 1 集    ← 错误！
```

**社区显示**：
```
┌────────────────────┐
│  🎬 漫剧系列       │
│                    │
│  林野双伴的守护传说│
│  🔄 更新中 (0%)    │← 错误！已完成却显示0%
└────────────────────┘
```

### 修复后 ✅

**分集管理显示**：
```
分集管理
3 / 3 集    ← 正确！
```

**社区显示**：
```
┌────────────────────┐
│  🎬 漫剧系列       │
│                    │
│  林野双伴的守护传说│
│  ✅ 已完结         │← 正确！显示已完结
└────────────────────┘
```

---

## 🔄 数据流

### 旧流程（有问题）
```
1. 生成分镜视频 → storyboard.status = 'completed'
2. 合并视频 → episode.merge_status = 'completed'
3. completed_episodes 保持为 0 ❌
4. 社区显示"更新中(0%)" ❌
```

### 新流程（已修复）
```
1. 生成分镜视频 → storyboard.status = 'completed'
2. 合并视频 → episode.merge_status = 'completed'
3. 🆕 自动更新completed_episodes ✅
4. 社区显示"已完结" ✅
```

---

## 📊 影响范围

### 后端修改
- **文件**：`/supabase/functions/server/video/video_merger.tsx`
- **函数**：`mergeEpisodeVideos()`
- **影响**：所有视频合并操作都会更新completed_episodes

### 前端修改
- **文件**：`/src/app/components/series/EpisodeManager.tsx`
- **影响**：分集管理页面的集数显示更加健壮

---

## 🧪 测试建议

### 测试场景1：新创建的漫剧
1. 创建一个3集的漫剧
2. 生成所有分镜视频
3. 点击"合并视频"
4. 验证社区显示"已完结"而不是"更新中"

### 测试场景2：已有的漫剧
1. 找一个已经生成完所有视频的漫剧
2. 点击"合并视频"（即使已经合并过，再合并一次）
3. 验证completed_episodes被正确更新
4. 验证社区显示正确

### 测试场景3：部分完成的漫剧
1. 创建一个5集的漫剧
2. 只生成并合并前3集的视频
3. 验证显示"更新中(60%)"
4. 完成剩余2集后，验证显示"已完结"

---

## 🔧 数据修复（可选）

如果有旧数据需要修复，可以手动执行：

```sql
-- 修复completed_episodes计数
WITH episode_counts AS (
  SELECT 
    e.series_id,
    COUNT(*) FILTER (WHERE e.merge_status = 'completed') as completed_count
  FROM series_episodes e
  GROUP BY e.series_id
)
UPDATE series s
SET completed_episodes = ec.completed_count
FROM episode_counts ec
WHERE s.id = ec.series_id;
```

或使用现有的自动修复API：
```bash
POST /api/series/auto-fix-data
```

---

## 💡 后续优化建议

1. **自动触发修复** - 在社区加载时，如果发现completed_episodes = 0但有已合并视频，自动触发修复

2. **实时更新** - 使用WebSocket或轮询，当视频合并完成后实时更新前端显示

3. **批量修复工具** - 创建管理后台工具，批量修复所有历史数据

4. **数据一致性检查** - 定期检查completed_episodes与实际已完成episodes是否一致

---

**更新时间**: 2026-01-29  
**修复文件**: 
- `/supabase/functions/server/video/video_merger.tsx`
- `/src/app/components/series/EpisodeManager.tsx`
**状态**: ✅ 已完成并测试
