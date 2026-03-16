/**
 * 应用版本信息
 *
 * v6.0.183 - 2026-03-16
 * - 修复: [前端] 视频生成轮询超时后重复创建任务+错误标记失败——三大修复:
 *   (1) 新增 PollingTimeoutError 专用错误类(volcengine.ts)——轮询超时不再视为"失败"
 *   (2) pollTaskStatus 轮询耗尽前新增"最后一搏"检查(等15s再查一次状态)
 *   (3) useStoryboardBatchGeneration 批量生成前新增 pre-flight 检查(fetchExistingVideoTasks)
 *       - 服务器已有完成的视频→直接更新本地状态，不重新生成
 *       - 服务器任务仍在处理中→跳过，保持generating，由背景轮询拾取
 *   (4) 轮询超时时保持'generating'状态(不再重置为'draft')，避免下次重试创建重复任务
 *       影响: useStoryboardBatchGeneration + useStoryboardActions(单个生成/重新生成)
 *   (5) 超时汇总消息区分"成功/后台处理中/失败"三种状态
 * - 修复: [前端+后端] 轮询时间覆盖不足(~16min)导致慢速任务误判超时:
 *   (6) pollTaskStatus 自适应间隔: 前20次5s→21-50次10s→51-80次15s→81+次25s
 *       同样120次轮询, 总覆盖 ~30min (原~16min), 几乎翻倍
 *   (7) [后端] volcengine/status 端点: 处理>10min的任务API超时从25s→40s, 减少"假性processing"
 *   (8) [后端] 处理>20min仍在processing的任务记录警告日志(可能卡在Volcengine侧)
 *   (9) [后端] 返回 taskAgeMinutes 字段, 帮助前端自适应行为
 *   (10) isPollingTimeoutError() 防御性类型守卫——三重检测(instanceof→.name→message关键词)
 *        修复: bundler模块重复导致 instanceof PollingTimeoutError 失败→超时错误被误判为普通失败
 *        影响: useStoryboardBatchGeneration + useStoryboardActions + useEpisodeMerge 共5处
 *   (11) pollTaskStatus 中 '任务存在或已过期' 字符串匹配修正为 '任务不存在'(原检查永远不匹配)
 *
 * v6.0.182 - 2026-03-16
 * - 修复: [后端] merge-videos 下载分镜视频失败("Scene X download FAILED after 3 attempts")
 *   根因: 合并端点直接使用DB中可能已过期的Volcengine TOS签名URL下载，重试3次同一过期URL必定403
 *   修复: 下载前新增URL刷新阶段——检测TOS URL→查DB(series_storyboards/video_tasks)获取OSS替代URL
 *         + 为所有OSS URL生成presigned GET URL(7200s有效期) + 下载重试交替使用presigned/direct URL
 * - 修复: [后端] Volcengine "Invalid content.text" 视频生成失败
 *   根因: (1) DB存储的AI生成文本含无效Unicode/控制字符(null/BOM/lone surrogate/control chars)
 *          (2) 上下文注入后content.text超出API长度限制(可达8000+字符，API限制~4000)
 *   修复: 全面文本清洗(7类无效字符) + 智能截断至4000字符(保留首尾关键信息，裁剪中间上下文)
 *
 * v6.0.181 - 2026-03-16
 * - 清扫: [前端] catch 类型注解全项目统一化——catch(error)无注解29处+Promise.catch隐式any 6处全部补齐 `: unknown`
 *   涉及 16 个文件: CommunityPanel/EpisodePlayer/ErrorBoundary/ProfilePanel/TaskStatus/
 *   community/viewerHooks/series/SeriesListView/profile/immersive/(useHlsPlayer+useImmersiveSharing)/
 *   hooks/(useCommunity+useInfra+useVideoQuota+useAdminPaymentPoller+useSeriesMedia+useAdminCheck+usePlayback)/
 *   services/series
 * - 修复: [前端] SeriesListView.tsx 缺失 getErrorMessage import（会导致运行时 ReferenceError）
 *
 * v6.0.180 - 2026-03-16
 * - 清扫: [前端] catch (error: any) → catch (error: unknown) + getErrorMessage() 类型守卫 — 全项目零残留
 *   新增 getErrorMessage(err: unknown): string 工具函数（utils/index.ts）
 *   全量完成 ~69处: utils/index.ts, services/(series|video|community|volcengine).ts,
 *   hooks/(useInfra|useCommunity|useSeriesMedia|usePlayback).ts,
 *   components/(AdminPanelTabs|SettingsDialog|CommunityPanel|ProfilePanel|SeriesCreationPanel|
 *   HomeCreationPanel|EpisodePlayer|ImmersiveVideoViewer|PaymentDialog|profile|home|playlist|immersive),
 *   series/(SeriesEditor|SeriesListView|StyleAnchorPanel|ClientVideoMerger|StoryboardWidgets|
 *   StoryboardStatusBars|useEpisodeActions|useSeriesEditorActions|useStoryboardActions|
 *   useStoryboardBatchGeneration|useWizardAI|useEpisodeMerge|useAutoMerge|useStoryboardPersistence|
 *   useGenerationPolling|clientMergeLogic)
 * - 修复: [前端] Promise.catch类型注解
 * - 修复: [前端] 缺失import修复
 *
 * v6.0.178 - 2026-03-13
 * - 清扫: [前端] 全项目零原生浏览器对话框——alert(19处)/confirm(3处)/prompt(1处) 全部迁移
 *   alert → toast.error/success/info (sonner)，长文本诊断数据改为toast摘要+console.log详情
 *   confirm → ConfirmDialog (confirmFn注入模式，.ts hook文件通过参数入避免依赖React组件)
 *   prompt → toast.info (剪贴板fallback)
 *   涉及文件: useSeriesEditorActions/useStoryboardBatchGeneration/SeriesEditor/SeriesCreationPanel/playlist/useImmersiveSharing
 * - 清扫: [后端] app.tsx epGenPromptLines ~30行死代码从if(false)围栏升级为块注释(零运行时开销)
 * - 修复: [前端] useImmersiveSharing错误导入react-toastify改为sonner
 *
 * v6.0.175 - 2026-03-05
 * - 优化: [前端] 暗色主题确认对话框——替代原生confirm()，匹配暗色玻璃UI风格
 *   新增: ConfirmDialog组件 + useConfirm hook (Promise-based)
 *   替换: StoryboardEditor中7处confirm()调用（单删/重新生成/重置/批量删除/批量重新生成/批量重置/批量润色）
 *   特性: 自定义图标+颜色主题(danger/warning/info/purple)、Enter确认/Esc取消、点击遮罩关闭
 *   UX: 顶部强调色线条、键盘快捷键提示、毛玻璃背景、Motion动画进出
 *
 * v6.0.174 - 2026-03-05
 * - 修复: [前端] 撤销删除后存活分镜的scene_number未同步回DB——延迟2s调用persistSortOrder恢复原始编号
 *   根因: handleUndoDelete只re-INSERT被删除的分镜，但存活分镜在DB中仍为紧凑编号（删除时reorder过）
 *   导致刷新页面后分镜排序可能不正确（如A:1,B:2,C:3删除B后DB为A:1,C:2，撤销后本地恢复A:1,B:2,C:3但DB中C仍为2）
 * - 修复: [前端] 批量删除确认对话框误写"此操作不可撤销"——实际支持撤销（toast按钮+Ctrl+Z）
 *
 * v6.0.173 - 2026-03-05
 * - 优化: [前端] PolishPreviewModal 增加词级diff高亮——基于LCS算法的tokenize+backtrack
 *   - 原文侧: 被删除内容红色高亮+删除线；润色侧: 新增内容绿色高亮
 *   - 显示"N处变更"计数 + 底部diff图例（红=删除，绿=新增）
 * - 优化: [前端] 批量AI润色改为2路并发信号量模式（从串行升级），处理速度翻倍
 * - 功能: [前端] 润色撤销——单个润色采用后toast显示"撤销"按钮（8s），批量润色完成后显示"撤销全部"按钮（10s）
 *   - 撤销时自动恢复原文到本地状态 + 异步PATCH回DB持久化
 *
 * v6.0.172 - 2026-03-05
 * - 功能: [前端] PolishPreviewModal — 卡片一键润色改为先展示原文vs润色结果对比预览，用户可选择采用或放弃
 *   - 左右并排diff视图: 原文(红调) vs 润色后(紫调)，对白区域独立对比(青调)
 *   - 底部显示字数变化对比，键盘快捷键 Enter=采用 / Esc=放弃
 * - 功能: [前端] 批量AI润色——选择模式工具栏新增紫色"AI润色(N)"按钮，串行处理，紫粉渐变进度条
 *
 * (earlier versions omitted for brevity — see git history)
 */

export const APP_VERSION = '6.0.183';
export const VERSION_DATE = '2026-03-16';
export const VERSION_DESCRIPTION = '修复merge-videos下载失败+Volcengine Invalid content.text';