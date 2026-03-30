# Pencil UI 工作流

这份文档描述本仓库当前的 **Pencil-ready UI 更新方案**。

## 当前状态

- React 界面的核心文案与区块结构已经抽离到 `src/app/constants/pencilUi.ts`
- 首页创作面板与作品工作台已直接消费这份蓝图
- 当 Pencil 编辑器连上 VS Code 后，可以基于这份蓝图生成或更新 `.pen` 文件

## 单一事实来源

以下文件是当前 UI 设计与代码对齐的主要入口：

- `src/app/constants/pencilUi.ts`：Pencil-ready 蓝图，定义 Hero、区块标题、能力卡片、按钮文案等稳定 UI 结构
- `src/app/components/HomeCreationPanel.tsx`：消费首页蓝图
- `src/app/components/SeriesCreationPanel.tsx`：消费作品工作台蓝图

## 更新建议

1. **先改蓝图**：如需调整首页/工作台文案、卡片结构、区块顺序，优先修改 `pencilUi.ts`
2. **再看代码样式**：如果只是文案与卡片变化，组件通常无需额外改逻辑
3. **连接 Pencil 后再生成 `.pen`**：在 Pencil 可用时，按蓝图创建或更新设计稿，保持层级与代码一致

## 建议映射关系

### `homeCreation`

- `hero` → 首页 Hero 区
- `composer` → 输入卡、快捷键提示、创作按钮
- `sections.templatesTitle` → 灵感模板标题
- `sections.recentTitle` / `recentActionLabel` → 最近作品区标题与入口
- `features` → 底部三张能力卡

### `seriesWorkbench`

- `header` → 作品页标题与副标题
- `actions` → “新建作品 / 刷新”按钮
- `features` → 顶部四张能力卡

## 现阶段限制

本次整理时，Pencil 编辑器连接不可用，因此还没有直接生成 `.pen` 文件。

一旦 Pencil 连接恢复，可继续完成：

- 创建项目的 `.pen` 设计源文件
- 将 `homeCreation` / `seriesWorkbench` 两个蓝图落成可视化页面
- 后续继续把更多编辑器页面（如分镜编辑、社区页）纳入同一套蓝图