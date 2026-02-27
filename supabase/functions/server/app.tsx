/**
 * Hono 服务器应用 - 模块化版本
 * v6.0.132: video-proxy三层修复——timeout 30s→60s + DB fallback扩展到所有URL(不再限TOS) + bulk-refresh OSS URL HEAD验证
 *           根因: OSS URL(aliyuncs.com)也会超时，但canFallback仅对TOS生效→OSS超时无自愈
 *           修复1: handleVideoProxy upstream timeout 30s→60s（大视频+跨区下载需更长时间）
 *           修复2: canFallback从 isTosUrl&&hasContext 改为 hasContext（所有URL均可DB fallback）
 *           修复3: tryDbFallback对timeout场景允许重试同URL（超时可能是瞬态网络问题）
 *           修复4: bulk-refresh OSS URL从盲目passthrough改为HEAD验证+DB fallback
 *           修复5: 客户端proxy timeout 45s→75s + direct timeout 30s→60s
 * v6.0.131: OSS转存await-with-timeout——volcengine/status完成回调中OSS转存改为await+12s超时，成功则直接返回OSS URL，超时则返回原始URL(后台继续)
 *           + transfer-completed-to-oss增强——HEAD检查跳过已过期TOS URL + 可选seriesId过滤 + limit提升50
 *           + 前端StoryboardEditor合并错误UI增强——过期场景显示"重新生成视频"按钮
 * v6.0.130: video-proxy timeout也触发DB fallback + video_tasks JSONB过滤优化 + bulk-refresh IRRECOVERABLE_SOURCES收窄
 * v6.0.129: video-proxy DB fallback——TOS 403时自动查DB获取已转存的OSS URL + bulk-refresh跳过futile sync transfer
 * v6.0.126: 已合并集视频持久化到OSS——客户端合并完成后直传OSS+DB持久化，下次可直接下载
 * v6.0.125: 修复 clientMergeEpisode Proxy upstream 403（OSS签名URL过期）——合并前批量刷新签名
 * v6.0.124: useSeries轮询并发限制修复(2→5) + SeriesCard卡住任务自动重试倒计时
 * v6.0.123: 入口文件VERSION字符串同步(v6.0.77→v6.0.123) + 移除App.tsx DIAG模块预检日志块
 * v6.0.122: 修复 "send was called before connect"——onError检测Deno TCP断连错误并静默忽略，防止错误递归
 * v6.0.121: 合并分镜完整性修复——包容所有分辨率段不跳过 + vite.config.ts路径优化
 * v6.0.120: StyleAnchorPanel增强——无锚定态场景选择+分集分组+批量生成后锚定建议
 * v6.0.119: 风格锚定图管理面板——SeriesEditor可视化查看/更换/清除anchor + PUT handler安全合并styleAnchorImageUrl到coherence_check JSONB
 * v6.0.118: 全自动i2v风格链——参考图→E1S1.image_url预���→storyboard.image_url自动升级→anchor两阶段锚定(user-upload→首生成场景自动替换)
 * v6.0.117: 参考�����风格锚定(referenceImageUrl同时设为styleAnchorImageUrl,创建时即生效) + 移除确定性seed(Seedance API不支持)
 * v6.0.116: 风格一致性三重锁定: 确定性seed(seriesId→稳定整数) + 风格锚定图(首场景→styleAnchorImageUrl→后续无前序图时i2v回退) + 首帧提示注入(防电话游戏风格漂移)
 * v6.0.115: 重试永远不生效修复(forceRetry绕过幂等性守卫) + 风格一致性增强(指南截断500→1000+风格DNA锁定+分镜retry用sbPromptFixed)
 * v6.0.114: video-proxy POST handler——避免GET query string超长导致浏览器Failed to fetch + 客户端重试增强(4次+渐进退避)
 * v6.0.113: framer-motion缺失修复——vite.config.ts resolve.alias + package.json显式依赖，恢复全部28个motion/react导入点
 * v6.0.112: Unicode乱码彻底清除——覆盖修正策略修复11处无法直接匹配的U+FFFD残留(sbPrompt2/extraCtx/tpls/charPromptLines/epGenPromptLines/sbPrompt/characterRows/syn)
 * v6.0.111: 分辨率不一致自动修复(excludedScenes→forceRegenerate→重新合并) + CORS allowHeaders补充apikey(修复video-proxy 100%失败) + preferredResolution客户端支持
 * v6.0.110: 客户端视频下载三重故障修复(proxy-first策略反转+双端AbortController超时+场景号追踪) + video-proxy上游30s超时防挂起+504响应
 * v6.0.109: 批量合并分辨率多数派漂移修复(全局预过滤+getVideoResolution) — concatMP4 per-batch过滤导致intermediate被误排除
 * v6.0.108: ClientVideoMerger客户端合并下载HTTP401修复(三级下载策略: 直接下载OSS→代理下载+双重认证头→跳过) + MP4分辨率不匹配宽容合并(排除异分辨率段继续拼接)
 * v6.0.107: useEpisodeActions完整重建(fast_apply_tool截断修复) + handleMergeVideos skippedEpisodes本地合并自动触发
 * v6.0.106: merge-all-videos OOM防御(per-episode >6分镜跳过服务端+skippedEpisodes信号) + 死依赖清理(FFmpeg.wasm/tw-animate-css)
 * v6.0.105: 视频合并OOM多层防御(merge-videos提前路由useClientMerge+前端智能跳过+纯TS MP4 concat替换FFmpeg.wasm)
 * v6.0.104: 生成心跳机制增强(批次级+重试+对话润色三处心跳) + 前端卡住检测修复(函数名冲突+双信号追踪+阈值调优)
 * v6.0.103: 画面风格一致性增强(视觉风格指南全量注入+���格DNA锚点) + 生成卡住前端自愈
 * v6.0.102: 管理员付款推送通知(GET /admin/pending-count + useAdminPaymentPoller + Header角标)
 * v6.0.101: 视频合并无感化(StoryboardEditor自动合并+智能下载按钮，服务器→FFmpeg本地回退)
 * v6.0.100: 管理员无限配额修复(AdminPanel用户列表isAdmin标记+后端freeLimit=-1)
 * v6.0.99: 客户端本地视频合并(FFmpeg.wasm)+服务器轻量代理(/video-proxy)
 * v6.0.98: ProfilePanel配额卡片+useVideoQuota hook+StoryboardEditor配额徽章+移动端管理员入口
 * v6.0.97: 配额超限事件总线+PaymentDialog/AdminPanel集成+Header管理入口
 *          - 后端: import { ADMIN_PHONE } from constants.ts（之前ADMIN_PHONE为app.tsx局部常量）
 *          - 前端: utils/events.ts事件总线+PaymentDialog/AdminPanel挂载到App.tsx
 * v6.0.96: 每日配额+管理员面板+Toast修复+合并WORKER_LIMIT修复
 * v6.0.95: Volcengine偶发失败前端自动重试+分辨率修复增强
 *          - 修复: [前端] hooks.ts handleBatchGenerate——Volcengine failed场景自动重试1次(间隔10s)
 *                  根因: 批量生成遇到「视频生成失败(状态:failed)」无重试直接标记draft
 *          - 修复: [前端] StoryboardVideoMerger auto-fix——分辨率不一致重新生成时自���重试1次(间隔10s)
 *                  根因: generateStoryboardVideo失败无重试→failedFix增加→fixedCount==0时全部中止
 * v6.0.94: 幂等性窗口3→10min防误判 + generate-full-ai并行进度分段更新
 *          - 修复: generate-full-ai幂等性防护窗口 3分钟→10分钟
 *                  根因: 每批次AI+retry最多需要约3分钟(90s AI+2s+90s retry)
 *                        2集批次连续两批=6分钟无updateProgress → 误判为卡住 → 允许重复提交 → 双进程并发写DB
 *          - 修复: generate-full-ai并行完成后补充Step2进度更新(原Step1+2合并仅一条进度记录)
 * v6.0.93: 视频合并分辨率修复+生成进度跨导航保持+并行生成优化
 *          - 关键修复: mp4concat.ts新增preferredResolution选项修复majority-vote选错分辨率根因
 *          - 关键修复: merge-videos路由查询coherence_check.aspectRatio→ASPECT_TO_RESOLUTION映射→传给concatMP4
 *          - 关键修复: StoryboardVideoMerger部分修复失败时继续合并(fixedCount>0即可)而非全部中止
 *          - 功能: 分镜video生成状态DB持久化(generating)→跨导航进度保持→5秒轮询更新完成状态
 *          - 前端: useStoryboardBatchGeneration/handleGenerate/handleRegenerateVideo均PATCH generating到DB
 * v6.0.92: 画面比例专属构图强制指令——修复竖屏/方屏下角色主体不在主画面的问题
 *          - 根本原因: Seedance模型默认按16:9横屏构图习惯生成，输出竖屏(720×1280)时角色位置偏移至边缘
 *          - 修复: volcengine/generate��由新增ASPECT_FRAMING_DIRECTIVES映射(9:16/1:1/3:4/4:3/16:9)
 *          - 注入位置: prompt最高优先级（styleLock之后第一行），强制模型按尺寸居中对焦主体
 *          - 9:16竖屏指令: 垂直中轴居中+头顶在20%-35%区域+人脸高度≥20%+严禁左右偏移裁切
 *          - 前端: AI生成分镜按钮loading状态+数据提取Bug修复+批量生成currentScene进度+智能生成7阶段定时器
 * v6.0.91: 修复generate-full-ai完成日志未定义变量(ReferenceError导致completed→failed)+路由索引行号校准+注释版本标签修正
 * v6.0.90: series_storyboards无generation_metadata列→移除该字段+generate-full-ai按批次写DB防OOM
 * v6.0.89: Unicode全量修复(137处→0)+死文件/依赖清理
 * v6.0.88: 代码审计重构+hooks拆分+changelog精简+版本号同步
 * v6.0.87: 分镜fallback必达+创建竞态修复+视频重新生成
 *          - 修复: fallback条件从sbAiFallback(需3次连续失败)改为!batchAiSuccess(AI+retry失败即兜底)
 *          - 根因: 2-3批的短剧(3-5集)AI全部失败时前1-2批零分镜，导致新建剧无分镜产出
 *          - 修复: POST /series创建时预设status='generating'消除轮询竞态
 *          - 功能: volcengine/generate新增forceRegenerate参数(跳过去重+清除旧任务+���除旧video_url)
 *          - 修复: 错误处理器stepName '生成异常' Unicode修复
 * v6.0.86: AI对白智能润色+生成质量统计+完成诊断增强
 *          - 后端: 空dialogue场景先用模板保底，再调用AI生成上下文相关对话（最多12场景，30s超时）
 *          - 后端: 生成质量统计(aiSuccess/repaired/retry/fallback批次+dialogue空率+AI润色数)
 *          - 后端: 统计持久化到generation_progress.qualityStats，前端可读���
 *          - 后端: 完成日志包含完整质量摘要(AI:N repair:N retry:N fb:N dlg:Nai/Ntpl/Nempty)
 *          - 后端: API响应体新增qualityStats对象，前端可展示生成报告
 * v6.0.85: 截断JSON恢复+空dialogue自动补填+分镜批次级进度
 *          - 后端: repairTruncatedStoryboardJSON三策略修复被截断的分镜JSON（嵌套提取→扁平提取→括号平衡）
 *          - 后端: generate-full-ai主路径+重试路径均使用JSON修复替代简单JSON.parse
 *          - 后端: generate-storyboards-ai独立分镜路由同步使用JSON修复
 *          - 后端: detectAndFillEmptyDialogues空dialogue自动补填（基于角色名+情感基调+场景位置）
 *          - 后端: generate-full-ai在DB写入前自动检测空dialogue并补填基础对话
 *          - 后端: 分镜批次循环内updateProgress写入批次级进度（第N/M批）到generation_progress
 *          - 前端: 已有轮询机制自动显示"正在生成分镜场景 (第2/5批, 共10集)"级别进度
 * v6.0.84: 自动生成流水线修复——分镜AI超时+角色描述增强+对白必填+视频重试韧性
 *          - 后端: generate-full-ai分镜AI timeout 45s→90s, max_tokens 6000→8000, 批次2集（原3集）
 *          - 后端: sbAiFallback从永久放弃改为单批重试(降temp)+连续3次失败才永久放弃
 *          - 后端: sbAiFallback入口条件修复VOLCENGINE_API_KEY||ALIYUN(原仅检查ALIYUN)
 *          - 后端: sbPrompt提升至try外部修复重试块作用域访问bug
 *          - 后端: 角色description 30-50字→80-120字+personality 10-20字→30-50字+relationships 20-40字
 *          - 后端: 独立角色生成charPromptFixed同步升级(description/personality/relationships)
 *          - 后端: 两处角色DB插入均合并ch.relationships到description字段
 *          - 后端: generate-full-ai+generate-storyboards-ai两路由dialogue强制必填
 *          - 后端: generate-storyboards-ai max_tokens 6000→7000(单集+必填对话增大输出)
 *          - 前端: 视频批量maxRetries 2→3, 间隔5s, 指数退避, 网络容忍5→8, aspectRatio双保险
 * v6.0.83: 社区接口aspectRatio透传+比例标签去重+竖屏卡��高度约束
 * v6.0.82: 全组件aspectRatio贯通+共享比例工具函数
 * v6.0.80: 画面比例信息展示+播放器宽高比自适应+旧剧兼容回退
 *          - 前端: SeriesEditor配置信息条(aspectRatio/resolution/style只读徽章)
 *          - 前端: SeriesCard标签+DetailModal属性网格新增画面比例和分辨率
 *          - 前端: EpisodePlayer根据aspectRatio自适应视频容器约束
 *          - 兼容: 旧剧���aspectRatio字段默认显示"16:9 (默认)"
 * v6.0.79: 视频画面比例选择——5种���例(9:16/16:9/1:1/4:3/3:4)×4种分辨率=20种宽高组合
 *          - 功能: 创建剧时选择画面比例（参考抖音/YouTube/Instagram等主流平台）
 *          - 后端: coherence_check存储aspectRatio，volcengine/generate根据比例×分辨率映射精确宽高
 *          - 强制: 同一部剧全部分镜保持一致画面比例（seriesId+storyboardNumber时从coherence_check读取）
 * v6.0.78: 分镜衔接增强+剧集连贯性+transitionFromPrevious注入+cliffhanger持久化
 *          - 增强: episode行保存cliffhanger/previousEpisodeLink到key_moment META后缀
 *          - 增强: generate-storyboards-ai读取前集cliffhanger+当前集previousEpisodeLink注入prompt
 *          - 增强: volcengine/generate注入当前分镜transitionFromPrevious镜头衔接指令
 *          - 增强: volcengine/generate从前一分镜generation_metadata提取endingVisualState
 *          - 保护: coherence_check更新时spread保留resolution/isPublic等已有字段
 * v6.0.77: H265默认+自动降级+视频时长10s+角色微特征锁定+OSS补传+分辨率统一
 *          - 优化: volcengine/generate默认H265编码（更高画质），API失败时自动降级H264��试
 *          - 优化: 分镜默认时长8s→10s（Seedance 1.5 Pro支持最长12s）
 *          - 强化: 角色面部微特征(痣/疤痕/酒窝)位置锁定——提示词+视觉��格指南+Seedance后缀三层约束
 *          - 修复: volcengine/status已完成但非OSS的URL触发后台补传（修复fire-and-forget静默失败）
 *          - 前端: 移除编码手动选择UI，全自动H265+降级
 * v6.0.76: H265前端编码选择UI+设置中心集成
 * v6.0.75: 修复重复生成(幂等性防护)+视频轮询韧性+H265编码支持
 * v6.0.73: 消除@别名依赖+相对路径迁移根治白屏
 * v6.0.72: 修复sonner-shim toast方法+作品类型选择
 * v6.0.71: 重构审计: CreationProgressOverlay提取+全量死代码/DB调用扫描(零问题)
 * v6.0.70: 作品社区发布开关: 公开/私有切换+社区过滤+创建向导集成
 *          - isPublic存储在coherence_check JSONB内(零DDL), POST/PUT/GET全链路
 *          - 社区列表+相似+详情过滤私有, 创建向导+编辑器Globe/Lock开���
 * v6.0.69: 视频质量全链路优化: 分辨率严格校验+角色一致性+中国审美+反重复
 *          - mp4concat严格模式+SEEDANCE/角色/分镜/大纲全链路增强+前端422解析
 * v6.0.68: 前端极限模块合并: 模块图从77→45（四波合并省32模块）
 * v6.0.65: concatMP4分辨率宽容模式——修复合并丢分镜根因（不再跳过分辨率不一致的段）
 *          - ��因: i2v场景视频可能与t2v场景分辨率不一致，concatMP4 majority-vote静默丢弃minority段
 *          - 修复: concatMP4改为permissive mode——所有段全部包含��不跳过（现代H.264解码器处理流内SPS变更）
 *          - 修复: merge-videos/merge-all添加validSceneNumbers追踪数组，skippedSegments索引→场景号映射
 *          - 新增: StoryboardVideoMerger failedScenes诊断面板+一键重试+前端超时适配
 * v6.0.64: (merged into v6.0.65)
 * v6.0.63: 合并视频修复+跨集衔接+角色对话一致性+路由索引刷新
 *          - 修复: merge-videos/merge-all 并行下载→顺序下载+3次重试（解决分镜丢失/时长不足/8s问题）
 *          - 新增: volcengine/generate 跨集i2v图片注入（scene 1自动用上集末尾图片）
 *          - 新增: volcengine/generate 跨集场景上下文注入（上集末尾描述+对话+情感）
 *          - 增强: volcengine/generate 邻场景对话内容注入（dialogue字��不再被忽略）
 *          - 增强: generate-storyboards-ai 新增第7~8条连贯性约束（对话角色锁定+角色出场追踪）
 *          - 增强: generate-storyboards-ai 新增对话匹配规则（说话者全名+禁幽灵角色）
 *          - 增强: merge-videos响应新增failedScenes/totalStoryboards/downloadedCount字段
 *          - 前端: useStoryboardBatchGeneration强制按sceneNumber排序（保证顺序生成）
 *          - 维护: 路由索引v6.0.63刷新（v6.0.55→v6.0.63漂移+8~78行）
 * v6.0.62: 批量分镜生成实装——前端TODO清零（handleSmartGenerate逐集+网络韧性+进度反馈）
 * v6.0.61: VideoHealthAlert+SeriesVideoHealthChecker组件实现（EpisodeManager两处TODO激活）
 * v6.0.60: 分享功能实装——shareUtils统一分享工具+3处handler完善（SeriesViewer/CommunityPanel/CommunityInteractions）
 * v6.0.59: EpisodeCard prop drilling消除（4工具函数→直接导入）+formatDuration共享化
 * v6.0.58: PlaylistVideoPlayer.handleVideoError DRY重构（reloadAndPlay/updateCurrentVideoUrl/bumpRetry）
 * v6.0.57: Unicode乱码修复(apiClient/useEdgeFunctionStatus) + EdgeFunctionError版本号动态化
 * v6.0.56: EdgeFunctionError迁移至apiClient（re-export getApiUrl/projectId），constants/api导入15→2处终态
 * v6.0.55: 刷新路由索引L~行号（16域[A]-[P]全部校���，v6.0.49以来累积+6行偏移）
 * v6.0.54: apiClient迁移收官——apiUpload新增+3文件9处fetch迁移（ReferenceImageInput/videoMerger/volcengine），constants/api导入15→3处
 * v6.0.53: 4个组件文件7处fetch迁移至apiClient（VideoUrlDiagnostic/PlaylistErrorView/PlaylistVideoPlayer/SeriesViewer）
 * v6.0.52: 5个hooks文件10处手动fetch迁移至apiClient（useWizardAI/useVideoGeneration/useHlsPlayer/usePlaylistLoader/useStoryboardBatchGeneration）
 * v6.0.51: 6文件12处手动fetch迁移至统一apiClient（CharacterManager/SeriesFixTool/useSeriesEditorActions/StoryboardEditor/ImmersiveVideoViewer/LoginDialog）
 * v6.0.50: /utils/supabase/info导入归一至api.ts单一入口、后端9模块版本头同步v6.0.50
 * v6.0.49: aiGenerationService合并入seriesService、getAuthOnlyHeaders统一5文件Authorization、路由索引行号刷新
 * v6.0.48: 前端URL统一化——13文件手工URL迁移至getApiUrl()、generateStoryboardsAI去重迁移
 * v6.0.47: 代码质量优化——volcApiPost工具函数提取、aiEpisodeGenerator迁移apiRequest、路由索引+域分区注释
 * v6.0.46: mp4concat.ts拆分——851行→mp4-parser.ts(353)+mp4-builder.ts(177)+mp4concat.ts(353)
 * v6.0.45: SeriesViewer.tsx拆分——集���useAutoAdvance hook（505行→443行）
 * v6.0.44: 死代码扫描+清理（零功能变更）
 *          - 清理: helpers.ts移除未使用的getCameraMovement()（app.tsx直接用PRO_SHOT_MAP常量）
 *          - 清理: types/index.ts移除未使用的ShotType/CameraMovement类型（仅内部引用,无外部消费者）
 *          - 清理: EpisodePlayer.tsx移除重复的局部formatTime，改用共享utils/formatters导入
 *          - 清理: 后端types.ts移除未使用的AICallResult接口（定义后从未被import）
 *          - 激活: ErrorBoundary.tsx接入App.tsx根组件（全局错误捕获+友好错误界面）
 *          - 标记: 5条后端AI/图像路由(ai/generate-story-enhanced等)前端无调用方,保留为运维/未来用途
 * v6.0.43: app.tsx Unicode乱码修复#5#6（零功能变更）
 *          - 修复: L3937 epGenPromptLines "故事??展"→override变量epGenPromptFixed(.replace修正)
 *          - 修复: L4816 注释 "???使"→添加纠正注释"即使 enrich 失败也使用封面回退"
 * v6.0.42: 重复基础设施代码清理（零功能变更）
 *          - 重构: app.tsx内联基础设施代码替换为模块import（constants/utils/ai-service/oss-service/rate-limiter/helpers）
 *          - 清理: 移除~550行重复定义（常量/AI路由/Supabase客户端/工具函数/OSS函数/速率限制器）
 *          - 修复: 孤儿代码碎片清理（export-mp4 orphaned line）+deploy-verify内联环境变量读取
 * v6.0.41: 后端模块化拆分+模块文件创建（零功能变更）
 *          - 重构: 基础设施代码拆分为7个独立模块文件（types/constants/utils/ai-service/oss-service/rate-limiter/helpers）
 *          - 重构: 模块文件位于同级目录，Supabase Edge Function bundler 正确打包静态导入链
 *          - 优化: 前端immersive/VideoPlayer.tsx拆分（HLS逻辑提取为useHlsPlayer hook）
 * v6.0.40: MP4拼接分辨率majority-vote+thumbnail_url修复
 *          - 修复: series_storyboards.thumbnail_url列不存在——全部select/update移除该列,改用image_url回退
 *          - 修复: MP4拼接分辨率不一致不再hard-fail——改为majority-vote选择主流分辨率,跳过异常段
 *          - 优化: concatMP4返回skippedSegments信息,调用方日志可追踪被跳过的分镜
 * v6.0.39: 合并始终产出MP4+直接下载
 *          - 架构: merge-videos始终产出真实MP4+OSS存储(消灭playlist/inline-json回退)
 *          - 功能: 下载改为前端直接fetch blob(零后端调用)
 *          - 安全: merge-videos增加所有权校验(仅制作者可合并)
 *          - 清理: export-mp4端点废弃(保留兼容桩)
 * v6.0.38: 打包下载MP4+制作者所有权校验
 *          - 功能: POST /episodes/:episodeId/export-mp4 打包下载(MP4拼接+OSS上传+所有权校验)
 *          - 安全: 仅series.user_phone===userPhone的制作者可下载，非制作者返回403
 * v6.0.37: 分镜展示修复+封面修复+视频下载+发现页默认全部
 *          - 修复: 发现页封面缺失——coverFallbackMap增加storyboard thumbnail_url + video_tasks缩略图回退
 *          - 修复: 发现页默认选中"全部"而不是"漫剧系列"
 *          - 修复: community/series/:id 分镜关联episode_number匹配改用Number()防类型不匹配
 *          - 功能: 合并视频下载——MP4直接下载/播放列表逐段下载（含OSS签名+进度提示）
 * v6.0.36: 多作品类型系统+专业视听语言知识库+全链路AI提示词增强
 *          - 功能: PRODUCTION_TYPE_PROMPTS 8种作品类型专业化配置 + PRO_SHOT_MAP景别→运镜指令映射
 *          - 优化: generate-full-ai第10/11条(景别编排+蒙太奇) + generate-storyboards-ai景别知识注入
 *          - 优化: volcengine/generate注入camera_angle的PRO_SHOT_MAP运镜指令 + 标题AI感知作品类型
 *          - 优化: 剧集大纲prompt注入三幕结构/英雄之旅叙事理论+作品类型叙事要求
 * v6.0.35: Seedance 2.0全链路分镜优化+发现页分页修复+generate-full-ai增强+Unicode乱码修复
 *          - 优化: generate-storyboards-ai分镜prompt注入Seedance 2.0描述指南（动作拆解/光影必写/禁模糊词）
 *          - 优化: generate-full-ai分镜prompt新增cameraAngle/timeOfDay字段+动作拆解指南（第9条要求）
 *          - 修复: generate-full-ai分镜构建使用AI生成的cameraAngle/timeOfDay替代硬编码模板
 *          - 修复: community/series分页over-fetch 3x补偿post-filter underfill（dbOffset=page*limit*3）
 *          - 修复: 4处Unicode乱码（charPrompt/大纲prompt/sbPrompt2/visualStyleGuide）用clean override绕过不可编辑的损坏字节
 * v6.0.34: 移动端风格选择一致性+发现完整集过滤+Seedance 2.0视频提示词增强
 *          - 功能: 发现页仅展示至少完成完整1集的漫剧系列（post-enrichment过滤）
 *          - 优化: volcengine/generate视频提示词注入Seedance 2.0专业约束（运镜/画质/防崩/i2v一致性）
 *          - 前端: 移动端创作面板风格选择改为wrap网格布局，与PC端一致
 * v6.0.33: 前端死代码/死导出清理（CommunityWork死类型+apiPut死函数+4个Props de-export）
 *          - 性能: GET /series/:id 三个子查询(characters+episodes+storyboards)从串行改为Promise.all并行
 *          - 清理: 前端seriesServicePG.ts合并入seriesService.ts并删除（消除冗余服务文件）
 *          - 清理: useSeries.ts移除冗余fallback（getUserSeries已内置maxRetries:2）
 *          - 清理: volcengine.ts GenerateVideoParams、batchVideoGeneration.ts BatchGenerationProgress de-export
 * v6.0.31: 死代码深度清理(21个死类型/6个死常量/VERSION.txt删除)
 * v6.0.30: 3个前端死导出清理(getViewingHistory/getEpisodeMergeStatus/getBatchGenerationStatus)
 * v6.0.29: count聚合优化全覆盖 + VideoPlayer组件恢复 + 未用包清理
 *          - 性能: community/works + user/:phone/works的likes查询从fetch-all-rows改为per-item head:true count
 *          - 修复: 前端VideoPlayer组件恢复（series/子组件引用的简单video wrapper被误删）
 *          - 清理: package.json移除11个未被任何文件导入的包
 * v6.0.28: 前端大文件全面拆分完成 + 死代码清理（后端无变更）
 *          - 拆分: SeriesViewer.tsx → 498行 + 5个子模块(viewer/)
 *          - 拆分: HomeCreationPanel.tsx → 431行 + ReferenceImageInput组件
 *          - 清理: 移除旧的内联回调函数(handleRefImageUpload等)
 * v6.0.27: 6处views列不存在修复（series表无views列）
 *          - 修复: getUserSeries select移除views列
 *          - 修复: 社区列表select移除views列
 *          - 修复: 社区列表popular排序改为created_at（views列不存在）
 *          - 修复: 社区列表映射views改为0（series表无views列）
 *          - 修复: 社区详情select移除views列
 *          - 修复: 社区详情映射views改为0（series表无views列）
 * v6.0.26: 8处schema不匹配修复（likes_count/comments_count/shares_count列不存在于series表）
 *          - 修复: 社区列表结果映射改用likesCountMap/commentsCountMap（之前误引series.likes_count）
 *          - 修复: 社区列表评论批量查询列名series_id→work_id（comments表实际使用work_id）
 *          - 修复: 社区详情select移除likes_count/shares_count/comments_count���改为并行count查询
 *          - 修复: 社区详情映射改用detailLikesCount/detailCommentsCount（之前仍读series.likes_count/comments_count）
 *          - 修复: 相似推荐select移除likes_count，改为created_at排序+批量likes count查询
 *          - 修复: 评论路由移除comments_count反规范化更新（列不存在）
 *          - 修复: 分享路由shares_count乐观锁→无状态stub（列不存在，与works/share对齐）
 * v6.0.25: 前端大文件拆分(SeriesViewer+HomeCreationPanel) + 死代码清理（后端无变更）
 * v6.0.24: 数据库查询全面精简（零功能变更）
 *          - 性能: 剩余24处 select('*') → 精确字段列表（详情/角色/剧集/分镜/评论/任务/浏览历史）
 *          - 性能: sync-video-tasks + recover-all-tasks 6处批量查询精简（排除prompt等大字段）
 *          - 性能: community/series/:id 详情页episodes/storyboards仅传输前端实际使用的字段
 * v6.0.23: 数据库调用深度优化（零功能变更）
 *          - 性能: 30+处 select('*') → 精确字段列表，series列表不再传输story_outline/coherence_check大字段
 *          - 性能: like-status/user-works/storyboards-ai 串行查询改为 Promise.all 并行
 *          - 性能: merge-all-videos/rebuild-merged-urls N+1查询→批量预取所有storyboard再内存分组
 *          - 性能: volcengine/status + refresh-video 三重顺序查找→.or()单次查询
 * v6.0.22: 分辨率一致性 + 进度通知精简 + 构��修复
 *          - 修复: 不同分镜视频尺寸不一致——volcengine/generate系列分镜强制seedance-1-5-pro+720p锁定
 *          - 修复: mp4concat.ts新增分辨率一致性校验（不一致时抛错回退播放列表）
 *          - 修复: 移除重复进度提示（toast.loading + fixed浮窗），仅保留右上角TaskStatusFloating
 *          - 构建: server/index.tsx替换为轻量级桩文件（不导入app.tsx，避免双函数打包超限）
 * v6.0.21: 真实MP4拼接+前场景图片参考注入+下载按钮
 *          - 核心: mp4concat.ts 纯TS MP4解析/拼接模块——多段MP4合并为单个完整视频文件
 *          - 核心: merge-videos/repair-video/merge-all 三路由"MP4拼接优先→播放列表回退"三级策略
 *          - 核心: volcengine/generate 前一场景图片自动注入——t2v自动升级为i2v提升视觉连贯性
 *          - 优化: rebuild-merged-urls 统一video_url空字符串过滤
 *          - 前端: 合并结果区分完整文件/播放列表标签+MP4下载按钮
 * v6.0.20: 合并分镜修复+重新合并+进度条seek+分镜连贯性强化
 *          - 修复: merge-videos/repair-video/merge-all/旧merge 4路由统一强化video_url过滤（排除空字符串和非http链接���
 *          - 修复: 合并时增加场景号详细日志+缺失分镜警告
 *          - 优化: generate-storyboards-ai 6条强化连贯性约束（角色/环境/时间/情感/动作/构图递进）
 *          - 优化: volcengine/generate 注入前2+后1场景完整上下文（含地点/时段/镜头/情感信息）
 *          - 优化: generate-full-ai 分镜prompt新增location/timeOfDay一致性+画面质量约束
 * v6.0.19: 火山引擎Doubao多模型智能路由 + 社区散乱分镜修复 + 封面缩略图修复
 *          - 新增: callAI()统一AI文本生成——Doubao Pro/Mini/Lite三级模型按任务复杂度自动路由
 *          - 新增: 模型token耗尽自动降级（Pro→Mini→Lite→Qwen fallback），30分��冷却后重试
 *          - 修复: community/works过滤掉属于系列的分镜视频（generation_metadata含seriesId的不再散乱显示）
 *          - 修复: 系列封面自动回退到首集缩略图/首个分镜图片，WorkCard优先使用thumbnail字段
 *          - 优化: 社区默认展示「漫剧系列」标签，移动端卡片布局紧凑化
 * v6.0.18: AI限流补全 + 快捷键帮助 + 相似推荐���航优化
 *          - 新增: generate-basic-info/generate-outline路由添加X-User-Phone频率限制（共享aiGenerate 5次/min）
 *          - 新增: ?键快捷键帮助浮层（7个快捷键说明 + 桌面端左下角?按钮）
 *          - 优化: 全剧终推荐作品点击改为onNavigateToSeries回调（取代window.location.hash hack）
 * v6.0.17: 播放体验增强 + 通用限流 + 键盘快捷键
 *          - 新增: 最后一集播完"全剧终"卡片（重播/选集/返回社区）
 *          - 新增: 通过createRateLimiter工厂 → upload/generate/createSeries/comment四路由限流
 *          - 新增: SeriesViewer键盘快捷键（Esc/←→/空格/Enter/L）+ 倒计时浮层缩略图
 *          - 新增: 后端community/series/:id/similar推荐接口 + 全剧终推荐卡片
 *          - 修复: 剧集列表状态判断补充mergedVideoUrl
 * v6.0.16: 六大修复——风格锁定/角色一致性/社区自动切集/状态修复/新风���+参考图/真实进度
 *          - 修复: volcengine/generate+retry 强制DB风格覆盖请求参数
 *          - 强化: 角色prompt外貌50-80字+参考图+身份锁定 | 新增: upload-image路由
 *          - 修复: 社区有videoUrl/mergedVideoUrl即completed | TaskStatusFloating真实进度轮询
 *          - 新增: 3D渲染/油画/水彩/黑白电影/蒸汽朋克/古风仙侠风格 + 参考图上传
 *          - 修复: PlaylistVideoPlayer onPlaylistEnded + SeriesViewer自动切集
 * v6.0.15: 分镜衔接连贯性增强——prompt三层改进 + crossfade过渡 + iOS内存清理
 *          - 核心: generate-full-ai 分镜prompt增加场景衔接7项要求 + transitionFromPrevious/endingVisualState
 *          - 核心: volcengine/generate 视频生成时注入前后场景描述（消除视频独立生成割裂感）
 *          - 核心: generate-storyboards-ai 增强——注入角色外貌卡/风格指南/前后集上下文
 *          - 后端: refresh-video 增强——重新查询火山引擎 + 自动转存OSS
 *          - 前端: PlaylistVideoPlayer crossfade过渡 + iOS slot B内存清理
 *          - 前端: ImmersiveVideoViewer 过期URL显示恢复覆盖层（不再直接关闭）
 * v6.0.14: 视频播放修复: CORS代理 + URL签名 + 过期恢复
 *          - 新增: POST /oss/fetch-json 后端代理路由（绕过 OSS CORS 限制）
 *          - 修复: 前端 PlaylistVideoPlayer 直接 fetch 失败时自动回退后端代��
 *          - 修复: SeriesViewer 切集时对 OSS 视频 URL 预签名
 *          - 修复: ImmersiveVideoViewer 新增"尝试恢复视频"按钮
 *          - 修复: PlaylistVideoPlayer z-index 层级防止控件被视频遮挡
 * v6.0.13: 构建修复 + 四项UX修复
 *          - 构建: server/index.tsx 同步到v6.0.13（此前停在v6.0.8，可能导致Supabase部署失败）
 *          - UX: 作品页 SeriesCard 添加卡片级 onClick，解决手机端触摸无法进入编辑
 *          - UX: community/works + 单系列详情 completedEpisodes 改为 status=completed || videoUrl
 *          - UX: 创作页默认风格改为 realistic、默认集数改为3，新增 comic/pixel 风格
 *          - UX: PlaylistVideoPlayer 重写为双缓冲方案，消除分镜切换加载画面
 * v6.0.12: 输入校验全面加固 + 常量提取 + 死代码清理
 *          - 安全: 全部6处 totalEpisodes 赋值钳制 1-50（含 create-from-idea、fix-episodes、generate-full-ai、DB来源）
 *          - 安全: sceneCount 钳制 1-30、volcengine prompt 限制 5000 字
 *          - 安全: 全部5处分页 limit 钳制 1-100、page_size 钳制 1-100、page ≥ 1
 *          - 常量: DASHSCOPE_IMAGE_URL + DASHSCOPE_TASKS_BASE_URL 提取（消除最后2处硬编码阿里云URL）
 *          - 注释: community/works likes 查询加 limit(5000) + NOTE 记录 PostgREST ���断风险
 *          - 清理: 前端 optimizedApiClient.ts 删除7个死导出 + networkOptimization.ts 删除13个死导出
 * v6.0.11: 安全+性能+代码质量深度审查
 *          - 安全: PUT /series/:id 白名单移除 views/likes_count/comments_count/shares_count 防客户端伪造计数
 *          - 并发: POST /series/:id/like + /community/works/:workId/like 竞态条件防护（23505唯一约束冲突→优雅降级为unlike）
 *          - 去重: 提取 fetchWithTimeout() 辅助函数，消除21处重复的 AbortController+setTimeout 样板代码
 *          - 清理: community/publish 移除3个未使用解构变量（title/style/duration）
 * v6.0.10: 后端9个死路由清理 + 19处遗漏静默catch补日志 + 死函数getOSSPublicUrl移除
 *          路由从93→84：/series/test, /series/test-direct-method, /modules-status,
 *          /series/:id/analyze, /series/:id/progress, /users/login, /users/:phone,
 *          /series/:id/process-step, /series/batch-fix
 * v6.0.9: 21处静默catch块补console.error日志 + 版本号同步
 * v6.0.8: 分镜/分集一致性增强——视觉风格指南 + 角色外貌锁定 + ���集剧情上下文 + 强化prompt
 * v6.0.7: GET /volcengine/tasks 自愈机制——自动检测孤儿任务(系列��删除)并标记cancelled
 * v6.0.3: 视频生成任务去重——/volcengine/generate 三层去重 + GET /series/:id/video-task-status
 * v5.6.1: OSS转存改为fire-and-forget（非��塞），解决状态轮询超时+请求风暴
 *         volcengine/status 端点: 查询火山引擎超时降至25s，视频完成后立即返回原始URL
 *         OSS转存在后台异步执行，不阻塞前端轮询响应
 * v5.6.0: AI漫剧内容多样化 + 视频与故事主题匹配 + 视频音频启用
 * v5.5.1: 修复 series_storyboards.episode_id 不存在 → 改用 series_id + episode_number 关联
 *         新增 /episodes/:id/merge-videos, merge-status, repair-video 路由
 * v5.2.0: 视频完成后自动同步缩略图/视频URL到series表 + 批量缩略图同步路由
 * v5.1.1: AI创作进度实时写入 + 失败状态改进
 *
 * 原因：Supabase Edge Function bundler 只打包入口点的静态导入链中的文件。
 * 子目录文件（database/、routes/、middleware/ 等）不被包含在部署包中。
 * 因此所有关键业务逻辑必须内联在此文件中。
 *
 * v5.1.1 修复:
 * - generate-full-ai: 每步写入 generation_progress 到DB，前端轮询可获取实时进度
 * - 失败时写入 status=failed + error 到 generation_progress，而非回退到 draft
 * - 补全缺失的 generateStoryboards 前端服务函数
 *
 * v5.0.5 修复:
 * - 前端��本号同步（消除残留v5.0.3引用）
 * - server/index.tsx this绑定修复（Deno.serve包装箭头函数）
 * - 前端冷启动重试间隔优化（8次渐进退避，覆盖78秒）
 * - 静默窗口从45秒放大到60秒
 *
 * v5.0.0 关键修复:
 * - npm subpath imports 版本锁定（hono/cors、hono/logger）
 * - queryWithRetry 支持 count 返回
 * - shares/views 路由修复（移除无效 RPC 调用）
 * - 移除无前缀的 redirect 路由避免 Edge Function 路由冲突
 */
import { Hono } from "npm:hono@4.0.2";
import { cors } from "npm:hono@4.0.2/cors";
import { logger } from "npm:hono@4.0.2/logger";
import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import { concatMP4 } from "./mp4concat.ts";

// ==================== 模块化���入（v6.0.42: 重复基础设施代码清理完成） ====================
import {
  APP_VERSION, PREFIX, ADMIN_PHONE, VOLCENGINE_API_KEY, ALIYUN_BAILIAN_API_KEY, SUPABASE_ANON_KEY,
  VOLCENGINE_BASE_URL, DASHSCOPE_IMAGE_URL, DASHSCOPE_TASKS_BASE_URL,
  IMAGE_BUCKET, STYLE_PROMPTS, SEEDANCE_BASE_SUFFIX, SEEDANCE_I2V_EXTRA,
  PRODUCTION_TYPE_PROMPTS, PRO_SHOT_MAP,
  MAX_SERVER_MERGE_SEGMENTS, MAX_SERVER_MERGE_SIZE_MB, ESTIMATED_SEGMENT_SIZE_MB,
} from "./constants.ts";
import {
  supabase, toCamelCase, toSnakeCase, truncateErrorMsg,
  isRetryableError, queryWithRetry, fetchWithTimeout,
} from "./utils.ts";
import { callAI } from "./ai-service.ts";
import { isOSSConfigured, uploadToOSS, transferFileToOSS, generatePresignedPutUrl } from "./oss-service.ts";
import { rateLimiters } from "./rate-limiter.ts";
import { getCinematographyBlock, repairTruncatedStoryboardJSON, detectAndFillEmptyDialogues } from "./helpers.ts";

// 本地环境变量读取（仅用于 deploy-verify 诊断和启动日志，业务逻辑使用模块导出）
const _SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';

// v6.0.93: Map series aspectRatio → expected WxH for concatMP4 preferredResolution hint
const ASPECT_TO_RESOLUTION: Record<string, string> = {
  '9:16': '720x1280',
  '16:9': '1280x720',
  '1:1':  '720x720',
  '4:3':  '960x720',
  '3:4':  '720x960',
};



// ==================== Hono App ====================

const app = new Hono();

// 安全绑定 console.log，避免某些运行时 this 上下文丢失
const logFn = (...args: any[]) => console.log(...args);
app.use('*', logger(logFn));

app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "Range", "X-User-Phone", "apikey"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    exposeHeaders: ["Content-Length", "Content-Range", "Accept-Ranges", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
    maxAge: 600,
  }),
);

app.onError((error, c) => {
  const msg = error?.message || String(error);
  // v6.0.122: "send was called before connect" 是 Deno TCP层竞态错误：
  // 客户端在服务端完成响应写入前断开连接（或TCP握手未完成），无法再发送任何响应。
  // 若此时仍尝试调用 c.json() 发送500，会触发同样错误形成递归——直接返回空响应静默忽略。
  if (
    msg.includes('send was called before connect') ||
    msg.includes('connection closed') ||
    msg.includes('Broken pipe') ||
    msg.includes('broken pipe') ||
    msg.includes('Connection reset by peer')
  ) {
    console.log(`[Global Error] Client disconnected early (ignored): ${msg.substring(0, 120)}`);
    return new Response('', { status: 200 });
  }
  console.error('[Global Error]', error);
  return c.json({ success: false, error: msg || 'Internal server error' }, 500);
});

// ======================================================================
//                       ROUTE INDEX / 路由索引
//  v6.0.91 — app.tsx 路由按业务域分区索引, 辅助 6500+ 行文件快速导航
// ======================================================================
//  [A] 系统基础    L~330   健康检查 / 版本 / 数据库诊断
//  [B] 用户管理    L~469   注册 / 登录 / 手机号验证 / 昵称
//  [C] 漫剧 CRUD   L~614   列表 / AI生成标题&大纲 / 详情 / 创建 / 更新 / 删除
//  [D] 社区 & 互动  L~1197  社区作品 / 用户作品 / 点赞 / 评论 / 分享
//  [E] 内容管理    L~1488  角色 / AI角色生成 / 剧集 / 分镜 / 视���任务
//  [F] 浏览 & 运维  L~1775  浏览历史 / 数据库健康
//  [G] 视频管道    L~1843  分镜视频生成 / 合并视频 / AI创意生成
//  [H] 火山引擎    L~2370  视频提交 / 状态查询 / Debug / 批量操作
//  [I] 社区补全    L~3353  社区作品评论 / 点赞 / 互动补全
//  [J] OSS & 同步   L~3577  视频转存OSS / 批量同步状态 / 综合恢复
//  [K] 生成管道    L~3976  缩略图同步 / 进度查询 / AI剧集生成 / 全量生成
//  [L] AI 路由     L~5099  剧集大纲 / ���事增强 / 图片生成 / prompt润色
//  [M] 社区系统    L~5297  社区漫剧列表 / 详情 / 浏览数
//  [N] 管理维护    L~5768  补全路由 / 诊断修复 / 去重清理
//  [O] 文件 & 签名  L~6296  图片上传 / OSS URL签名 / 视频任务状态
//  [P] 兜底        L~6487  404处理
// ======================================================================

// ==================== [A] 健康检查 ====================

const healthHandler = (c: any) => c.json({
  status: "ok",
  timestamp: new Date().toISOString(),
  version: APP_VERSION,
  apiKeyConfigured: !!VOLCENGINE_API_KEY,
  aiConfigured: !!ALIYUN_BAILIAN_API_KEY,
});
// 只使用带前缀的路由，避免 Edge Function 路由冲突
app.get(`${PREFIX}/health`, healthHandler);

const testHandler = (c: any) => c.json({ status: "ok", message: "Server is running", version: APP_VERSION });
app.get(`${PREFIX}/test`, testHandler);

// 部署验证 - 全面检查所有子系统
app.get(`${PREFIX}/deploy-verify`, async (c) => {
  const checks: Record<string, any> = {};
  const startTime = Date.now();

  // 1. 模块加载验证
  checks.modules = {
    hono: typeof Hono === 'function',
    cors: typeof cors === 'function',
    logger: typeof logger === 'function',
    supabaseClient: typeof createClient === 'function',
  };

  // 2. 环境变量检查（直接读取，仅用于诊断展示）
  checks.envVars = {
    SUPABASE_URL: !!_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    SUPABASE_ANON_KEY: !!SUPABASE_ANON_KEY,
    VOLCENGINE_API_KEY: !!VOLCENGINE_API_KEY,
    ALIYUN_BAILIAN_API_KEY: !!ALIYUN_BAILIAN_API_KEY,
    ALIYUN_OSS_ACCESS_KEY_ID: !!Deno.env.get('ALIYUN_OSS_ACCESS_KEY_ID'),
    ALIYUN_OSS_ACCESS_KEY_SECRET: !!Deno.env.get('ALIYUN_OSS_ACCESS_KEY_SECRET'),
    ALIYUN_OSS_BUCKET_NAME: !!Deno.env.get('ALIYUN_OSS_BUCKET_NAME'),
    ALIYUN_OSS_REGION: !!Deno.env.get('ALIYUN_OSS_REGION'),
  };

  // 3. 数据库连接测试
  try {
    const dbStart = Date.now();
    const { error } = await supabase.from('users').select('phone').limit(1);
    checks.database = {
      connected: !error,
      latencyMs: Date.now() - dbStart,
      error: error ? error.message : null,
    };
  } catch (dbErr: any) {
    checks.database = { connected: false, error: dbErr.message };
  }

  // 4. Supabase客户端验证
  checks.supabaseClient = {
    initialized: !!supabase,
    urlConfigured: _SUPABASE_URL.includes('supabase.co'),
  };

  // 5. 路由统计
  checks.routing = {
    prefix: PREFIX,
    version: APP_VERSION,
    mode: 'self-contained',
  };

  const totalLatency = Date.now() - startTime;
  const allModulesOk = Object.values(checks.modules).every(v => v === true);
  const dbOk = checks.database?.connected === true;
  const envOk = checks.envVars.SUPABASE_URL && checks.envVars.SUPABASE_SERVICE_ROLE_KEY;

  return c.json({
    status: allModulesOk && dbOk && envOk ? 'ok' : 'degraded',
    version: APP_VERSION,
    deployHash: 'rf_20260214_v608_visual_coherence',
    timestamp: new Date().toISOString(),
    totalLatencyMs: totalLatency,
    checks,
    summary: {
      modulesLoaded: allModulesOk,
      databaseConnected: dbOk,
      envConfigured: envOk,
      volcengineReady: !!VOLCENGINE_API_KEY,
      aiReady: !!ALIYUN_BAILIAN_API_KEY,
      ossConfigured: isOSSConfigured(),
      ossBucket: Deno.env.get('ALIYUN_OSS_BUCKET_NAME') || 'NOT SET',
      ossRegion: Deno.env.get('ALIYUN_OSS_REGION') || 'NOT SET',
      ossEndpoint: isOSSConfigured() ? `${Deno.env.get('ALIYUN_OSS_BUCKET_NAME')}.${Deno.env.get('ALIYUN_OSS_REGION')}.aliyuncs.com` : 'NOT CONFIGURED',
    },
  });
});

// ==================== 用户管理 ====================

// 共享登录逻辑：查找或创建用户，返回 camelCase 用户对象
async function handleUserLogin(phone: string): Promise<{ user: any; error?: string }> {
  // v6.0.23: select specific fields instead of *
  const { data: existing } = await supabase
    .from('users')
    .select('id, phone, nickname, avatar_url, created_at, updated_at')
    .eq('phone', phone)
    .maybeSingle();

  if (existing) {
    return { user: toCamelCase(existing) };
  }

  const { data: newUser, error } = await supabase
    .from('users')
    .insert({ phone, nickname: `用户${phone.slice(-4)}` })
    .select()
    .single();

  if (error) {
    console.error('[Users] Create failed:', error);
    return { user: null, error: error.message };
  }
  return { user: toCamelCase(newUser) };
}

// 用户登录 - 前端 LoginDialog.tsx 使用此路径
app.post(`${PREFIX}/user/login`, async (c) => {
  try {
    const body = await c.req.json();
    const phone = body.phone;
    if (!phone) return c.json({ error: '缺少手机号' }, 400);

    const result = await handleUserLogin(phone);
    if (result.error) return c.json({ error: result.error }, 500);
    // 返回格式: { user: ... } — 保持向后兼容
    return c.json({ success: true, user: result.user });
  } catch (error: any) {
    console.error('[Users] Login error:', truncateErrorMsg(error));
    return c.json({ error: error.message }, 500);
  }
});

// 获取用户资料 - /user/profile/:phone
app.get(`${PREFIX}/user/profile/:phone`, async (c) => {
  try {
    const phone = c.req.param('phone');
    // v6.0.23: select specific fields instead of *
    const { data, error } = await supabase
      .from('users')
      .select('id, phone, nickname, avatar_url, created_at, updated_at')
      .eq('phone', phone)
      .maybeSingle();

    if (error) return c.json({ error: error.message }, 500);

    if (!data) {
      // 自动创建用户
      const { data: newUser, error: createErr } = await supabase
        .from('users')
        .insert({ phone, nickname: `用户${phone.slice(-4)}` })
        .select()
        .single();
      if (createErr) return c.json({ error: createErr.message }, 500);
      return c.json({ success: true, user: toCamelCase(newUser) });
    }

    return c.json({ success: true, user: toCamelCase(data) });
  } catch (error: any) {
    console.error('[Users] Profile error:', truncateErrorMsg(error));
    return c.json({ error: error.message }, 500);
  }
});

// 创建或更新用户资料 - POST /user/profile
app.post(`${PREFIX}/user/profile`, async (c) => {
  try {
    const body = await c.req.json();
    const { phone, nickname, avatar } = body;
    if (!phone) return c.json({ error: '手机号不能为空' }, 400);

    // v6.0.23: select specific fields instead of *
    const { data: existing } = await supabase
      .from('users')
      .select('id, phone, nickname, avatar_url, created_at, updated_at')
      .eq('phone', phone)
      .maybeSingle();

    if (existing) {
      const updates: any = {};
      if (nickname) updates.nickname = nickname;
      if (avatar) updates.avatar_url = avatar;
      if (Object.keys(updates).length > 0) {
        const { data: updated, error } = await supabase
          .from('users')
          .update(updates)
          .eq('phone', phone)
          .select()
          .single();
        if (error) return c.json({ error: error.message }, 500);
        return c.json({ success: true, user: toCamelCase(updated) });
      }
      return c.json({ success: true, user: toCamelCase(existing) });
    }

    const { data: newUser, error } = await supabase
      .from('users')
      .insert({ phone, nickname: nickname || `用户${phone.slice(-4)}`, avatar_url: avatar || null })
      .select()
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ success: true, user: toCamelCase(newUser) });
  } catch (error: any) {
    console.error('[Users] Profile update error:', truncateErrorMsg(error));
    return c.json({ error: error.message }, 500);
  }
});

// 更新用户昵称 - PUT /user/profile/:phone/nickname
app.put(`${PREFIX}/user/profile/:phone/nickname`, async (c) => {
  try {
    const phone = c.req.param('phone');
    const { nickname } = await c.req.json();
    if (!phone) return c.json({ error: '手机号不能为空' }, 400);
    if (!nickname || nickname.trim() === '') return c.json({ error: '昵称不能为空' }, 400);
    if (nickname.length > 20) return c.json({ error: '昵称长度不能超过20个字符' }, 400);

    const { data, error } = await supabase
      .from('users')
      .update({ nickname: nickname })
      .eq('phone', phone)
      .select()
      .single();

    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: '用户不存在' }, 404);
    return c.json({ success: true, user: toCamelCase(data) });
  } catch (error: any) {
    console.error('[Users] Nickname update error:', truncateErrorMsg(error));
    return c.json({ error: error.message }, 500);
  }
});

// ==================== v6.0.96 视频配额 & 管理员 ====================

function dailyCountKey(phone: string, date: string) { return `daily_video_count:${phone}:${date}`; }
function dailyLimitKey(phone: string) { return `user_daily_limit:${phone}`; }
function paidCreditsKey(phone: string) { return `user_paid_credits:${phone}`; }
function paymentRecordKey(id: string) { return `payment_record:${id}`; }

async function getUserQuota(phone: string): Promise<{ usedToday: number; freeLimit: number; paidCredits: number; freeRemaining: number; totalRemaining: number }> {
  const today = new Date().toISOString().split('T')[0];
  const [{ data: cD }, { data: lD }, { data: pD }] = await Promise.all([
    supabase.from('kv_store_fc31472c').select('value').eq('key', dailyCountKey(phone, today)).maybeSingle(),
    supabase.from('kv_store_fc31472c').select('value').eq('key', dailyLimitKey(phone)).maybeSingle(),
    supabase.from('kv_store_fc31472c').select('value').eq('key', paidCreditsKey(phone)).maybeSingle(),
  ]);
  const usedToday = parseInt((cD as any)?.value || '0') || 0;
  const freeLimit = parseInt((lD as any)?.value || '5') || 5;
  const paidCredits = parseInt((pD as any)?.value || '0') || 0;
  const freeRemaining = Math.max(0, freeLimit - usedToday);
  return { usedToday, freeLimit, paidCredits, freeRemaining, totalRemaining: freeRemaining + paidCredits };
}

app.get(`${PREFIX}/user/video-quota/:phone`, async (c) => {
  try {
    const phone = c.req.param('phone');
    if (phone === ADMIN_PHONE) return c.json({ success: true, data: { usedToday: 0, freeLimit: 999, paidCredits: 0, freeRemaining: 999, totalRemaining: 999, isAdmin: true } });
    const quota = await getUserQuota(phone);
    return c.json({ success: true, data: { ...quota, isAdmin: false } });
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

app.post(`${PREFIX}/payment/record`, async (c) => {
  try {
    const { phone, amount, credits, note } = await c.req.json();
    if (!phone || !amount || !credits) return c.json({ error: '缺少必要参数' }, 400);
    if (amount < 5 || amount % 5 !== 0) return c.json({ error: '付款金额必须是5的整数倍' }, 400);
    const id = `pay_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const record = { id, phone, amount, credits, status: 'pending', note: note || '', createdAt: new Date().toISOString() };
    await supabase.from('kv_store_fc31472c').upsert({ key: paymentRecordKey(id), value: JSON.stringify(record) }, { onConflict: 'key' });
    const { data: listData } = await supabase.from('kv_store_fc31472c').select('value').eq('key', 'payment_records_index').maybeSingle();
    const idList: string[] = listData ? JSON.parse((listData as any).value || '[]') : [];
    idList.unshift(id);
    await supabase.from('kv_store_fc31472c').upsert({ key: 'payment_records_index', value: JSON.stringify(idList.slice(0, 500)) }, { onConflict: 'key' });
    console.log(`[Payment] New record: id=${id} phone=${phone} amount=${amount} credits=${credits}`);
    return c.json({ success: true, id });
  } catch (err: any) { console.error('[Payment] Record error:', err.message); return c.json({ error: err.message }, 500); }
});

app.get(`${PREFIX}/admin/users`, async (c) => {
  try {
    const adminPhone = c.req.query('adminPhone');
    if (adminPhone !== ADMIN_PHONE) return c.json({ error: '无权限' }, 403);
    const { data: usersData, error } = await supabase.from('users').select('id, phone, nickname, created_at, updated_at').order('created_at', { ascending: false }).limit(200);
    if (error) return c.json({ error: error.message }, 500);
    const today = new Date().toISOString().split('T')[0];
    const phones = (usersData || []).map((u: any) => u.phone);
    const kvKeys = phones.flatMap((p: string) => [dailyCountKey(p, today), dailyLimitKey(p), paidCreditsKey(p)]);
    let kvMap: Record<string, string> = {};
    if (kvKeys.length > 0) {
      for (let i = 0; i < kvKeys.length; i += 50) {
        const { data: kvData } = await supabase.from('kv_store_fc31472c').select('key, value').in('key', kvKeys.slice(i, i + 50));
        (kvData || []).forEach((row: any) => { kvMap[row.key] = row.value; });
      }
    }
    const users = (usersData || []).map((u: any) => {
      const isAdminUser = u.phone === ADMIN_PHONE;
      return {
        id: u.id, phone: u.phone, nickname: u.nickname || `用户${u.phone.slice(-4)}`,
        createdAt: u.created_at, updatedAt: u.updated_at,
        // v6.0.100: 管理员无限配额——isAdmin=true，freeLimit=-1 表示无限制
        isAdmin: isAdminUser,
        usedToday: isAdminUser ? 0 : (parseInt(kvMap[dailyCountKey(u.phone, today)] || '0') || 0),
        freeLimit: isAdminUser ? -1 : (parseInt(kvMap[dailyLimitKey(u.phone)] || '5') || 5),
        paidCredits: isAdminUser ? 0 : (parseInt(kvMap[paidCreditsKey(u.phone)] || '0') || 0),
      };
    });
    return c.json({ success: true, data: { users } });
  } catch (err: any) { console.error('[Admin] Users list error:', err.message); return c.json({ error: err.message }, 500); }
});

app.post(`${PREFIX}/admin/users/settings`, async (c) => {
  try {
    const { adminPhone, targetPhone, freeLimit, addCredits } = await c.req.json();
    if (adminPhone !== ADMIN_PHONE) return c.json({ error: '无权限' }, 403);
    if (!targetPhone) return c.json({ error: '缺少目标用户手机号' }, 400);
    const ops: Promise<any>[] = [];
    if (freeLimit !== undefined) ops.push(supabase.from('kv_store_fc31472c').upsert({ key: dailyLimitKey(targetPhone), value: String(Math.max(0, parseInt(freeLimit) || 5)) }, { onConflict: 'key' }));
    if (addCredits && parseInt(addCredits) > 0) {
      const { data: cd } = await supabase.from('kv_store_fc31472c').select('value').eq('key', paidCreditsKey(targetPhone)).maybeSingle();
      const cur = parseInt((cd as any)?.value || '0') || 0;
      ops.push(supabase.from('kv_store_fc31472c').upsert({ key: paidCreditsKey(targetPhone), value: String(cur + parseInt(addCredits)) }, { onConflict: 'key' }));
    }
    await Promise.all(ops);
    console.log(`[Admin] Updated quota for ${targetPhone}: freeLimit=${freeLimit}, addCredits=${addCredits}`);
    return c.json({ success: true });
  } catch (err: any) { console.error('[Admin] Settings error:', err.message); return c.json({ error: err.message }, 500); }
});

// v6.0.102: 轻量端点——仅返回待审核付款数量，供前端轮询通知用（不加载完整列表）
app.get(`${PREFIX}/admin/pending-count`, async (c) => {
  try {
    const adminPhone = c.req.query('adminPhone');
    if (adminPhone !== ADMIN_PHONE) return c.json({ error: '无权限' }, 403);
    const { data: indexData } = await supabase.from('kv_store_fc31472c').select('value').eq('key', 'payment_records_index').maybeSingle();
    const idList: string[] = indexData ? JSON.parse((indexData as any).value || '[]') : [];
    if (idList.length === 0) return c.json({ success: true, data: { pendingCount: 0 } });
    const keys = idList.slice(0, 50).map((id: string) => paymentRecordKey(id));
    const { data: kvData } = await supabase.from('kv_store_fc31472c').select('value').in('key', keys);
    const pendingCount = (kvData || []).filter((row: any) => {
      try { return JSON.parse(row.value)?.status === 'pending'; } catch { return false; }
    }).length;
    return c.json({ success: true, data: { pendingCount } });
  } catch (err: any) { console.error('[Admin] Pending count error:', err.message); return c.json({ error: err.message }, 500); }
});

app.get(`${PREFIX}/admin/payments`, async (c) => {
  try {
    const adminPhone = c.req.query('adminPhone');
    if (adminPhone !== ADMIN_PHONE) return c.json({ error: '无权限' }, 403);
    const { data: indexData } = await supabase.from('kv_store_fc31472c').select('value').eq('key', 'payment_records_index').maybeSingle();
    const idList: string[] = indexData ? JSON.parse((indexData as any).value || '[]') : [];
    if (idList.length === 0) return c.json({ success: true, data: { payments: [] } });
    const keys = idList.slice(0, 100).map((id: string) => paymentRecordKey(id));
    const { data: kvData } = await supabase.from('kv_store_fc31472c').select('key, value').in('key', keys);
    const payments = (kvData || []).map((row: any) => { try { return JSON.parse(row.value); } catch { return null; } }).filter(Boolean).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return c.json({ success: true, data: { payments } });
  } catch (err: any) { console.error('[Admin] Payments list error:', err.message); return c.json({ error: err.message }, 500); }
});

app.post(`${PREFIX}/admin/payments/approve`, async (c) => {
  try {
    const { adminPhone, paymentId, targetPhone, credits } = await c.req.json();
    if (adminPhone !== ADMIN_PHONE) return c.json({ error: '无权限' }, 403);
    const { data: rD } = await supabase.from('kv_store_fc31472c').select('value').eq('key', paymentRecordKey(paymentId)).maybeSingle();
    if (rD?.value) {
      const rec = JSON.parse((rD as any).value);
      rec.status = 'approved'; rec.approvedAt = new Date().toISOString();
      await supabase.from('kv_store_fc31472c').upsert({ key: paymentRecordKey(paymentId), value: JSON.stringify(rec) }, { onConflict: 'key' });
    }
    const { data: cd } = await supabase.from('kv_store_fc31472c').select('value').eq('key', paidCreditsKey(targetPhone)).maybeSingle();
    const cur = parseInt((cd as any)?.value || '0') || 0;
    await supabase.from('kv_store_fc31472c').upsert({ key: paidCreditsKey(targetPhone), value: String(cur + parseInt(credits)) }, { onConflict: 'key' });
    console.log(`[Admin] Approved payment ${paymentId}: +${credits} credits to ${targetPhone}`);
    return c.json({ success: true });
  } catch (err: any) { console.error('[Admin] Approve error:', err.message); return c.json({ error: err.message }, 500); }
});

app.post(`${PREFIX}/admin/payments/reject`, async (c) => {
  try {
    const { adminPhone, paymentId } = await c.req.json();
    if (adminPhone !== ADMIN_PHONE) return c.json({ error: '无权限' }, 403);
    const { data: rD } = await supabase.from('kv_store_fc31472c').select('value').eq('key', paymentRecordKey(paymentId)).maybeSingle();
    if (rD?.value) {
      const rec = JSON.parse((rD as any).value);
      rec.status = 'rejected'; rec.rejectedAt = new Date().toISOString();
      await supabase.from('kv_store_fc31472c').upsert({ key: paymentRecordKey(paymentId), value: JSON.stringify(rec) }, { onConflict: 'key' });
    }
    return c.json({ success: true });
  } catch (err: any) { console.error('[Admin] Reject error:', err.message); return c.json({ error: err.message }, 500); }
});

app.get(`${PREFIX}/admin/wechat-qr`, async (c) => {
  try {
    const { data } = await supabase.from('kv_store_fc31472c').select('value').eq('key', 'wechat_qr_url').maybeSingle();
    return c.json({ success: true, data: { url: (data as any)?.value || '' } });
  } catch { return c.json({ success: true, data: { url: '' } }); }
});

app.post(`${PREFIX}/admin/wechat-qr`, async (c) => {
  try {
    const { adminPhone, url } = await c.req.json();
    if (adminPhone !== ADMIN_PHONE) return c.json({ error: '无权限' }, 403);
    if (!url || !url.startsWith('http')) return c.json({ error: 'URL格式不正确' }, 400);
    await supabase.from('kv_store_fc31472c').upsert({ key: 'wechat_qr_url', value: url }, { onConflict: 'key' });
    return c.json({ success: true });
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

// ==================== 视频代理（轻量字节流转发，供客户端本地合并使用）====================
// v6.0.99: 服务器只做 HTTP 代理转发，零 FFmpeg 资源消耗，完全避免"服务器计算资源不足"
// v6.0.110: 上游 fetch 增加 30s 超时，防止死 URL 导致 Edge Function 挂起
// v6.0.114: 新增 POST handler — 避免 GET query string URL 过长导致浏览器 Failed to fetch

/** v6.0.130: DB fallback helper — 查DB获取已转存的OSS URL并代理返回
 *  从 series_storyboards 和 video_tasks 两表查询，video_tasks用JSONB过滤（不再全表扫描） */
async function tryDbFallback(videoUrl: string, context: { seriesId: string; episodeNumber: number; sceneNumber: number }, reason: string): Promise<Response | null> {
  try {
    console.log(`[VideoProxy] ${reason} for S${context.seriesId}/E${context.episodeNumber}/Sc${context.sceneNumber}, attempting DB fallback...`);
    // 优先查 series_storyboards
    const { data: sbRow } = await supabase.from('series_storyboards')
      .select('video_url')
      .eq('series_id', context.seriesId)
      .eq('episode_number', context.episodeNumber)
      .eq('scene_number', context.sceneNumber)
      .single();
    let ossUrl = sbRow?.video_url;
    // 若 storyboards 表无OSS URL，查 video_tasks（v6.0.130: JSONB过滤，不再全表扫描）
    if (!ossUrl || !ossUrl.includes('.aliyuncs.com')) {
      // 用 generation_metadata->>seriesId 过滤，大幅减少返回行数
      const { data: taskRows } = await supabase.from('video_tasks')
        .select('video_url, generation_metadata')
        .eq('status', 'completed')
        .filter('generation_metadata->>seriesId', 'eq', context.seriesId)
        .like('video_url', '%aliyuncs.com%');
      if (taskRows) {
        for (const t of taskRows) {
          const m = t.generation_metadata;
          if (m?.episodeNumber === context.episodeNumber
              && (m?.storyboardNumber === context.sceneNumber || m?.sceneNumber === context.sceneNumber)) {
            ossUrl = t.video_url;
            break;
          }
        }
      }
    }
    // v6.0.132: 允许DB URL与输入相同时也重试——超时可能是瞬态网络问题（不同于403签名过期）
    // 但仅对timeout场景重试同URL，403场景同URL确定无效
    const isSameUrl = ossUrl === videoUrl;
    const isTimeoutReason = reason.toLowerCase().includes('timeout');
    if (ossUrl && ossUrl.includes('.aliyuncs.com') && (!isSameUrl || isTimeoutReason)) {
      console.log(`[VideoProxy] ${isSameUrl ? '🔄 DB has same URL, retrying (timeout may be transient)...' : '✅ DB fallback found different OSS URL'} for scene ${context.sceneNumber}`);
      const fallbackResp = await fetch(ossUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VideoProxy/1.0)' },
        signal: AbortSignal.timeout(60_000),
      });
      if (fallbackResp.ok) {
        const rh: Record<string, string> = {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600',
          'X-VideoProxy-Fallback': 'db-oss',
        };
        const ct = fallbackResp.headers.get('content-type');
        if (ct) rh['Content-Type'] = ct;
        const cl = fallbackResp.headers.get('content-length');
        if (cl) rh['Content-Length'] = cl;
        return new Response(fallbackResp.body, { status: 200, headers: rh });
      } else {
        console.warn(`[VideoProxy] DB fallback OSS URL also failed: ${fallbackResp.status}`);
      }
    } else {
      console.warn(`[VideoProxy] No OSS fallback URL found in DB for scene ${context.sceneNumber}`);
    }
  } catch (dbErr: any) {
    console.warn(`[VideoProxy] DB fallback error: ${dbErr.message}`);
  }
  return null;
}

/** 内部: 统一处理 video-proxy 逻辑（GET / POST 共用）
 *  v6.0.132: timeout 30s→60s + DB fallback扩展到所有URL（不再限TOS）——OSS URL超时也查DB获取替代URL */
async function handleVideoProxy(videoUrl: string, context?: { seriesId?: string; episodeNumber?: number; sceneNumber?: number }): Promise<Response> {
  if (!videoUrl || !videoUrl.startsWith('https://')) {
    return new Response(JSON.stringify({ error: '仅支持 HTTPS URL' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const isTosUrl = videoUrl.includes('volces.com') || videoUrl.includes('tos-cn');
  const hasContext = context?.seriesId && context?.episodeNumber != null && context?.sceneNumber != null;
  // v6.0.132: 所有URL都可尝试DB fallback（OSS URL超时时DB可能有不同路径/key的URL）
  const canFallback = hasContext;

  try {
    // v6.0.132: 大视频文件需要更长时间——30s→60s（中国OSS从境外Edge Function下载较慢）
    const upstream = await fetch(videoUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VideoProxy/1.0)' },
      signal: AbortSignal.timeout(60_000),
    });
    if (!upstream.ok) {
      // v6.0.129+130: DB fallback — TOS URL返回403/401时，查DB获取OSS URL
      if ((upstream.status === 403 || upstream.status === 401) && canFallback) {
        const fallback = await tryDbFallback(videoUrl, context as any, `TOS ${upstream.status}`);
        if (fallback) return fallback;
      }
      return new Response(JSON.stringify({ error: `上游返回错误: ${upstream.status} ${upstream.statusText}`, detail: `upstream ${upstream.status}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    const responseHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    };
    const ct = upstream.headers.get('content-type');
    if (ct) responseHeaders['Content-Type'] = ct;
    const cl = upstream.headers.get('content-length');
    if (cl) responseHeaders['Content-Length'] = cl;
    return new Response(upstream.body, { status: 200, headers: responseHeaders });
  } catch (err: any) {
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    const statusCode = isTimeout ? 504 : 502;
    const detail = isTimeout ? '上游服务器响应超时(60s)' : err.message;
    console.error(`[VideoProxy] ${isTimeout ? 'Timeout' : 'Fetch error'}:`, err.message, '| url:', videoUrl.substring(0, 80));

    // v6.0.130: timeout/网络错误也尝试DB fallback——TOS URL超时通常意味着签名已过期
    // 之前只在 upstream 403 时才尝试，timeout 被完全跳过导致无法自愈
    if (canFallback) {
      const fallback = await tryDbFallback(videoUrl, context as any, `${isTimeout ? 'Timeout' : 'FetchError'}`);
      if (fallback) return fallback;
    }

    return new Response(JSON.stringify({ error: '代理请求失败', detail, timeout: isTimeout }), {
      status: statusCode,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

app.get(`${PREFIX}/video-proxy`, async (c) => {
  const encodedUrl = c.req.query('url');
  if (!encodedUrl) return c.json({ error: '缺少 url 参数' }, 400);
  let videoUrl: string;
  try { videoUrl = decodeURIComponent(encodedUrl); }
  catch { return c.json({ error: 'URL 解码失败' }, 400); }
  return handleVideoProxy(videoUrl);
});

// v6.0.114: POST handler — 客户端将 URL 放入请求体，避免 GET query string 超长导致 Failed to fetch
// v6.0.129: POST body 新增可选 seriesId/episodeNumber/sceneNumber，启用 DB fallback on 403
app.post(`${PREFIX}/video-proxy`, async (c) => {
  try {
    const body = await c.req.json();
    const videoUrl = body?.url;
    if (!videoUrl) return c.json({ error: '缺少 url 参数' }, 400);
    const context = (body.seriesId && body.episodeNumber != null && body.sceneNumber != null)
      ? { seriesId: body.seriesId, episodeNumber: body.episodeNumber, sceneNumber: body.sceneNumber }
      : undefined;
    return handleVideoProxy(videoUrl, context);
  } catch (err: any) {
    return c.json({ error: '请求体解析失败', detail: err.message }, 400);
  }
});

// v6.0.128: 批量刷新分镜视频URL——合并前调用，解决Volcengine TOS签名过期403
// 根因修复: Volcengine API GET task 返回的是同一个缓存签名URL(不会重签)，重查API无法修复过期403
// 正确策略: 优先从DB查最新URL(可能已被后台OSS转存更新为aliyuncs.com公开桶URL)
//           只有DB无OSS URL时才fallback到Volcengine API + HEAD验证 + 同步OSS转存
app.post(`${PREFIX}/storyboards/bulk-refresh-urls`, async (c) => {
  try {
    const { seriesId, episodeNumber, items } = await c.req.json();
    // items: [{ sceneNumber, currentUrl }]
    if (!Array.isArray(items) || items.length === 0) {
      return c.json({ success: true, data: { results: [] } });
    }

    const results: Array<{ sceneNumber: number; originalUrl: string; freshUrl: string; source: string }> = [];

    // 找出需要刷新的Volcengine TOS URL（volces.com / tos-cn 开头的域名）
    const volcItems = items.filter((it: any) =>
      it.currentUrl && (it.currentUrl.includes('volces.com') || it.currentUrl.includes('tos-cn'))
    );
    const ossItems = items.filter((it: any) =>
      it.currentUrl && !it.currentUrl.includes('volces.com') && !it.currentUrl.includes('tos-cn')
    );

    // v6.0.132: OSS URL也做HEAD验证（之前盲目passthrough，但OSS URL也可能超时/不可达）
    // 并发HEAD检查，timeout 8s；失败时查DB是否有替代URL
    for (let i = 0; i < ossItems.length; i += 4) {
      const batch = ossItems.slice(i, i + 4);
      const batchResults = await Promise.all(batch.map(async (it: any) => {
        try {
          const headResp = await fetchWithTimeout(it.currentUrl, { method: 'HEAD' }, 8000);
          if (headResp.ok || headResp.status === 304) {
            return { sceneNumber: it.sceneNumber, originalUrl: it.currentUrl, freshUrl: it.currentUrl, source: 'oss-validated' };
          }
          // OSS returned error (403/404/etc) — try DB for alternative URL
          console.warn(`[BulkRefresh] OSS HEAD ${headResp.status} for scene ${it.sceneNumber}, checking DB...`);
        } catch (headErr: any) {
          // Timeout or network error — try DB for alternative URL
          console.warn(`[BulkRefresh] OSS HEAD failed for scene ${it.sceneNumber}: ${headErr.message}, checking DB...`);
        }
        // DB fallback: check if there's a different URL in storyboards or video_tasks
        if (seriesId && episodeNumber) {
          const { data: sbRow } = await supabase.from('series_storyboards')
            .select('video_url').eq('series_id', seriesId).eq('episode_number', episodeNumber).eq('scene_number', it.sceneNumber).single();
          if (sbRow?.video_url && sbRow.video_url !== it.currentUrl && sbRow.video_url.startsWith('http')) {
            console.log(`[BulkRefresh] Scene ${it.sceneNumber}: DB has different URL, using it`);
            return { sceneNumber: it.sceneNumber, originalUrl: it.currentUrl, freshUrl: sbRow.video_url, source: 'oss-db-fallback' };
          }
        }
        // No alternative — mark as unreachable so client can handle
        return { sceneNumber: it.sceneNumber, originalUrl: it.currentUrl, freshUrl: it.currentUrl, source: 'oss-unreachable' };
      }));
      results.push(...batchResults);
    }

    if (volcItems.length === 0) {
      return c.json({ success: true, data: { results } });
    }

    console.log(`[BulkRefresh] Processing ${volcItems.length} Volcengine TOS URLs for S${seriesId}/E${episodeNumber}`);

    // v6.0.128 步骤1: 查DB中series_storyboards的最新video_url
    // 客户端内存可能缓存旧的TOS URL，但DB可能已被后台OSS转存更新为aliyuncs.com
    const sceneNumbers = volcItems.map((it: any) => it.sceneNumber);
    const dbStoryboardMap = new Map<number, string>();
    if (seriesId && episodeNumber) {
      const { data: sbRows } = await supabase.from('series_storyboards')
        .select('scene_number, video_url')
        .eq('series_id', seriesId)
        .eq('episode_number', episodeNumber)
        .in('scene_number', sceneNumbers);
      if (sbRows) {
        for (const sb of sbRows) {
          if (sb.video_url) dbStoryboardMap.set(sb.scene_number, sb.video_url);
        }
      }
    }

    // 步骤2: 查video_tasks记录（v6.0.130: JSONB过滤，不再全表扫描）
    const { data: taskRows } = await supabase.from('video_tasks')
      .select('task_id, volcengine_task_id, video_url, status, generation_metadata')
      .eq('status', 'completed')
      .not('volcengine_task_id', 'is', null)
      .filter('generation_metadata->>seriesId', 'eq', seriesId || '');

    // 建立 sceneNumber → task 映射
    const sceneTaskMap = new Map<number, any>();
    if (taskRows) {
      for (const t of taskRows) {
        const meta = t.generation_metadata;
        if (meta?.episodeNumber === episodeNumber) {
          const scn = meta.storyboardNumber || meta.sceneNumber;
          if (scn) sceneTaskMap.set(scn, t);
        }
      }
    }

    // 步骤3: 逐场景解析最佳可用URL（并发限制=4）
    const CONCURRENCY = 4;
    for (let i = 0; i < volcItems.length; i += CONCURRENCY) {
      const batch = volcItems.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map(async (it: any) => {
        const scn = it.sceneNumber;

        // ── 优先级1: DB series_storyboards 已有OSS URL ──
        const dbSbUrl = dbStoryboardMap.get(scn);
        if (dbSbUrl && dbSbUrl.includes('.aliyuncs.com')) {
          console.log(`[BulkRefresh] Scene ${scn}: ✅ OSS URL found in storyboards DB`);
          return { sceneNumber: scn, originalUrl: it.currentUrl, freshUrl: dbSbUrl, source: 'db-oss' };
        }

        // ── 优先级2: video_tasks 表已有OSS URL ──
        const task = sceneTaskMap.get(scn);
        if (task?.video_url && task.video_url.includes('.aliyuncs.com')) {
          console.log(`[BulkRefresh] Scene ${scn}: ✅ OSS URL found in video_tasks DB`);
          // 同步到series_storyboards以便下次直接命中优先级1
          if (seriesId && episodeNumber) {
            await supabase.from('series_storyboards').update({ video_url: task.video_url, updated_at: new Date().toISOString() })
              .eq('series_id', seriesId).eq('episode_number', episodeNumber).eq('scene_number', scn);
          }
          return { sceneNumber: scn, originalUrl: it.currentUrl, freshUrl: task.video_url, source: 'db-task-oss' };
        }

        // ── 优先级3: DB中有非TOS URL（其他CDN等），���接返回 ──
        if (dbSbUrl && !dbSbUrl.includes('volces.com') && !dbSbUrl.includes('tos-cn') && dbSbUrl.startsWith('http')) {
          console.log(`[BulkRefresh] Scene ${scn}: non-TOS URL in DB`);
          return { sceneNumber: scn, originalUrl: it.currentUrl, freshUrl: dbSbUrl, source: 'db-other' };
        }

        // ── 优先级4: 查询Volcengine API（最后手段） ──
        if (!task?.volcengine_task_id || !VOLCENGINE_API_KEY) {
          return { sceneNumber: scn, originalUrl: it.currentUrl, freshUrl: it.currentUrl, source: 'no-task-id' };
        }

        try {
          const apiResp = await fetchWithTimeout(
            `${VOLCENGINE_BASE_URL}/${task.volcengine_task_id}`,
            { method: 'GET', headers: { 'Authorization': `Bearer ${VOLCENGINE_API_KEY}`, 'Content-Type': 'application/json' } },
            15000
          );
          if (!apiResp.ok) {
            console.warn(`[BulkRefresh] Volcengine API ${apiResp.status} for scene ${scn}`);
            return { sceneNumber: scn, originalUrl: it.currentUrl, freshUrl: it.currentUrl, source: 'api-error' };
          }
          const apiData = await apiResp.json();
          if (!['succeeded', 'completed', 'success'].includes(apiData.status || '')) {
            return { sceneNumber: scn, originalUrl: it.currentUrl, freshUrl: it.currentUrl, source: 'not-completed' };
          }
          const volcUrl = apiData.content?.video_url || apiData.video_url || '';
          if (!volcUrl) {
            return { sceneNumber: scn, originalUrl: it.currentUrl, freshUrl: it.currentUrl, source: 'no-url' };
          }

          // v6.0.128: HEAD验证URL是否可访问（Volcengine可能返回同一个已过期签名URL）
          let urlAccessible = true;
          try {
            const headResp = await fetchWithTimeout(volcUrl, { method: 'HEAD' }, 8000);
            if (headResp.status === 403 || headResp.status === 401) {
              console.warn(`[BulkRefresh] Scene ${scn}: Volcengine URL still expired (HEAD ${headResp.status})`);
              urlAccessible = false;
            }
          } catch { urlAccessible = false; }

          if (urlAccessible) {
            // URL有效——更新DB + 后台OSS转存（尽快持久化防再次过期）
            await supabase.from('video_tasks').update({ video_url: volcUrl, updated_at: new Date().toISOString() }).eq('task_id', task.task_id);
            if (seriesId && episodeNumber) {
              await supabase.from('series_storyboards').update({ video_url: volcUrl, updated_at: new Date().toISOString() })
                .eq('series_id', seriesId).eq('episode_number', episodeNumber).eq('scene_number', scn);
            }
            // fire-and-forget OSS转存
            if (isOSSConfigured() && !volcUrl.includes('.aliyuncs.com')) {
              (async () => {
                try {
                  const tr = await transferFileToOSS(volcUrl, `videos/${task.task_id}.mp4`, 'video/mp4');
                  if (tr.transferred) {
                    await supabase.from('video_tasks').update({ video_url: tr.url }).eq('task_id', task.task_id);
                    await supabase.from('series_storyboards').update({ video_url: tr.url })
                      .eq('series_id', seriesId).eq('episode_number', episodeNumber).eq('scene_number', scn);
                    console.log(`[BulkRefresh] ✅ Background OSS transfer done for scene ${scn}`);
                  }
                } catch (e: any) { console.warn(`[BulkRefresh] Background OSS transfer failed for scene ${scn}: ${e.message}`); }
              })().catch(() => {});
            }
            console.log(`[BulkRefresh] ✅ Scene ${scn}: Volcengine URL valid, returned directly`);
            return { sceneNumber: scn, originalUrl: it.currentUrl, freshUrl: volcUrl, source: 'volcengine-valid' };
          }

          // v6.0.129: TOS签名URL过期后，GET和HEAD都会403（签名嵌在query string中，与HTTP方法无关）
          // 因此跳过sync OSS transfer（会尝试下载过期URL→必定403→浪费120s timeout）
          // 直接标记为irrecoverable，让前端提示用户重新生成视频
          console.warn(`[BulkRefresh] Scene ${scn}: URL irrecoverably expired (TOS signed URL, HEAD ${403}), skipping futile sync transfer`);
          return { sceneNumber: scn, originalUrl: it.currentUrl, freshUrl: it.currentUrl, source: 'expired-irrecoverable' };
        } catch (err: any) {
          console.warn(`[BulkRefresh] Scene ${scn} refresh failed: ${err.message}`);
          return { sceneNumber: scn, originalUrl: it.currentUrl, freshUrl: it.currentUrl, source: 'error' };
        }
      }));
      results.push(...batchResults);
    }

    const resolved = results.filter(r => r.freshUrl !== r.originalUrl).length;
    const sources = results.reduce((acc: any, r) => { acc[r.source] = (acc[r.source] || 0) + 1; return acc; }, {});
    console.log(`[BulkRefresh] Done: ${resolved}/${volcItems.length} URLs resolved. Sources:`, JSON.stringify(sources));
    return c.json({ success: true, data: { results } });
  } catch (error: any) {
    console.error('[BulkRefresh] Error:', error.message);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ==================== 漫剧列表 ====================

app.get(`${PREFIX}/series`, async (c) => {
  try {
    const userPhone = c.req.header('x-user-phone') || c.req.query('userPhone');
    if (!userPhone) return c.json({ error: '缺少用户手机号' }, 400);

    // v6.0.23: select specific fields —— drop story_outline/coherence_check (large JSONB) from list view
    const result = await queryWithRetry(
      () => supabase
        .from('series')
        .select('id, title, description, genre, style, status, cover_image_url, total_episodes, user_phone, created_at, updated_at, current_step, total_steps, generation_progress, error, coherence_check')
        .eq('user_phone', userPhone)
        .order('created_at', { ascending: false }),
      'getUserSeries'
    );

    if (result.error) {
      console.error('[Series] List error:', truncateErrorMsg(result.error));
      return c.json({ error: result.error.message }, 500);
    }

    const seriesList = result.data || [];

    // v6.0.8: 批量查询所有 series 的 episode 计数（消除 N+1 查询）
    // 之前对每个 series 单独 count，N 个 series = N 次 DB 查询
    // 现在一次性查询所有 episode 行的 series_id，客户端分组计数
    let episodeCountMap = new Map<string, number>();
    if (seriesList.length > 0) {
      try {
        const seriesIds = seriesList.map((s: any) => s.id);
        const { data: epRows, error: epCountErr } = await supabase
          .from('series_episodes')
          .select('series_id')
          .in('series_id', seriesIds);
        if (!epCountErr && epRows) {
          for (const row of epRows) {
            episodeCountMap.set(row.series_id, (episodeCountMap.get(row.series_id) || 0) + 1);
          }
        }
      } catch (batchErr: any) {
        console.warn('[Series] Batch episode count failed (non-blocking):', batchErr.message);
      }
    }

    const seriesWithStats = seriesList.map((series: any) => {
      const totalEpisodes = episodeCountMap.get(series.id) || 0;
      // v6.0.70: 提取 isPublic（默认 true），不传输完整 coherence_check 到前端列表
      const isPublic = series.coherence_check?.isPublic !== false;
      const { coherence_check: _cc, ...seriesRest } = series;
      return toCamelCase({
        ...seriesRest,
        is_public: isPublic,
        episodes: [],
        characters: [],
        stats: {
          characters_count: 0,
          episodes_count: totalEpisodes,
          storyboards_count: 0,
          completed_videos_count: 0,
        },
      });
    });

    return c.json({ success: true, data: seriesWithStats, count: seriesWithStats.length });
  } catch (error: any) {
    console.error('[Series] List error:', truncateErrorMsg(error));
    return c.json({ error: error.message }, 500);
  }
});

// ==================== AI生成漫剧基本信息（必须在 series/:id 之前注册） ====================

app.post(`${PREFIX}/series/generate-basic-info`, async (c) => {
  try {
    const body = await c.req.json();
    const userInput = body.userInput || '';

    // v6.0.18: 频率限制（通过X-User-Phone header识别用户）
    const userPhone = c.req.header('X-User-Phone') || '';
    if (userPhone) {
      const rateCheck = rateLimiters.aiGenerate.check(userPhone);
      if (!rateCheck.allowed) {
        return c.json({ success: false, error: `AI生成请求过于频繁，请${rateCheck.retryAfter}秒后重试` }, 429);
      }
    }

    // v6.0.19: 无任何AI key��使用fallback
    if (!VOLCENGINE_API_KEY && !ALIYUN_BAILIAN_API_KEY) {
      const fallbackTitles = [
        { title: '星辰之约', description: '在繁华都市的霓虹灯下，两个看似毫无交集的灵魂因一次意外相遇，从此开启了一段充满欢笑与泪水的旅程。��们将在彼此的世界中发现真正的自我。' },
        { title: '破晓之刃', description: '末世降临，文明崩塌。一位失去记忆的少年在废墟中醒来，手中握着一把散发微光的古剑。为了找回过去的真相，他踏上了穿越危险地带的冒险之旅。' },
        { title: '云端食堂', description: '退休大厨老张意外获得了一间悬浮在云端的神秘食堂。每道菜都能唤醒食客尘封的记忆。温暖治愈的美食故事，讲述人间烟火中的点滴感动。' },
        { title: '代码恋人', description: '天才女程序员在调试AI系统时，意外激活了一个拥有情感的虚拟人格。当虚拟与现实的界限开始模糊，一段跨越次元的爱情悄然萌芽。' },
        { title: '龙族传承', description: '少年林枫在祖传玉佩中发现了通往修仙界的秘密。拜入仙门后，他发现自己竟是远古龙族的后裔，一场关乎三界存亡的大战即将来临。' },
      ];
      const pick = fallbackTitles[Math.floor(Math.random() * fallbackTitles.length)];
      return c.json({ success: true, data: pick, fallback: true });
    }

    const prompt = userInput
      ? `你是一位专业的漫剧编剧。用户提供了以下创意灵感：\n"${userInput}"\n\n请根据这个灵感，生成一个吸引人的漫剧标题和详细简介。\n\n要求：\n1. 标题：简洁有力，4-10个字\n2. 简介：100-200字，要有吸引力，交代核心设定、主要冲突和卖点\n\n请严格按以下JSON格式回复（不要包含markdown标记）：\n{"title":"标题","description":"简介"}`
      : `你是一位专业的漫剧编剧。请随机创作一个有趣的漫剧概念，可以是爱情、悬疑、奇幻、科幻、都市等任意题材。\n\n要求：\n1. 标题：简洁有力，4-10个字，有创意\n2. 简介：100-200字，要有吸引力，交代核心设定、主要冲突和卖点\n\n请严格按以下JSON格式回复（不要包含markdown标记）：\n{"title":"标题","description":"简介"}`;

    // v6.0.19: 多模型智能路由（medium tier — 简短生成任务）
    const aiResult = await callAI({
      messages: [{ role: 'user', content: prompt }],
      tier: 'medium',
      temperature: 0.9,
      timeout: 60000,
    });
    const content = aiResult.content;

    // 尝试解析JSON
    let parsed: any = null;
    try {
      const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      const titleMatch = content.match(/["']?title["']?\s*[:：]\s*["']([^"']+)["']/);
      const descMatch = content.match(/["']?description["']?\s*[:：]\s*["']([^"']+)["']/);
      if (titleMatch && descMatch) {
        parsed = { title: titleMatch[1], description: descMatch[1] };
      }
    }

    if (parsed && parsed.title && parsed.description) {
      return c.json({ success: true, data: { title: parsed.title, description: parsed.description } });
    }

    console.warn('[AI] generate-basic-info: Failed to parse structured response, using raw text');
    return c.json({ success: true, data: { title: content.substring(0, 20), description: content.substring(0, 200) } });
  } catch (error: any) {
    console.error('[AI] generate-basic-info error:', truncateErrorMsg(error));
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ==================== AI生成故事大纲（必须在 series/:id 之前注册） ====================

app.post(`${PREFIX}/series/generate-outline`, async (c) => {
  try {
    const body = await c.req.json();
    const { title, description, genre, style, episodeCount = 10, existingOutline } = body;

    if (!title || !description) {
      return c.json({ success: false, error: '标题和简介不能为空' }, 400);
    }

    // v6.0.18: 频率限制（通过X-User-Phone header识别用户）
    const userPhone = c.req.header('X-User-Phone') || '';
    if (userPhone) {
      const rateCheck = rateLimiters.aiGenerate.check(userPhone);
      if (!rateCheck.allowed) {
        return c.json({ success: false, error: `AI生成请求过于频繁，请${rateCheck.retryAfter}秒后重试` }, 429);
      }
    }

    // v6.0.19: 无任何AI key时使用fallback
    if (!VOLCENGINE_API_KEY && !ALIYUN_BAILIAN_API_KEY) {
      const fallbackOutline = `【故事主线】\n${description}\n\n【分集大纲】\n` +
        Array.from({ length: Math.min(episodeCount, 10) }, (_, i) => {
          const epNum = i + 1;
          if (epNum === 1) return `第1集 - 命运的开端\n主角登场，日常生活中遭遇意外事件，命运的齿轮开始转动。`;
          if (epNum === 2) return `第2集 - 初次交锋\n主角面对第一个挑战，遇到重要配角，开始了解事件的真相。`;
          if (epNum === Math.ceil(episodeCount / 2)) return `第${epNum}集 - 转折点\n关键信息揭露，主角的信念受到动摇，需要做出重大抉择。`;
          if (epNum === episodeCount - 1) return `第${epNum}集 - 最终决战\n所有伏笔揭开，主角与终极对手正面对决，命运即将揭晓。`;
          if (epNum === episodeCount || epNum === 10) return `第${epNum}集 - 尘埃落定\n一切归于平静，主角完成成长，故事迎来结局，伏笔为续篇埋下种子。`;
          return `第${epNum}集 - 新的挑战\n故事持续发展，新角色出场，情节逐步深入，为高潮蓄力。`;
        }).join('\n\n');

      return c.json({ success: true, data: { outline: fallbackOutline }, fallback: true });
    }

    const outlineContext = existingOutline
      ? `\n\n用户已有的大纲素材（请在此基础上扩展和完善）：\n"${existingOutline}"`
      : '';

    const prompt = `你是一位专业的漫剧编剧。请根据以下信息，创作一个详细的故事大纲。

漫剧标题：${title}
剧集简介：${description}
类型：${genre || '未指定'}
风格：${style || '未指定'}
计划集数：${episodeCount}集${outlineContext}

请创作一个完整的故事大纲，包括：
1. 故事主线概述（50-100字）
2. 每一集的简要大纲（每集30-60字，包含该集标题）

请按以下格式输出（纯文本，不要JSON或markdown标记）：

【故事主线】
（在此写主线概述）

【分集大纲】
第1集 - 集标题
集内容简介

第2集 - 集标题
集内容简介

...以此类推直到第${episodeCount}集`;

    // v6.0.19: 多模型智能路由（heavy tier — 长篇大纲生成）
    const aiResult = await callAI({
      messages: [{ role: 'user', content: prompt }],
      tier: 'heavy',
      temperature: 0.8,
      max_tokens: 4000,
      timeout: 120000,
    });
    const outline = aiResult.content;

    if (!outline || outline.length < 50) {
      return c.json({ success: false, error: 'AI未返回有效大纲内容' }, 500);
    }

    return c.json({ success: true, data: { outline } });
  } catch (error: any) {
    console.error('[AI] generate-outline error:', truncateErrorMsg(error));
    if (error.name === 'AbortError') {
      return c.json({ success: false, error: 'AI生成超时，请重试' }, 504);
    }
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ==================== 漫剧详情 ====================

app.get(`${PREFIX}/series/:id`, async (c) => {
  try {
    const seriesId = c.req.param('id');

    // 获取基础信息
    const { data: seriesRows, error: seriesErr } = await queryWithRetry(
      () => supabase.from('series').select('*').eq('id', seriesId),
      'getSeries',
      3,  // 增加重试次数到3次
      1500
    );

    // 关键修复：区分数据库错误和"未找到"
    if (seriesErr) {
      console.error('[Series] DB error fetching series:', truncateErrorMsg(seriesErr));
      return c.json({
        success: false,
        error: `数据库查询错误: ${truncateErrorMsg(seriesErr)}`,
        message: 'Database error while fetching series',
        retryable: isRetryableError(seriesErr),
      }, 500);
    }

    if (!seriesRows || seriesRows.length === 0) {
      return c.json({ error: '漫剧不存在', message: 'Series not found' }, 404);
    }

    const series = seriesRows[0];

    // v6.0.32: 并行化三个独立子查询（characters + episodes + storyboards），减少总延迟
    // v6.0.37: 使用 select('*') 替代显式列名，避免表结构差异导致查询静默失败
    const [charResult, epResult, sbResult] = await Promise.all([
      queryWithRetry(
        () => supabase.from('series_characters').select('*').eq('series_id', seriesId).order('created_at', { ascending: true }),
        'Characters'
      ),
      queryWithRetry(
        () => supabase.from('series_episodes').select('*').eq('series_id', seriesId).order('episode_number', { ascending: true }),
        'Episodes'
      ),
      queryWithRetry(
        () => supabase.from('series_storyboards').select('*').eq('series_id', seriesId).order('episode_number', { ascending: true }).order('scene_number', { ascending: true }),
        'Storyboards'
      ),
    ]);

    const { data: characters, error: charErr } = charResult;
    if (charErr) console.warn('[Series] Characters query failed:', truncateErrorMsg(charErr));
    const { data: episodes, error: epErr } = epResult;
    if (epErr) console.warn('[Series] Episodes query failed:', truncateErrorMsg(epErr));
    const { data: storyboards, error: sbErr } = sbResult;
    if (sbErr) console.error('[Series] Storyboards query FAILED (causes 0-storyboards bug):', truncateErrorMsg(sbErr));

    // 将分镜关联到剧集（始终附加 storyboards 数组，即使为空）
    let enrichedEpisodes = episodes || [];
    if (enrichedEpisodes.length > 0) {
      const sbList = storyboards || [];
      // v6.0.89: O(N×M)→O(N+M) 优化——用Map索引替代逐集filter
      const sbMap = new Map<number, any[]>();
      for (const sb of sbList) {
        const epNum = Number(sb.episode_number);
        if (!sbMap.has(epNum)) sbMap.set(epNum, []);
        sbMap.get(epNum)!.push(sb);
      }
      enrichedEpisodes = enrichedEpisodes.map((ep: any) => ({
        ...ep,
        storyboards: sbMap.get(Number(ep.episode_number)) || [],
      }));
      // 诊断日志
      const totalSb = sbList.length;
      const attachedSb = enrichedEpisodes.reduce((s: number, ep: any) => s + (ep.storyboards?.length || 0), 0);
      if (totalSb > 0 && attachedSb === 0) {
        console.error(`[Series] BUG: ${totalSb} storyboards fetched but 0 attached! ep_nums=[${enrichedEpisodes.map((e: any) => e.episode_number)}], sb_ep_nums=[${[...new Set(sbList.map((s: any) => s.episode_number))]}]`);
      } else {
        console.log(`[Series] Enrichment: ${totalSb} storyboards → ${attachedSb} attached to ${enrichedEpisodes.length} episodes`);
      }
    }

    // 返回扁平化结构：series字段铺平到顶层，characters/episodes作为子属性
    // 前端 getSeriesDetails / pollSeriesProgress 依赖 data.status 读取状态
    const flatResult = {
      ...series,
      // v6.0.70: 顶层注入 is_public（前端从 isPublic 读取，默认 true）
      is_public: series.coherence_check?.isPublic !== false,
      characters: characters || [],
      episodes: enrichedEpisodes,
    };
    return c.json({
      success: true,
      data: toCamelCase(flatResult),
    });
  } catch (error: any) {
    console.error('[Series] Detail error:', truncateErrorMsg(error));
    return c.json({ error: error.message }, 500);
  }
});

// ==================== 创建漫剧 ====================

app.post(`${PREFIX}/series`, async (c) => {
  try {
    const body = await c.req.json();
    if (!body.userPhone && !body.user_phone) return c.json({ error: '缺少用户手机号' }, 400);

    // v6.0: 一键创作模式 — 当 title 为空时，AI自动生成标题和描述
    let enrichedBody = { ...body };
    const storyOutline = body.storyOutline || body.story_outline || '';
    const hasTitle = body.title && body.title.trim().length > 0;
    const hasDescription = body.description && body.description.trim().length > 0;

    if ((!hasTitle || !hasDescription) && storyOutline && (VOLCENGINE_API_KEY || ALIYUN_BAILIAN_API_KEY)) {
      try {
        // v6.0.36: 作品类型感知
        const _ptKey = body.productionType || body.production_type || 'short_drama';
        const _ptLabel = (PRODUCTION_TYPE_PROMPTS[_ptKey] || PRODUCTION_TYPE_PROMPTS.short_drama).label;
        console.log(`[Series] One-click mode: auto-generating title/description, prodType=${_ptKey}`);
        const genPrompt = `你是专业${_ptLabel}策划。用户的创意："${storyOutline}"
根据这段描述生成：1.吸引人的${_ptLabel}标题（2-8字）2.精彩简介（50-100字，体现${_ptLabel}专业质感）3.类型（romance/suspense/comedy/action/fantasy/horror/scifi/drama之一）
严格按JSON格式回复（不要markdown标记）：{"title":"标题","description":"简介","genre":"类型"}`;

        // v6.0.19: callAI 多模型路由（light tier — 短文本生成）
        const aiResult = await callAI({
          messages: [{ role: 'user', content: genPrompt }],
          tier: 'light',
          temperature: 0.7,
          max_tokens: 500,
          timeout: 30000,
        });
        {
          const content = aiResult.content;
          try {
            const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
            const parsed = JSON.parse(cleaned);
            if (!hasTitle && parsed.title) enrichedBody.title = parsed.title;
            if (!hasDescription && parsed.description) enrichedBody.description = parsed.description;
            if (!body.genre && parsed.genre) enrichedBody.genre = parsed.genre;
            console.log(`[Series] AI auto-generated: title="${parsed.title}", genre="${parsed.genre}"`);
          } catch {
            console.warn('[Series] AI title parse failed, using fallback');
          }
        }
      } catch (aiErr: any) {
        console.warn('[Series] AI auto-title failed:', aiErr.message);
      }
    }

    // 最终兜底：确保 title 不为��
    if (!enrichedBody.title || !enrichedBody.title.trim()) {
      const fallbackTitles = ['光影之间', '星辰序曲', '浮生如梦', '风起云涌', '心之所向', '破晓时分'];
      enrichedBody.title = fallbackTitles[Math.floor(Math.random() * fallbackTitles.length)];
    }
    if (!enrichedBody.description || !enrichedBody.description.trim()) {
      enrichedBody.description = storyOutline || enrichedBody.title;
    }

    // 将前端的 camelCase 转换为数据库的 snake_case
    const dbBody = toSnakeCase(enrichedBody);
    // v6.0.16: 参考图URL存入coherence_check JSON字段（避免需要DDL）
    // v6.0.117: 参考图同时作为styleAnchorImageUrl——跳过等首个场景完成的延迟
    //           后续所有分镜在无前序图时使用此图作为i2v风格锚点，确保从第一帧就风格统一
    if (body.referenceImageUrl) {
      dbBody.coherence_check = {
        ...(dbBody.coherence_check || {}),
        referenceImageUrl: body.referenceImageUrl,
        styleAnchorImageUrl: body.referenceImageUrl,
        styleAnchorSetAt: new Date().toISOString(),
        styleAnchorScene: 'user-upload',
      };
      console.log(`[Series] 🎨 Reference image set as style anchor: ${body.referenceImageUrl.substring(0, 60)}...`);
    }
    // 移除不存在的DB列
    delete dbBody.reference_image_url;
    // v6.0.36: 作品类型存入coherence_check JSON字段
    if (body.productionType) {
      dbBody.coherence_check = {
        ...(dbBody.coherence_check || {}),
        productionType: body.productionType,
      };
    }
    delete dbBody.production_type;

    // v6.0.70: 默认发布到社区（isPublic: true），用户可后续在编辑器中关闭
    dbBody.coherence_check = {
      ...(dbBody.coherence_check || {}),
      isPublic: body.isPublic !== undefined ? body.isPublic : true,
    };
    delete dbBody.is_public;

    // v6.0.78: 视��分辨率存入coherence_check（保证同一剧所有分镜一致）
    if (body.resolution) {
      dbBody.coherence_check = {
        ...(dbBody.coherence_check || {}),
        resolution: body.resolution,
      };
    }
    delete dbBody.resolution;

    // v6.0.79: 视频比例存入coherence_check（同一剧全部分镜保持一致比例）
    if (body.aspectRatio) {
      dbBody.coherence_check = {
        ...(dbBody.coherence_check || {}),
        aspectRatio: body.aspectRatio,
      };
    }
    delete dbBody.aspect_ratio;

    // v6.0.87: 如果有storyOutline，前端会立即触发generate-full-ai，
    // 预设status='generating'消除竞态（前端轮询在generate-full-ai更新前拿到'draft'导致停止轮询）
    if (storyOutline) {
      dbBody.status = 'generating';
    }

    const { data, error } = await supabase
      .from('series')
      .insert(dbBody)
      .select()
      .single();
    if (error) {
      console.error('[Series] Create error:', error);
      return c.json({ error: error.message }, 500);
    }
    return c.json({ success: true, data: toCamelCase(data) });
  } catch (error: any) {
    console.error('[Series] Create error:', truncateErrorMsg(error));
    return c.json({ error: error.message }, 500);
  }
});

// ==================== 更新漫剧 ====================

app.put(`${PREFIX}/series/:id`, async (c) => {
  try {
    const seriesId = c.req.param('id');
    const body = await c.req.json();
    console.log(`[Series] PUT /series/${seriesId}: keys=${Object.keys(body).join(',')}`);

    // 先验证系列存在（v6.0.89: 同时读取coherence_check，避免isPublic更新时额外查询）
    const { data: existing, error: existErr } = await supabase
      .from('series').select('id, coherence_check').eq('id', seriesId).maybeSingle();
    if (existErr) {
      console.error(`[Series] PUT lookup failed:`, existErr.message);
      return c.json({ error: `Series lookup failed: ${existErr.message}` }, 500);
    }
    if (!existing) {
      console.warn(`[Series] PUT series not found: ${seriesId}`);
      return c.json({ error: `Series ${seriesId} not found` }, 404);
    }

    // 将前端的 camelCase 转换为数据库的 snake_case
    const snakeBody = toSnakeCase(body);

    // 安全白名单：排除 views/likes_count/comments_count/shares_count 防止客户端伪造计数
    const allowedFields = [
      'title', 'description', 'genre', 'style', 'theme', 'story_outline',
      'core_values', 'total_episodes', 'cover_image_url', 'status',
      'generation_progress', 'coherence_check', 'updated_at',
      'current_step', 'completed_steps', 'total_steps', 'error',
      'target_audience', 'art_style', 'narrative_style'
    ];
    const cleanBody: any = {};
    for (const key of Object.keys(snakeBody)) {
      if (allowedFields.includes(key) && snakeBody[key] !== undefined) {
        cleanBody[key] = snakeBody[key];
      }
    }

    // v6.0.70: isPublic 存储在 coherence_check JSONB 内，需安全合并（不覆盖已有字段）
    // v6.0.89: 复用 existing.coherence_check（已在上方查询中获取），消除额外DB查询
    if (body.isPublic !== undefined) {
      cleanBody.coherence_check = {
        ...(existing?.coherence_check || {}),
        ...(cleanBody.coherence_check || {}),
        isPublic: !!body.isPublic,
      };
      console.log(`[Series] PUT isPublic=${body.isPublic} for series ${seriesId}`);
    }
    delete cleanBody.is_public; // is_public 不是独立DB列

    // v6.0.118: styleAnchorImageUrl 安全合并——允许前端更换风格锚定图
    // 与isPublic同理：存储在coherence_check JSONB内，需与已有字段合并而非覆盖
    if (body.styleAnchorImageUrl !== undefined) {
      const newAnchorUrl = body.styleAnchorImageUrl || '';
      cleanBody.coherence_check = {
        ...(existing?.coherence_check || {}),
        ...(cleanBody.coherence_check || {}),
        styleAnchorImageUrl: newAnchorUrl,
        styleAnchorSetAt: new Date().toISOString(),
        styleAnchorScene: newAnchorUrl ? 'user-upload' : '',
      };
      console.log(`[Series] PUT styleAnchorImageUrl updated for series ${seriesId}: ${newAnchorUrl ? newAnchorUrl.substring(0, 60) + '...' : '(cleared)'}`);
    }
    delete cleanBody.style_anchor_image_url; // 不是独立DB列

    // 如果没有有效字段，直接返回现有数据
    if (Object.keys(cleanBody).length === 0) {
      console.warn(`[Series] PUT no valid fields to update, returning existing`);
      const { data: cur } = await supabase.from('series').select('*').eq('id', seriesId).single();
      return c.json({ success: true, data: toCamelCase(cur) });
    }

    // 使用 Supabase client 执行更新
    cleanBody.updated_at = new Date().toISOString();
    const { data: updated, error: updateErr } = await supabase
      .from('series').update(cleanBody).eq('id', seriesId).select().single();

    if (updateErr) {
      console.error(`[Series] PUT update error:`, updateErr.message);
      return c.json({ error: `Update failed: ${updateErr.message}` }, 500);
    }

    return c.json({ success: true, data: toCamelCase(updated) });
  } catch (error: any) {
    console.error('[Series] Update error:', truncateErrorMsg(error));
    return c.json({ error: error.message }, 500);
  }
});

// ==================== 删除漫剧 ====================
// v6.0.5: 级联清理 — 删除系列时同步取消视频任务 + 清理所有关联数据

app.delete(`${PREFIX}/series/:id`, async (c) => {
  try {
    const seriesId = c.req.param('id');
    console.log(`[Delete] 🗑️ Deleting series ${seriesId} with cascade cleanup...`);

    // 1. 取消关联的视频生成任务（标记为 cancelled，保留审计记录）
    const { data: cancelledTasks, error: cancelErr } = await supabase
      .from('video_tasks')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .contains('generation_metadata', { seriesId })
      .in('status', ['pending', 'processing', 'submitted'])
      .select('task_id');
    if (cancelErr) {
      console.warn(`[Delete] Warning: cancel video_tasks failed: ${cancelErr.message}`);
    } else {
      console.log(`[Delete] ✅ Cancelled ${cancelledTasks?.length || 0} active video tasks`);
    }

    // 2. 删除分镜
    const { error: sbErr } = await supabase.from('series_storyboards').delete().eq('series_id', seriesId);
    if (sbErr) console.warn(`[Delete] Warning: delete storyboards failed: ${sbErr.message}`);

    // 3. 删除���集
    const { error: epErr } = await supabase.from('series_episodes').delete().eq('series_id', seriesId);
    if (epErr) console.warn(`[Delete] Warning: delete episodes failed: ${epErr.message}`);

    // 4. 删除角色
    const { error: charErr } = await supabase.from('series_characters').delete().eq('series_id', seriesId);
    if (charErr) console.warn(`[Delete] Warning: delete characters failed: ${charErr.message}`);

    // 5. v6.0.8: 清理互动数据（likes、comments、viewing_history）——防止孤儿记录
    // likes/comments 使用 work_id = seriesId 关联
    const [{ error: likesErr }, { error: commentsErr }, { error: viewHistErr }] = await Promise.all([
      supabase.from('likes').delete().eq('work_id', seriesId),
      supabase.from('comments').delete().eq('work_id', seriesId),
      supabase.from('viewing_history').delete().eq('series_id', seriesId),
    ]);
    if (likesErr) console.warn(`[Delete] Warning: delete likes failed: ${likesErr.message}`);
    if (commentsErr) console.warn(`[Delete] Warning: delete comments failed: ${commentsErr.message}`);
    if (viewHistErr) console.warn(`[Delete] Warning: delete viewing_history failed: ${viewHistErr.message}`);

    // 6. 最后删除系列本身
    const { error } = await supabase.from('series').delete().eq('id', seriesId);
    if (error) return c.json({ error: error.message }, 500);

    console.log(`[Delete] ✅ Series ${seriesId} fully deleted (tasks cancelled: ${cancelledTasks?.length || 0})`);
    return c.json({ success: true, cancelledTasks: cancelledTasks?.length || 0 });
  } catch (error: any) {
    console.error(`[Delete] ❌ Error deleting series: ${error.message}`);
    return c.json({ error: error.message }, 500);
  }
});

// ------------------------------------------------------------------
//  [D] 社区 & 互动 — 社区作品 / 用户作品 / 点赞 / 评论 / 分享
// ------------------------------------------------------------------

// ==================== 社区作品 ====================

app.get(`${PREFIX}/community/works`, async (c) => {
  try {
    const page = Math.max(parseInt(c.req.query('page') || '1') || 1, 1);
    const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '20') || 20, 1), 100);
    const style = c.req.query('style');
    const phone = c.req.query('phone');
    const since = c.req.query('since');

    let query = supabase
      .from('video_tasks')
      .select('task_id, user_phone, video_url, thumbnail, prompt, style, duration, status, created_at, generation_metadata')
      .eq('status', 'completed')
      .not('video_url', 'is', null)
      .order('created_at', { ascending: false });

    if (since) {
      query = query.gt('created_at', since);
    } else {
      query = query.limit(limit);
    }
    if (style) query = query.eq('style', style);
    if (phone) query = query.eq('user_phone', phone);

    const { data: tasks, error: tasksError } = await query;

    if (tasksError) {
      console.error('[Community] Works query error:', tasksError);
      return c.json({ success: false, error: tasksError.message, works: [], total: 0 }, 500);
    }

    if (!tasks || tasks.length === 0) {
      return c.json({ success: true, works: [], total: 0, page, limit, hasMore: false });
    }

    const phones = [...new Set(tasks.map((t: any) => t.user_phone))];
    const taskIds = tasks.map((t: any) => t.task_id);

    // v6.0.29: per-item head:true count queries — eliminates unbounded row transfer
    // (previously fetched up to 5000 likes rows and counted in JS, risking PostgREST 1000-row truncation)
    const [usersResult, ...likeCountResults] = await Promise.all([
      supabase.from('users').select('phone, nickname, avatar_url').in('phone', phones),
      ...taskIds.map((id: string) =>
        supabase.from('likes').select('*', { count: 'exact', head: true }).eq('work_id', id)
      ),
    ]);

    const usersMap = new Map((usersResult.data || []).map((u: any) => [u.phone, u]));
    const likesMap = new Map<string, number>();
    taskIds.forEach((id: string, i: number) => {
      likesMap.set(id, likeCountResults[i].count || 0);
    });

    const works = tasks
      .filter((task: any) => task.video_url && task.video_url.trim() !== '')
      .filter((task: any) => {
        // v6.0.19: 过滤掉属于漫剧系列的分镜视频（它们通过SeriesCard展示，不应作为独立作品散乱出现）
        if (task.generation_metadata) {
          try {
            const meta = typeof task.generation_metadata === 'string'
              ? JSON.parse(task.generation_metadata) : task.generation_metadata;
            if (meta?.seriesId) return false;
          } catch { /* ignore */ }
        }
        return true;
      })
      .map((task: any) => {
        const user = usersMap.get(task.user_phone);
        let metadata: any = null;
        if (task.generation_metadata) {
          try {
            metadata = typeof task.generation_metadata === 'string'
              ? JSON.parse(task.generation_metadata)
              : task.generation_metadata;
          } catch (e: any) { console.warn('[Community] metadata parse failed:', e.message); }
        }
        return {
          id: task.task_id,
          taskId: task.task_id,
          userPhone: task.user_phone,
          username: user?.nickname || '匿名用户',
          userAvatar: user?.avatar_url || '',
          videoUrl: task.video_url,
          // v6.0.19: thumbnail仅使用实际缩略图，不再用视频URL冒充
          thumbnail: task.thumbnail || '',
          prompt: task.prompt,
          style: task.style,
          duration: task.duration,
          likes: likesMap.get(task.task_id) || 0,
          createdAt: task.created_at,
          episodeNumber: metadata?.episodeNumber,
          storyboardNumber: metadata?.storyboardNumber,
        };
      });

    return c.json({ success: true, works, total: works.length, page, limit, hasMore: since ? false : works.length >= limit });
  } catch (error: any) {
    console.error('[Community] Works error:', truncateErrorMsg(error));
    return c.json({ success: false, error: error.message, works: [], total: 0 }, 500);
  }
});

// ==================== 用户作品 ====================

// 获取指定用户的作品列表
app.get(`${PREFIX}/community/user/:phone/works`, async (c) => {
  try {
    const phone = c.req.param('phone');
    if (!phone) return c.json({ success: false, error: 'Phone number is required' }, 400);

    // v6.0.23: select specific fields instead of *
    const { data: tasks, error: tasksError } = await supabase
      .from('video_tasks')
      .select('task_id, user_phone, video_url, thumbnail, prompt, style, duration, status, created_at, generation_metadata')
      .eq('user_phone', phone)
      .eq('status', 'completed')
      .not('video_url', 'is', null)
      .order('created_at', { ascending: false });

    if (tasksError) {
      console.error('[Community] User works error:', tasksError);
      return c.json({ success: false, error: tasksError.message }, 500);
    }

    if (!tasks || tasks.length === 0) {
      return c.json({ success: true, works: [] });
    }

    // v6.0.29: per-item head:true count queries — eliminates unbounded row transfer
    // (previously fetched all likes rows and counted in JS, risking PostgREST 1000-row truncation)
    const taskIds = tasks.map((t: any) => t.task_id);
    const [userRes, ...likeCountResults] = await Promise.all([
      supabase.from('users').select('phone, nickname, avatar_url').eq('phone', phone).maybeSingle(),
      ...taskIds.map((id: string) =>
        supabase.from('likes').select('*', { count: 'exact', head: true }).eq('work_id', id)
      ),
    ]);
    const user = userRes.data;

    const likesMap = new Map<string, number>();
    taskIds.forEach((id: string, i: number) => {
      likesMap.set(id, likeCountResults[i].count || 0);
    });

    // v6.0.19: 过滤掉属于漫剧系列的分镜视频 + 修复thumbnail
    const works = tasks
      .filter((task: any) => {
        if (task.generation_metadata) {
          try {
            const meta = typeof task.generation_metadata === 'string'
              ? JSON.parse(task.generation_metadata) : task.generation_metadata;
            if (meta?.seriesId) return false;
          } catch { /* ignore */ }
        }
        return true;
      })
      .map((task: any) => ({
        id: task.task_id,
        taskId: task.task_id,
        userPhone: task.user_phone,
        username: user?.nickname || '匿名用户',
        userAvatar: user?.avatar_url || '',
        videoUrl: task.video_url,
        thumbnail: task.thumbnail || '',
        prompt: task.prompt,
        style: task.style,
        duration: task.duration,
        likes: likesMap.get(task.task_id) || 0,
        createdAt: task.created_at,
        metadata: task.generation_metadata,
      }));

    return c.json({ success: true, works });
  } catch (error: any) {
    console.error('[Community] User works error:', truncateErrorMsg(error));
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 删除用户作品
app.delete(`${PREFIX}/community/user/:phone/works/:taskId`, async (c) => {
  try {
    const phone = c.req.param('phone');
    const taskId = c.req.param('taskId');
    if (!phone || !taskId) return c.json({ success: false, error: 'Phone and taskId are required' }, 400);

    await supabase
      .from('video_tasks')
      .delete()
      .eq('task_id', taskId)
      .eq('user_phone', phone);

    return c.json({ success: true });
  } catch (error: any) {
    console.error('[Community] Delete work error:', truncateErrorMsg(error));
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ==================== 互动功能 ====================

app.post(`${PREFIX}/series/:id/like`, async (c) => {
  try {
    const seriesId = c.req.param('id');
    const body = await c.req.json();
    const userPhone = body.userPhone || c.req.header('x-user-phone');
    if (!userPhone) return c.json({ error: '缺少用户信息' }, 400);

    const { data: existing } = await supabase
      .from('likes')
      .select('id')
      .eq('work_id', seriesId)
      .eq('user_phone', userPhone)
      .maybeSingle();

    if (existing) {
      await supabase.from('likes').delete().eq('id', existing.id);
      return c.json({ success: true, liked: false });
    } else {
      const { error: insertErr } = await supabase.from('likes').insert({ work_id: seriesId, user_phone: userPhone });
      if (insertErr) {
        // 唯一约束冲突（并发双击竞态）→ 当作取消点赞处理
        if (insertErr.code === '23505') {
          console.warn(`[POST /series/:id/like] Race condition detected, treating as unlike: ${seriesId}/${userPhone}`);
          await supabase.from('likes').delete().eq('work_id', seriesId).eq('user_phone', userPhone);
          return c.json({ success: true, liked: false });
        }
        return c.json({ error: insertErr.message }, 500);
      }
      return c.json({ success: true, liked: true });
    }
  } catch (error: any) {
    console.error('[POST /series/:id/like] Error:', error?.message);
    return c.json({ error: error.message }, 500);
  }
});

app.post(`${PREFIX}/series/:id/comment`, async (c) => {
  try {
    const seriesId = c.req.param('id');
    const body = await c.req.json();
    if (!body.userPhone || !body.content) return c.json({ error: 'userPhone and content required' }, 400);
    if (body.content.length > 2000) return c.json({ error: '评论内容不能超过2000字' }, 400);

    // v6.0.16+: 评论频率限制
    const rateCheck = rateLimiters.comment.check(body.userPhone);
    if (!rateCheck.allowed) {
      return c.json({ error: `评论过于频繁，请${rateCheck.retryAfter}秒后重试` }, 429);
    }

    const { data, error } = await supabase
      .from('comments')
      .insert({ work_id: seriesId, user_phone: body.userPhone, content: body.content.trim() })
      .select()
      .single();
    if (error) return c.json({ error: error.message }, 500);
    // v6.0.26: 移除comments_count反规范化更新（series表无此列），评论数通过comments��实时count
    return c.json({ success: true, data: toCamelCase(data) });
  } catch (error: any) {
    console.error('[POST /series/:id/comment] Error:', error?.message);
    return c.json({ error: error.message }, 500);
  }
});

app.get(`${PREFIX}/series/:id/comments`, async (c) => {
  try {
    const seriesId = c.req.param('id');
    const { data, error } = await supabase
      .from('comments')
      .select('id, work_id, user_phone, content, created_at')
      .eq('work_id', seriesId)
      .order('created_at', { ascending: false });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ success: true, data: toCamelCase(data || []) });
  } catch (error: any) {
    console.error('[GET /series/:id/comments] Error:', error?.message);
    return c.json({ error: error.message }, 500);
  }
});

// v6.0.26: shares_count列不存在于series表，改为无状态stub（与community/works/:workId/share对齐）
// series表没有shares_count列，无法持久化分享计数。前端以fire-and-forget方式调用，不依赖返回数据。
app.post(`${PREFIX}/series/:id/share`, async (c) => {
  return c.json({ success: true });
});

// ------------------------------------------------------------------
//  [E] 内容管理 — 角色 / AI角色 / 剧集 / 分镜 / 视频任务
// ------------------------------------------------------------------

// ==================== 角色操作 ====================

app.get(`${PREFIX}/series/:id/characters`, async (c) => {
  try {
    const seriesId = c.req.param('id');
    const { data, error } = await supabase
      .from('series_characters')
      .select('id, series_id, name, role, description, appearance, personality, created_at')
      .eq('series_id', seriesId)
      .order('created_at', { ascending: true });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ success: true, data: toCamelCase(data || []) });
  } catch (error: any) {
    console.error('[GET /series/:id/characters] Error:', error?.message);
    return c.json({ error: error.message }, 500);
  }
});

// 创建角色
app.post(`${PREFIX}/series/:id/characters`, async (c) => {
  try {
    const seriesId = c.req.param('id');
    const body = await c.req.json();
    const { name, role, description, appearance, personality } = body;
    if (!name) return c.json({ success: false, error: '角色名不能为空' }, 400);

    const { data, error } = await supabase.from('series_characters').insert({
      series_id: seriesId,
      name,
      role: role || 'supporting',
      description: description || '',
      appearance: appearance || '',
      personality: personality || '',
    }).select().single();

    if (error) {
      console.error('[Characters] Create error:', error.message);
      return c.json({ success: false, error: error.message }, 500);
    }
    return c.json({ success: true, data: toCamelCase(data) });
  } catch (error: any) {
    console.error('[POST /series/:id/characters] Error:', error?.message);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 更新角色
app.put(`${PREFIX}/series/:id/characters/:charId`, async (c) => {
  try {
    const charId = c.req.param('charId');
    const body = await c.req.json();
    const updates: any = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.role !== undefined) updates.role = body.role;
    if (body.description !== undefined) updates.description = body.description;
    if (body.appearance !== undefined) updates.appearance = body.appearance;
    if (body.personality !== undefined) updates.personality = body.personality;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase.from('series_characters')
      .update(updates).eq('id', charId).select().single();
    if (error) return c.json({ success: false, error: error.message }, 500);
    return c.json({ success: true, data: toCamelCase(data) });
  } catch (error: any) {
    console.error('[PUT /series/:id/characters/:charId] Error:', error?.message);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 删除角色
app.delete(`${PREFIX}/series/:id/characters/:charId`, async (c) => {
  try {
    const charId = c.req.param('charId');
    const { error } = await supabase.from('series_characters').delete().eq('id', charId);
    if (error) return c.json({ success: false, error: error.message }, 500);
    return c.json({ success: true });
  } catch (error: any) {
    console.error('[DELETE /series/:id/characters/:charId] Error:', error?.message);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ==================== AI智能生成角色 v5.4.1 ====================

app.post(`${PREFIX}/series/:id/ai-generate-characters`, async (c) => {
  try {
    const seriesId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));

    // v6.0.23: select specific fields — only need basic info for character generation prompt
    const { data: series, error: sErr } = await supabase.from('series').select('id, title, description, genre, theme, style, story_outline').eq('id', seriesId).maybeSingle();
    if (sErr || !series) return c.json({ success: false, error: '漫剧不存在' }, 404);

    let characterRows: any[] = [];

    if (VOLCENGINE_API_KEY || ALIYUN_BAILIAN_API_KEY) {
      const charPrompt = `你是一位专业的漫剧编剧。请根据以下信息，为漫剧创作3-5个主要角色。\n\n漫剧标题：${series.title}\n剧集简介：${series.description || '未提供'}\n${series.genre ? `类型：${series.genre}` : ''}\n${series.theme ? `主题：${series.theme}` : ''}\n${series.story_outline ? `故事大纲：${(series.story_outline || '').substring(0, 500)}` : ''}\n\n请严格按以下JSON格式回复（不要包��markdown标记），返回一个数组：\n[{"name":"角色名","role":"protagonist|supporting|antagonist","description":"角色背景描述(30-50字)","appearance":"外貌特征(30-50字，包含年龄、发型、服装等)","personality":"性格特征(10-20字)"}]\n\n要求：\n1. 必须有1个protagonist（主角），1-2个supporting（配角），可选1个antagonist（反派）\n2. 角色之间要有关联和互动关系\n3. 外貌描述要具体，便于AI绘图\\n4. 【重要】角色的名字、职业、背景必须与漫剧标题「${series.title}」和简介匹配，禁止创作与主题无关的角色`;

      console.log(`[AI] ai-generate-characters: calling AI for series ${seriesId}`);
      // v6.0.84: 独立角色生成prompt同步升级——description 80-120字、personality 30-50字、新增relationships
      const charPromptFixed = `你是一位专业的漫剧编剧。请根据以下信息，为漫剧创作3-5个主要角色。\n\n漫剧标题：${series.title}\n剧集简介：${series.description || '未提供'}\n${series.genre ? `类型：${series.genre}` : ''}\n${series.theme ? `主题：${series.theme}` : ''}\n${series.story_outline ? `故事大纲：${(series.story_outline || '').substring(0, 500)}` : ''}\n\n请严格按以下JSON格式回复（不要包含markdown标记），返回一个数组：\n[{"name":"角色名","role":"protagonist|supporting|antagonist","description":"角色背景故事(80-120字,含职业/家庭背景/人生关键经历/核心动机/内心矛盾/性格成因)","appearance":"外貌特征(50-80字,必须包含年龄、身高体型、发型发色、面部五官特征、标志性服装配饰)","personality":"性格特征与说话风格(30-50���,含性格标签+说话习惯+口头禅+情绪表达方式)","relationships":"与其他角色的关系(20-40字,如与XX是青梅竹马/暗恋XX/与XX有仇怨)"}]\n\n要求：\n1. 必须有1个protagonist（主角），1-2个supporting（配角），可选1个antagonist（反派）\n2. 角色之间要有关联和互动关系\n3. 外貌描述要具体，便于AI绘图\n4. 【重要】角色的名字、职业、背景必须与漫剧标题「${series.title}」和简介匹配，禁止创作与主题无关的角色\n5. 【外貌细节必填】appearance字段必须包含：具体年龄、五官特征(如瓜子脸/丹凤眼)、发型发色(如齐肩黑色长发)、身材体型(如身材修长172cm)、标志性服饰(如常穿白色连衣裙)，每个角色外貌描述至少40字\n6. 【中国审美】人物面容精致优美、五官端正比例协调、气质自然大方，符合中国观众审美偏好\n7. 【视觉区分度】不同角色的发型/发色/服饰风格/体型必须有明显区分，确保AI绘图时能清晰辨别���同角色`;
      try {
        // v6.0.19: callAI 多模型路由（medium tier — 角色设计）
        const aiResult = await callAI({
          messages: [{ role: 'user', content: charPromptFixed }],
          tier: 'medium',
          temperature: 0.8,
          max_tokens: 4000,
          timeout: 60000,
        });
        {
          {
            const content = aiResult.content;
            console.log(`[AI] ai-generate-characters: AI returned ${content.length} chars`);
            try {
              let cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
              // v5.5.0: 尝试修复截断的JSON数组
              if (cleaned.startsWith('[') && !cleaned.endsWith(']')) {
                const lastComplete = cleaned.lastIndexOf('}');
                if (lastComplete > 0) {
                  cleaned = cleaned.substring(0, lastComplete + 1) + ']';
                  console.log('[AI] ai-generate-characters: auto-fixed truncated JSON array');
                }
              }
              const parsed = JSON.parse(cleaned);
              const chars = Array.isArray(parsed) ? parsed : (parsed.characters || []);
              characterRows = chars.map((ch: any) => ({
                series_id: seriesId,
                name: ch.name || '未命名角色',
                role: ['protagonist', 'supporting', 'antagonist', 'mentor', 'extra'].includes(ch.role) ? ch.role : 'supporting',
                description: `${ch.description || ''}${ch.relationships ? '。关系：' + ch.relationships : ''}`, // v6.0.84: 合并relationships
                appearance: ch.appearance || '',
                personality: ch.personality || '',
              }));
              console.log(`[AI] ai-generate-characters: parsed ${characterRows.length} characters`);
            } catch (parseErr: any) {
              console.warn(`[AI] ai-generate-characters: content JSON parse failed: ${parseErr.message}, preview: ${content.substring(0, 200)}`);
            }
          }
        }
      } catch (aiErr: any) {
        console.warn('[AI] ai-generate-characters: AI call failed:', truncateErrorMsg(aiErr));
      }
    }

    if (characterRows.length === 0) {
      characterRows = [
        { series_id: seriesId, name: '主角', role: 'protagonist', description: '故事的主人公', appearance: '20岁左右，精神饱满，目光坚定', personality: '勇敢、坚韧、善良' },
        { series_id: seriesId, name: '挚友', role: 'supporting', description: '主角最信任的伙伴', appearance: '与主角同龄，性格开朗', personality: '忠诚、幽默、热心' },
        { series_id: seriesId, name: '导师', role: 'supporting', description: '引导主角成长的���者', appearance: '中年人，气质沉稳', personality: '睿智、严厉、关怀' },
      ];
    }

    await supabase.from('series_characters').delete().eq('series_id', seriesId);
    const { data: createdChars, error: charInsertErr } = await supabase.from('series_characters').insert(characterRows).select();
    if (charInsertErr) return c.json({ success: false, error: charInsertErr.message }, 500);

    console.log(`[AI] ai-generate-characters: ✅ Created ${createdChars?.length || 0} characters for series ${seriesId}`);
    return c.json({ success: true, data: toCamelCase(createdChars || []), count: createdChars?.length || 0 });
  } catch (error: any) {
    console.error('[AI] ai-generate-characters error:', truncateErrorMsg(error));
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ==================== 剧集操作 ====================

app.get(`${PREFIX}/series/:id/episodes`, async (c) => {
  try {
    const seriesId = c.req.param('id');
    // v6.0.23: select specific fields instead of *
    const { data, error } = await supabase
      .from('series_episodes')
      .select('id, series_id, episode_number, title, synopsis, status, growth_theme, key_moment, total_duration, thumbnail_url, merged_video_url, created_at, updated_at')
      .eq('series_id', seriesId)
      .order('episode_number', { ascending: true });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ success: true, data: toCamelCase(data || []) });
  } catch (error: any) {
    console.error('[GET /series/:id/episodes] Error:', error?.message);
    return c.json({ error: error.message }, 500);
  }
});

// ==================== 分镜操作 ====================

app.get(`${PREFIX}/series/:seriesId/episodes/:episodeId/storyboards`, async (c) => {
  try {
    const seriesId = c.req.param('seriesId');
    const episodeId = c.req.param('episodeId');
    // series_storyboards 用 series_id + episode_number 关联，不是 episode_id
    const { data: episode } = await supabase
      .from('series_episodes').select('episode_number').eq('id', episodeId).maybeSingle();
    if (!episode) return c.json({ error: '剧集不存在' }, 404);
    // v6.0.37: select('*') 避免列名不匹配导致查询失败
    const { data, error } = await supabase
      .from('series_storyboards').select('*')
      .eq('series_id', seriesId).eq('episode_number', episode.episode_number)
      .order('scene_number', { ascending: true });
    if (error) {
      console.error('[GET storyboards] Query failed:', error.message);
      return c.json({ error: error.message }, 500);
    }
    return c.json({ success: true, data: toCamelCase(data || []) });
  } catch (error: any) {
    console.error('[GET /series/:seriesId/episodes/:episodeId/storyboards] Error:', error?.message);
    return c.json({ error: error.message }, 500);
  }
});

// 🔥 v5.3.0: 更新单个分镜（前端生成视频后回写video_url/status）
app.patch(`${PREFIX}/series/:seriesId/storyboards/:sbId`, async (c) => {
  try {
    const sbId = c.req.param('sbId');
    const seriesId = c.req.param('seriesId');
    const body = await c.req.json();
    const updates: any = { updated_at: new Date().toISOString() };
    if (body.videoUrl !== undefined) updates.video_url = body.videoUrl;
    if (body.thumbnailUrl !== undefined) updates.thumbnail_url = body.thumbnailUrl;
    if (body.status !== undefined) updates.status = body.status;
    if (body.imageUrl !== undefined) updates.image_url = body.imageUrl;

    const { data, error } = await supabase.from('series_storyboards')
      .update(updates).eq('id', sbId).eq('series_id', seriesId).select().single();
    if (error) {
      // 如果id匹配失败，尝试用 series_id + episode_number + scene_number
      if (body.episodeNumber && body.sceneNumber) {
        const { data: d2, error: e2 } = await supabase.from('series_storyboards')
          .update(updates)
          .eq('series_id', seriesId)
          .eq('episode_number', body.episodeNumber)
          .eq('scene_number', body.sceneNumber)
          .select().single();
        if (e2) return c.json({ success: false, error: e2.message }, 500);
        return c.json({ success: true, data: toCamelCase(d2) });
      }
      return c.json({ success: false, error: error.message }, 500);
    }
    return c.json({ success: true, data: toCamelCase(data) });
  } catch (error: any) {
    console.error('[PATCH /series/:seriesId/storyboards/:sbId] Error:', error?.message);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ==================== 视频任务 ====================

app.get(`${PREFIX}/video-tasks`, async (c) => {
  try {
    const userPhone = c.req.header('x-user-phone') || c.req.query('userPhone');
    if (!userPhone) return c.json({ error: '缺少用户信息' }, 400);
    // v6.0.23: select specific fields instead of *
    const { data, error } = await supabase
      .from('video_tasks')
      .select('task_id, user_phone, prompt, title, style, duration, status, volcengine_task_id, video_url, thumbnail, generation_metadata, created_at, updated_at')
      .eq('user_phone', userPhone)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ success: true, data: toCamelCase(data || []) });
  } catch (error: any) {
    console.error('[GET /video-tasks] Error:', error?.message);
    return c.json({ error: error.message }, 500);
  }
});

app.get(`${PREFIX}/video-tasks/:taskId`, async (c) => {
  try {
    const taskId = c.req.param('taskId');
    // v6.0.23: 精简字段
    const { data, error } = await supabase
      .from('video_tasks')
      .select('id, task_id, user_phone, prompt, title, style, duration, status, volcengine_task_id, video_url, thumbnail, generation_metadata, series_id, created_at, updated_at')
      .eq('task_id', taskId)
      .maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: 'Task not found' }, 404);
    return c.json({ success: true, data: toCamelCase(data) });
  } catch (error: any) {
    console.error('[GET /video-tasks/:taskId] Error:', error?.message);
    return c.json({ error: error.message }, 500);
  }
});

// ==================== 浏览历史 ====================

app.post(`${PREFIX}/series/:id/viewing-history`, async (c) => {
  try {
    const seriesId = c.req.param('id');
    const body = await c.req.json();
    const userPhone = body.userPhone || c.req.header('x-user-phone');
    if (!userPhone) return c.json({ error: '缺少用户信息' }, 400);
    
    // Upsert viewing history
    const { error } = await supabase
      .from('viewing_history')
      .upsert({
        user_phone: userPhone,
        series_id: seriesId,
        last_episode: body.lastEpisode || 1,
        progress: body.progress || 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_phone,series_id' });
    
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ success: true });
  } catch (error: any) {
    console.error('[POST /series/:id/viewing-history] Error:', error?.message);
    return c.json({ error: error.message }, 500);
  }
});

app.get(`${PREFIX}/series/:id/viewing-history`, async (c) => {
  try {
    const seriesId = c.req.param('id');
    const userPhone = c.req.header('x-user-phone') || c.req.query('userPhone');
    if (!userPhone) return c.json({ success: true, data: null });
    
    // v6.0.23: 精简字段
    const { data, error } = await supabase
      .from('viewing_history')
      .select('user_phone, series_id, last_episode, progress, updated_at')
      .eq('user_phone', userPhone)
      .eq('series_id', seriesId)
      .maybeSingle();
    
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ success: true, data: data ? toCamelCase(data) : null });
  } catch (error: any) {
    console.error('[GET /series/:id/viewing-history] Error:', error?.message);
    return c.json({ error: error.message }, 500);
  }
});

// ==================== 数据库健康检查 ====================

app.get(`${PREFIX}/db-health`, async (c) => {
  try {
    const start = Date.now();
    const { data, error } = await supabase.from('series').select('id').limit(1);
    const latency = Date.now() - start;
    if (error) return c.json({ status: 'error', error: error.message, latency }, 500);
    return c.json({ status: 'ok', latency, version: APP_VERSION });
  } catch (error: any) {
    console.error('[GET /db-health] Error:', error?.message);
    return c.json({ status: 'error', error: error.message }, 500);
  }
});

// db-health: 只使用带前缀的路由

// ------------------------------------------------------------------
//  [G] 视频管道 — 分镜视频生成 / 合并视频 / AI创意生成
// ------------------------------------------------------------------

// ==================== 漫剧分镜视频生成（简化版） ====================

app.post(`${PREFIX}/series/:seriesId/episodes/:episodeNumber/storyboards/:sceneNumber/generate-video`, async (c) => {
  try {
    const body = await c.req.json();
    const seriesId = c.req.param('seriesId');
    const episodeNumber = parseInt(c.req.param('episodeNumber'));
    const sceneNumber = parseInt(c.req.param('sceneNumber'));

    // 创建video_task — 🔥 修复：必须包含 title 字段（NOT NULL 约束）
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const prompt = body.prompt || '';
    const { data: task, error } = await supabase
      .from('video_tasks')
      .insert({
        task_id: taskId,
        user_phone: body.userPhone || c.req.header('x-user-phone') || '',
        prompt,
        title: body.title || prompt.substring(0, 100) || `E${episodeNumber}-场景${sceneNumber}`,
        style: body.style || 'anime',
        status: 'pending',
        generation_metadata: {
          seriesId,
          episodeNumber,
          sceneNumber,
          type: 'storyboard_video',
        },
      })
      .select()
      .single();

    if (error) {
      console.error('[Video] Create task error:', error);
      return c.json({ error: error.message }, 500);
    }

    return c.json({ success: true, data: toCamelCase(task) });
  } catch (error: any) {
    console.error('[Video] Generate error:', truncateErrorMsg(error));
    return c.json({ error: error.message }, 500);
  }
});

// ==================== 漫剧合并视频（虚拟播放列表方式） ====================

// 旧路由保留兼容
app.post(`${PREFIX}/series/:seriesId/episodes/:episodeId/merge`, async (c) => {
  try {
    const seriesId = c.req.param('seriesId');
    const episodeId = c.req.param('episodeId');
    // 查剧集获取 episode_number
    const { data: ep } = await supabase.from('series_episodes').select('episode_number').eq('id', episodeId).maybeSingle();
    if (!ep) return c.json({ success: false, error: '剧集不存在' }, 404);
    const { data: storyboards } = await supabase
      .from('series_storyboards').select('scene_number, video_url, duration, description, image_url').eq('series_id', seriesId).eq('episode_number', ep.episode_number).order('scene_number', { ascending: true });
    const videos = (storyboards || []).filter((sb: any) => {
      const url = (sb.video_url || '').trim();
      return url.length > 0 && url.startsWith('http');
    }).map((sb: any) => ({
      sceneNumber: sb.scene_number, url: sb.video_url.trim(), duration: sb.duration || 10,
      title: sb.description || `场景${sb.scene_number}`, thumbnail: sb.image_url || '',
    }));
    if (videos.length === 0) return c.json({ success: false, error: '没有已生成的分镜视频' }, 400);
    return c.json({ success: true, data: { videoUrls: videos.map((v: any) => v.url), totalVideos: videos.length } });
  } catch (error: any) {
    console.error('[POST /series/:seriesId/episodes/:episodeId/merge] Error:', error?.message);
    return c.json({ error: error.message }, 500);
  }
});

// POST /episodes/:episodeId/merge-videos — 合并该集分镜视频为播放列表
// v6.0.39: POST /episodes/:episodeId/merge-videos — 合并单集分镜为单个MP4（始终真实MP4+OSS）
app.post(`${PREFIX}/episodes/:episodeId/merge-videos`, async (c) => {
  try {
    const episodeId = c.req.param('episodeId');
    let userPhone = '';
    try { const body = await c.req.json(); userPhone = body?.userPhone || ''; } catch { /* no body */ }

    // 查找剧集信息
    const { data: episode, error: epErr } = await supabase
      .from('series_episodes').select('id, series_id, episode_number, title').eq('id', episodeId).maybeSingle();
    if (epErr || !episode) return c.json({ success: false, error: epErr?.message || '剧集不存在' }, 404);

    // v6.0.39: 所有权校验——仅制作者可合并/下载
    if (userPhone) {
      const { data: ownerSeries } = await supabase
        .from('series').select('user_phone').eq('id', episode.series_id).maybeSingle();
      if (ownerSeries && ownerSeries.user_phone !== userPhone) {
        return c.json({ success: false, error: '仅作品制作者可以合并视频' }, 403);
      }
    }

    // v6.0.93: 查找系列的 coherence_check 以获取目标分辨率（修复majority-vote选错分辨率）
    const { data: seriesMeta } = await supabase
      .from('series').select('coherence_check').eq('id', episode.series_id).maybeSingle();
    const seriesAspectRatio: string = seriesMeta?.coherence_check?.aspectRatio || '16:9';
    const preferredResolution: string | undefined = ASPECT_TO_RESOLUTION[seriesAspectRatio];
    if (preferredResolution) {
      console.log(`[MergeVideos] Series aspect ratio=${seriesAspectRatio}, preferredResolution=${preferredResolution}`);
    }

    // 查找该集所有分镜，按 scene_number 排序
    const { data: storyboards, error: sbErr } = await supabase
      .from('series_storyboards').select('scene_number, video_url, duration, description, image_url')
      .eq('series_id', episode.series_id).eq('episode_number', episode.episode_number)
      .order('scene_number', { ascending: true });
    if (sbErr) return c.json({ success: false, error: sbErr.message }, 500);

    const allStoryboards = storyboards || [];
    const videos = allStoryboards
      .filter((sb: any) => {
        const url = (sb.video_url || '').trim();
        return url.length > 0 && url.startsWith('http');
      })
      .map((sb: any) => ({
        sceneNumber: sb.scene_number, url: sb.video_url.trim(), duration: sb.duration || 10,
        title: sb.description || `场景${sb.scene_number}`, thumbnail: sb.image_url || '',
      }));

    console.log(`[MergeVideos] 分镜统计: 总数=${allStoryboards.length}, 有视频=${videos.length}, 场景号=[${videos.map((v: any) => v.sceneNumber).join(',')}]`);

    if (videos.length === 0) {
      return c.json({ success: false, error: '该剧集没有已生成的分镜视频，请先生成分镜视频' }, 400);
    }

    if (videos.length < allStoryboards.length) {
      console.warn(`[MergeVideos] ⚠️ 仅 ${videos.length}/${allStoryboards.length} 个分镜有视频，缺失场景: [${allStoryboards.filter((sb: any) => !(sb.video_url || '').trim().startsWith('http')).map((sb: any) => sb.scene_number).join(',')}]`);
    }

    // v6.0.39: 始终产出真实MP4——消灭playlist/inline-json回退
    if (!isOSSConfigured()) {
      return c.json({ success: false, error: 'OSS存储未配置，无法合并视频' }, 500);
    }

    // v6.0.105→107: OOM 预防——分镜数或预估大小超阈值时提前返回 useClientMerge
    // 阈值统一到 constants.ts（MAX_SERVER_MERGE_SEGMENTS / MAX_SERVER_MERGE_SIZE_MB）
    const estimatedSizeMB = videos.length * ESTIMATED_SEGMENT_SIZE_MB;
    if (videos.length > MAX_SERVER_MERGE_SEGMENTS || estimatedSizeMB > MAX_SERVER_MERGE_SIZE_MB) {
      console.log(`[MergeVideos] 🔀 Early redirect to client merge: ${videos.length} segments, ~${estimatedSizeMB}MB estimated (threshold: >${MAX_SERVER_MERGE_SEGMENTS} segments or >${MAX_SERVER_MERGE_SIZE_MB}MB)`);
      return c.json({
        success: false,
        useClientMerge: true,
        error: `分镜数(${videos.length})较多，为避免服务器超载，将使用本地合并`,
        segmentCount: videos.length,
        estimatedSizeMB,
      }, 200);
    }

    const totalDuration = videos.reduce((sum: number, v: any) => sum + (v.duration || 10), 0);
    let mergeMethod = 'mp4';
    let mergedSegments = 0;

    console.log(`[MergeVideos] 🎬 Downloading ${videos.length} segments for MP4 merge...`);

    // v6.0.65: 顺序下载 + 重试 + validSceneNumbers追踪（修复skippedSegments→场景号映射缺失）
    const validSegments: Uint8Array[] = [];
    const validSceneNumbers: number[] = []; // v6.0.65: 与validSegments平行——追踪每段对应的场景号
    const failedScenes: number[] = [];
    for (let idx = 0; idx < videos.length; idx++) {
      const v = videos[idx] as any;
      let segment: Uint8Array | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const resp = await fetchWithTimeout(v.url, {}, 60000);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const buf = await resp.arrayBuffer();
          segment = new Uint8Array(buf);
          console.log(`[MergeVideos] Downloaded ${idx + 1}/${videos.length} (scene ${v.sceneNumber}): ${(buf.byteLength / 1024).toFixed(0)}KB${attempt > 1 ? ` (retry ${attempt})` : ''}`);
          break;
        } catch (dlErr: any) {
          console.warn(`[MergeVideos] Download attempt ${attempt}/3 for scene ${v.sceneNumber} failed: ${dlErr.message}`);
          if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * attempt));
        }
      }
      if (segment) {
        validSegments.push(segment);
        validSceneNumbers.push(v.sceneNumber); // v6.0.65: 平行追踪
      } else {
        failedScenes.push(v.sceneNumber);
        console.error(`[MergeVideos] ❌ Scene ${v.sceneNumber} download FAILED after 3 attempts — will be MISSING from merged video`);
      }
    }

    if (failedScenes.length > 0) {
      console.warn(`[MergeVideos] ���️ ${failedScenes.length}/${videos.length} scenes failed download: [${failedScenes.join(',')}]`);
    }

    if (validSegments.length === 0) {
      return c.json({ success: false, error: `所有 ${videos.length} 个分镜视频下载失败（场景: ${videos.map((v: any) => v.sceneNumber).join(',')}），请检查网络��重试` }, 500);
    }

    // v6.0.96: 内存检查——记录总大小，为批处理策略提供依据
    const totalSegBytes = validSegments.reduce((s: number, seg: Uint8Array) => s + seg.length, 0);
    console.log(`[MergeVideos] 📦 Total segment bytes: ${(totalSegBytes / 1024 / 1024).toFixed(1)}MB across ${validSegments.length} segments`);

    const outputKey = `merged/${episode.series_id}/ep${episode.episode_number}-merged.mp4`;
    let outputData: Uint8Array;

    if (validSegments.length >= 2) {
      try {
        // v6.0.96: 批量concat策略——分批处理避免Edge Function WORKER_LIMIT (OOM)
        const concatOpts = preferredResolution ? { preferredResolution } : undefined;
        let concatResult: any;

        if (validSegments.length <= 6) {
          // ≤6段: 直接合并（内存峰值约120MB，在Edge Function限制内）
          concatResult = concatMP4(validSegments, concatOpts);
        } else {
          // >6段: 链式分批合并——每批最多处理4个段+前一批结果
          // 峰值内存 ≈ 4×最��分段 + 2×中间结果，避免一次性加载所有段
          console.log(`[MergeVideos] 🔀 Batch concat: ${validSegments.length} segments in batches of 4`);
          const BATCH = 4;
          let batchData: Uint8Array = validSegments[0];
          let batchVideoCount = 1;
          let batchDuration = 0;
          let batchSamples = 0;

          for (let bStart = 1; bStart < validSegments.length; bStart += BATCH - 1) {
            const bEnd = Math.min(bStart + BATCH - 1, validSegments.length);
            const batchSegs: Uint8Array[] = [batchData, ...validSegments.slice(bStart, bEnd)];
            try {
              const bRes = concatMP4(batchSegs, concatOpts);
              batchData = bRes.data;
              batchVideoCount += bRes.videoCount - 1;
              batchDuration += bRes.duration;
              batchSamples += bRes.totalSamples;
              console.log(`[MergeVideos] 🔀 Batch [${bStart}-${bEnd - 1}] done: ${(batchData.length / 1024 / 1024).toFixed(1)}MB`);
            } catch (batchErr: any) {
              if (batchErr.resolutionMismatch) throw batchErr;
              console.warn(`[MergeVideos] Batch concat error at [${bStart}]: ${batchErr.message} — continuing`);
            }
            // 释放已处理的输入段，辅助GC
            for (let ii = bStart; ii < bEnd; ii++) {
              (validSegments as any)[ii] = null;
            }
          }
          concatResult = { data: batchData, videoCount: batchVideoCount, duration: batchDuration, totalSamples: batchSamples };
        }

        outputData = concatResult.data;
        mergedSegments = concatResult.videoCount;
        console.log(`[MergeVideos] ✅ MP4 concat success: ${concatResult.videoCount}/${validSegments.length} segments -> ${(outputData.length / 1024 / 1024).toFixed(2)}MB, ${concatResult.duration.toFixed(1)}s`);
      } catch (concatErr: any) {
        // v6.0.69/v6.0.93: 分辨率不一致时，返回可操作的错误信息（告知用户需重新生成哪些分镜）
        // v6.0.93: mismatchedScenes 现在反映"不符合系列目标分辨率"的场景，而非简单的少数派
        if (concatErr.resolutionMismatch) {
          const mismatchedScenes: number[] = [];
          for (const segIdx of (concatErr.mismatchedSegmentIndices || [])) {
            const sceneNum = validSceneNumbers[segIdx];
            if (sceneNum != null) mismatchedScenes.push(sceneNum);
          }
          const targetRes = concatErr.majorityResolution; // now = preferredResolution when available
          const hintMsg = preferredResolution
            ? `部分分镜视频分辨率与系列设定(${seriesAspectRatio} → ${preferredResolution})不一致，需重新生成场景 [${mismatchedScenes.join(',')}]。`
            : `部分分镜视频的分辨率与其他分镜不一致，导致无法合并。请重新生成分辨率不一致的分镜视频（会自动统一为720p），然后再次合并。`;
          console.log(`[MergeVideos] Resolution mismatch: target=${targetRes}, needsRegen=[${mismatchedScenes.join(',')}]`);
          return c.json({
            success: false,
            error: concatErr.message,
            resolutionMismatch: true,
            majorityResolution: targetRes,
            mismatchedScenes,
            totalStoryboards: allStoryboards.length,
            downloadedCount: validSegments.length,
            failedScenes,
            hint: hintMsg,
          }, 422);
        }
        // 策略B: 其他拼接失败，上传最大的单段MP4（保证merged_video_url始终为真实MP4）
        console.warn(`[MergeVideos] ⚠️ MP4 concat failed: ${concatErr.message} — falling back to largest single segment`);
        outputData = validSegments.reduce((a, b) => a.length >= b.length ? a : b);
        mergedSegments = 1;
        mergeMethod = 'mp4-single-fallback';
      }
    } else {
      // 只有1个有效段，直接使用
      outputData = validSegments[0];
      mergedSegments = 1;
    }

    // 上传到OSS
    const ossUrl = await uploadToOSS(outputKey, outputData.buffer, 'video/mp4');
    const mergedFileSize = outputData.length;
    console.log(`[MergeVideos] ✅ Uploaded to OSS: ${ossUrl.substring(0, 80)}..., ${(mergedFileSize / 1024 / 1024).toFixed(2)}MB`);

    // 更新剧集的 merged_video_url（始终是.mp4 OSS链接）
    await supabase.from('series_episodes')
      .update({ merged_video_url: ossUrl, updated_at: new Date().toISOString() }).eq('id', episodeId);

    return c.json({
      success: true,
      data: {
        mergedVideoUrl: ossUrl, totalVideos: videos.length, totalDuration,
        mergeMethod, mergedSegments, fileSize: mergedFileSize,
        videoUrls: videos.map((v: any) => v.url),
        // v6.0.63: 返回失败/跳过信息，前端可精确提示缺失分镜
        failedScenes,
        totalStoryboards: allStoryboards.length,
        downloadedCount: validSegments.length,
      },
    });
  } catch (error: any) {
    console.error('[MergeVideos] Error:', error.message);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// v6.0.39: export-mp4已废弃——merge-videos始终产出真实MP4，下载时前端直接fetch MP4 URL
// (保留路由桩以兼容可能的旧前端调用)
app.post(`${PREFIX}/episodes/:episodeId/export-mp4`, async (c) => {
  try {
    // 直接转发到merge-videos的结果：查询已有merged_video_url返回
    const episodeId = c.req.param('episodeId');
    const { data: episode } = await supabase
      .from('series_episodes').select('merged_video_url').eq('id', episodeId).maybeSingle();
    const url = (episode?.merged_video_url || '').trim();
    if (url && url.startsWith('http') && url.includes('.mp4')) {
      return c.json({ success: true, data: { downloadUrl: url, method: 'existing-mp4' } });
    }
    return c.json({ success: false, error: '请先合并视频（点击"合并分镜视频"按钮）' }, 400);
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});


// v6.0.126: POST /episodes/:episodeId/request-upload-token — 生成OSS预签名PUT URL（浏览器直传合并视频）
// 前端拿到 uploadUrl 后直接 PUT blob 到 OSS，无需经由 Edge Function 中转（绕过 10MB 请求体限制）
app.post(`${PREFIX}/episodes/:episodeId/request-upload-token`, async (c) => {
  try {
    const episodeId = c.req.param('episodeId');
    const { userPhone, episodeNumber } = await c.req.json().catch(() => ({})) as any;

    if (!isOSSConfigured()) {
      return c.json({ success: false, error: 'OSS存储未配置，无法生成上传令牌' }, 500);
    }

    // 查找剧集（获取 series_id + episode_number）
    const { data: episode, error: epErr } = await supabase
      .from('series_episodes')
      .select('id, series_id, episode_number')
      .eq('id', episodeId).maybeSingle();
    if (epErr || !episode) return c.json({ success: false, error: epErr?.message || '剧集不存在' }, 404);

    const epNum = episode.episode_number || episodeNumber || 0;
    const objectKey = `merged/${episode.series_id}/ep${epNum}-client-merged.mp4`;
    const contentType = 'video/mp4';
    const expiresIn = 7200; // 2小时，足够大文件上传

    const uploadUrl = await generatePresignedPutUrl(objectKey, contentType, expiresIn);
    const finalOssUrl = `https://${Deno.env.get('ALIYUN_OSS_BUCKET_NAME')}.${(Deno.env.get('ALIYUN_OSS_REGION') || 'oss-cn-beijing').startsWith('oss-') ? Deno.env.get('ALIYUN_OSS_REGION') : `oss-${Deno.env.get('ALIYUN_OSS_REGION')}`}.aliyuncs.com/${objectKey}`;

    console.log(`[UploadToken] ep${epNum} (${episodeId}): presigned PUT URL generated, objectKey=${objectKey}`);
    return c.json({ success: true, data: { uploadUrl, objectKey, finalOssUrl, contentType, expiresIn } });
  } catch (error: any) {
    console.error('[UploadToken] Error:', error.message);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// v6.0.126: POST /episodes/:episodeId/save-merged-video — 记录客户端直传后的OSS URL到DB
// 前端完成直传后调用此接口持久化 merged_video_url，确保下次可直接下载
app.post(`${PREFIX}/episodes/:episodeId/save-merged-video`, async (c) => {
  try {
    const episodeId = c.req.param('episodeId');
    const { ossUrl, sizeMB, userPhone } = await c.req.json().catch(() => ({})) as any;

    if (!ossUrl || typeof ossUrl !== 'string' || !ossUrl.startsWith('http')) {
      return c.json({ success: false, error: '无效的OSS URL' }, 400);
    }

    // 安全校验：确保 URL 属于配置的 OSS bucket
    const bucket = Deno.env.get('ALIYUN_OSS_BUCKET_NAME') || '';
    if (bucket && !ossUrl.includes(bucket)) {
      return c.json({ success: false, error: 'URL所指向的存储桶与配置不匹配' }, 400);
    }

    // 查找剧集以验证存在
    const { data: episode, error: epErr } = await supabase
      .from('series_episodes')
      .select('id, series_id, episode_number')
      .eq('id', episodeId).maybeSingle();
    if (epErr || !episode) return c.json({ success: false, error: epErr?.message || '剧集不存在' }, 404);

    // 写入 merged_video_url
    const { error: updateErr } = await supabase
      .from('series_episodes')
      .update({ merged_video_url: ossUrl, updated_at: new Date().toISOString() })
      .eq('id', episodeId);

    if (updateErr) {
      console.error(`[SaveMergedVideo] DB update error for ep${episode.episode_number}:`, updateErr.message);
      return c.json({ success: false, error: `DB写入失败: ${updateErr.message}` }, 500);
    }

    console.log(`[SaveMergedVideo] ✅ ep${episode.episode_number} (${episodeId}): merged_video_url saved (${sizeMB || '?'}MB) → ${ossUrl.substring(0, 80)}...`);
    return c.json({ success: true, data: { mergedVideoUrl: ossUrl, episodeId, sizeMB } });
  } catch (error: any) {
    console.error('[SaveMergedVideo] Error:', error.message);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// GET /episodes/:episodeId/merge-status — 查询剧集合并状态
app.get(`${PREFIX}/episodes/:episodeId/merge-status`, async (c) => {
  try {
    const episodeId = c.req.param('episodeId');
    const { data: episode, error } = await supabase
      .from('series_episodes').select('id, series_id, episode_number, title, merged_video_url, updated_at').eq('id', episodeId).maybeSingle();
    if (error || !episode) return c.json({ success: false, error: error?.message || '剧集不存在' }, 404);

    const { data: storyboards } = await supabase
      .from('series_storyboards').select('id, scene_number, video_url, status')
      .eq('series_id', episode.series_id).eq('episode_number', episode.episode_number)
      .order('scene_number', { ascending: true });
    const total = storyboards?.length || 0;
    const completed = storyboards?.filter((sb: any) => sb.video_url).length || 0;

    return c.json({
      success: true,
      data: {
        episodeId: episode.id, episodeNumber: episode.episode_number, title: episode.title,
        mergedVideoUrl: episode.merged_video_url || null, hasMergedVideo: !!episode.merged_video_url,
        storyboardStats: { total, completed, pending: total - completed },
      },
    });
  } catch (error: any) {
    console.error('[GET /episodes/:episodeId/merge-status] Error:', error?.message);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// POST /episodes/:episodeId/repair-video — 修复/重新生成合并视频
app.post(`${PREFIX}/episodes/:episodeId/repair-video`, async (c) => {
  try {
    const episodeId = c.req.param('episodeId');
    // v6.0.23: 精简字段
    const { data: episode, error: epErr } = await supabase
      .from('series_episodes').select('id, series_id, episode_number').eq('id', episodeId).maybeSingle();
    if (epErr || !episode) return c.json({ success: false, error: epErr?.message || '剧集不存在' }, 404);

    const { data: storyboards } = await supabase
      .from('series_storyboards').select('scene_number, video_url, duration, description, image_url')
      .eq('series_id', episode.series_id).eq('episode_number', episode.episode_number)
      .order('scene_number', { ascending: true });
    const videos = (storyboards || [])
      .filter((sb: any) => {
        const url = (sb.video_url || '').trim();
        return url.length > 0 && url.startsWith('http');
      })
      .map((sb: any) => ({
        sceneNumber: sb.scene_number, url: sb.video_url.trim(), duration: sb.duration || 10,
        title: sb.description || `场景${sb.scene_number}`, thumbnail: sb.image_url || '',
      }));
    if (videos.length === 0) return c.json({ success: false, error: '没有可用的分镜视频' }, 400);

    // v6.0.20: repair也尝试真实MP4拼接
    let mergedVideoUrl = '';
    if (isOSSConfigured()) {
      try {
        console.log(`[RepairVideo] 🎬 Attempting real MP4 concat for ${videos.length} segments...`);
        const dlResults = await Promise.all(videos.map(async (v: any) => {
          try {
            const resp = await fetchWithTimeout(v.url, {}, 60000);
            if (!resp.ok) return null;
            return new Uint8Array(await resp.arrayBuffer());
          } catch { return null; }
        }));
        const valid = dlResults.filter((s): s is Uint8Array => s !== null);
        if (valid.length >= 2) {
          const result = concatMP4(valid);
          const outputKey = `merged/${episode.series_id}/ep${episode.episode_number}-repaired.mp4`;
          mergedVideoUrl = await uploadToOSS(outputKey, result.data.buffer, 'video/mp4');
          console.log(`[RepairVideo] ✅ Real MP4 repair: ${result.videoCount}/${valid.length} segments → ${(result.data.length / 1024 / 1024).toFixed(2)}MB`);
        } else if (valid.length === 1) {
          const outputKey = `merged/${episode.series_id}/ep${episode.episode_number}-repaired.mp4`;
          mergedVideoUrl = await uploadToOSS(outputKey, valid[0].buffer, 'video/mp4');
        }
      } catch (concatErr: any) {
        // v6.0.69: 分辨率不一致 or 其他拼接失败 → 上传最大���段MP4兜底
        if (concatErr.resolutionMismatch) {
          console.warn(`[RepairVideo] ⚠️ Resolution mismatch — falling back to largest single segment`);
        } else {
          console.warn(`[RepairVideo] MP4 concat failed: ${concatErr.message} — using largest segment`);
        }
        const dlResults2 = await Promise.all(videos.map(async (v: any) => {
          try { const r = await fetchWithTimeout(v.url, {}, 60000); if (!r.ok) return null; return new Uint8Array(await r.arrayBuffer()); } catch { return null; }
        }));
        const valid2 = dlResults2.filter((s): s is Uint8Array => s !== null);
        if (valid2.length > 0) {
          const largest = valid2.reduce((a, b) => a.length >= b.length ? a : b);
          const outputKey = `merged/${episode.series_id}/ep${episode.episode_number}-repaired.mp4`;
          mergedVideoUrl = await uploadToOSS(outputKey, largest.buffer, 'video/mp4');
          console.log(`[RepairVideo] ⚠️ single-segment fallback: ${(largest.length / 1024 / 1024).toFixed(2)}MB`);
        }
      }
    }

    // v6.0.39: 如果仍无URL，返回错误（不再内联JSON）
    if (!mergedVideoUrl) {
      return c.json({ success: false, error: 'OSS未配置或所有视频下载失败，无法修复' }, 500);
    }

    await supabase.from('series_episodes')
      .update({ merged_video_url: mergedVideoUrl, updated_at: new Date().toISOString() }).eq('id', episodeId);

    return c.json({ success: true, data: { mergedVideoUrl, repairedVideos: videos.length } });
  } catch (error: any) {
    console.error('[RepairVideo] Error:', error.message);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// POST /series/:seriesId/merge-all-videos — 批量合并系列所有剧集的视频
app.post(`${PREFIX}/series/:seriesId/merge-all-videos`, async (c) => {
  try {
    const seriesId = c.req.param('seriesId');
    let userPhone = '';
    try { const body = await c.req.json(); userPhone = body?.userPhone || ''; } catch { /* optional body */ }

    const { data: episodes, error: epErr } = await supabase
      .from('series_episodes').select('id, episode_number, title, series_id')
      .eq('series_id', seriesId).order('episode_number', { ascending: true });
    if (epErr || !episodes?.length) return c.json({ success: false, error: epErr?.message || '该系列没有剧集' }, 404);

    // v6.0.23: 批量预取所有分镜，消除N+1查询（原: 每集单独查一次 → 现: 单次批量查询+内存分组）
    const { data: allSb } = await supabase
      .from('series_storyboards').select('episode_number, scene_number, video_url, duration, description, image_url')
      .eq('series_id', seriesId).order('episode_number', { ascending: true }).order('scene_number', { ascending: true });
    const sbByEp = new Map<number, any[]>();
    for (const sb of (allSb || [])) {
      if (!sbByEp.has(sb.episode_number)) sbByEp.set(sb.episode_number, []);
      sbByEp.get(sb.episode_number)!.push(sb);
    }

    let mergedCount = 0, failedCount = 0;
    const errors: string[] = [];
    const skippedEpisodes: number[] = []; // v6.0.106: 跳过服务端合并的集数列表

    for (const ep of episodes) {
      try {
        const storyboards = sbByEp.get(ep.episode_number) || [];
        const videos = storyboards
          .filter((sb: any) => {
            const url = (sb.video_url || '').trim();
            return url.length > 0 && url.startsWith('http');
          })
          .map((sb: any) => ({
            sceneNumber: sb.scene_number, url: sb.video_url.trim(), duration: sb.duration || 10,
            title: sb.description || `场景${sb.scene_number}`, thumbnail: sb.image_url || '',
          }));
        if (videos.length === 0) continue;

        // v6.0.106→107: OOM 预防——与 merge-videos 共享阈值常量
        // 批量路由中单集跳过不影响��他集，仅记录到 skipped 列表供前端按需本地合并
        const epEstSizeMB = videos.length * ESTIMATED_SEGMENT_SIZE_MB;
        if (videos.length > MAX_SERVER_MERGE_SEGMENTS || epEstSizeMB > MAX_SERVER_MERGE_SIZE_MB) {
          console.log(`[MergeAll] 🔀 ep${ep.episode_number}: skipping server merge (${videos.length} segments, ~${epEstSizeMB}MB) — recommend client merge`);
          errors.push(`第${ep.episode_number}集: 分镜数(${videos.length})较多，建议本地合并`);
          skippedEpisodes.push(ep.episode_number);
          continue;
        }

        // v6.0.63: 顺序下载 + 重试（与 merge-videos 统一策略，解决并行下载丢分镜）
        let mergedVideoUrl = '';
        if (isOSSConfigured()) {
          try {
            console.log(`[MergeAll] 🎬 ep${ep.episode_number}: downloading ${videos.length} segments sequentially...`);
            const valid: Uint8Array[] = [];
            const validSceneNums: number[] = []; // v6.0.65: 平行追踪场景号
            const epFailedScenes: number[] = [];
            for (let si = 0; si < videos.length; si++) {
              const v = videos[si] as any;
              let seg: Uint8Array | null = null;
              for (let att = 1; att <= 3; att++) {
                try {
                  const resp = await fetchWithTimeout(v.url, {}, 60000);
                  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                  seg = new Uint8Array(await resp.arrayBuffer());
                  console.log(`[MergeAll] ep${ep.episode_number} seg ${si + 1}/${videos.length} (scene ${v.sceneNumber}): ${(seg.length / 1024).toFixed(0)}KB${att > 1 ? ` (retry ${att})` : ''}`);
                  break;
                } catch (dlE: any) {
                  console.warn(`[MergeAll] ep${ep.episode_number} scene ${v.sceneNumber} attempt ${att}/3 failed: ${dlE.message}`);
                  if (att < 3) await new Promise(r => setTimeout(r, 2000 * att));
                }
              }
              if (seg) { valid.push(seg); validSceneNums.push(v.sceneNumber); } else { epFailedScenes.push(v.sceneNumber); }
            }
            if (epFailedScenes.length > 0) {
              console.warn(`[MergeAll] ⚠️ ep${ep.episode_number}: ${epFailedScenes.length}/${videos.length} scenes failed download: [${epFailedScenes.join(',')}]`);
            }
            if (valid.length >= 2) {
              // v6.0.96: 批量concat避免OOM（同merge-videos策略）
              const seriesMeta2 = await supabase.from('series').select('coherence_check').eq('id', seriesId).maybeSingle();
              const epAR = seriesMeta2.data?.coherence_check?.aspectRatio || '16:9';
              const epPrefRes = ASPECT_TO_RESOLUTION[epAR];
              const epConcatOpts = epPrefRes ? { preferredResolution: epPrefRes } : undefined;
              let epConcat: any;
              if (valid.length <= 6) {
                epConcat = concatMP4(valid, epConcatOpts);
              } else {
                const BATCH = 4;
                let bData: Uint8Array = valid[0];
                let bCount = 1;
                let bDur = 0;
                for (let bs = 1; bs < valid.length; bs += BATCH - 1) {
                  const bSegs = [bData, ...valid.slice(bs, bs + BATCH - 1)];
                  try { const r = concatMP4(bSegs, epConcatOpts); bData = r.data; bCount += r.videoCount - 1; bDur += r.duration; }
                  catch (be: any) { if (be.resolutionMismatch) throw be; }
                  for (let ii = bs; ii < Math.min(bs + BATCH - 1, valid.length); ii++) { (valid as any)[ii] = null; }
                }
                epConcat = { data: bData, videoCount: bCount, duration: bDur };
              }
              const result = epConcat;
              const outputKey = `merged/${seriesId}/ep${ep.episode_number}-merged.mp4`;
              mergedVideoUrl = await uploadToOSS(outputKey, result.data.buffer, 'video/mp4');
              console.log(`[MergeAll] ✅ ep${ep.episode_number}: MP4 concat ${result.videoCount}/${valid.length} segments → ${(result.data.length / 1024 / 1024).toFixed(2)}MB`);
            } else if (valid.length === 1) {
              const outputKey = `merged/${seriesId}/ep${ep.episode_number}-merged.mp4`;
              mergedVideoUrl = await uploadToOSS(outputKey, valid[0].buffer, 'video/mp4');
              console.log(`[MergeAll] ⚠️ ep${ep.episode_number}: only 1 valid segment → single-file upload`);
            }
          } catch (concatErr: any) {
            // v6.0.69: 分辨率不一致时，记录失败并添加有用的错误信息
            if (concatErr.resolutionMismatch) {
              const mismatchedNums = (concatErr.mismatchedSegmentIndices || []).map((si: number) => validSceneNums[si]).filter((n: number) => n != null);
              errors.push(`第${ep.episode_number}集: 视频分辨率不一致 — 场景[${mismatchedNums.join(',')}]需要重新生成`);
              failedCount++;
              console.error(`[MergeAll] ❌ ep${ep.episode_number}: Resolution mismatch — scenes [${mismatchedNums.join(',')}] differ from majority`);
            } else {
              console.error(`[MergeAll] ep${ep.episode_number}: MP4 concat failed: ${concatErr.message}`);
            }
          }
        }

        // v6.0.39: 如果仍无URL（OSS未配置或全部下载失败），跳过该集
        if (!mergedVideoUrl) {
          console.warn(`[MergeAll] ep${ep.episode_number}: no merged URL produced, skipping`);
          continue;
        }

        await supabase.from('series_episodes')
          .update({ merged_video_url: mergedVideoUrl, updated_at: new Date().toISOString() }).eq('id', ep.id);
        mergedCount++;
      } catch (err: any) {
        failedCount++;
        errors.push(`第${ep.episode_number}集: ${err.message}`);
      }
    }

    return c.json({ success: true, data: {
      mergedCount, failedCount, totalEpisodes: episodes.length, errors,
      skippedEpisodes, // v6.0.106: 被跳过的集数（分镜过多，建议本地合并）
      useClientMerge: skippedEpisodes.length > 0, // 前端据此对 skipped 集走本地合并
    } });
  } catch (error: any) {
    console.error('[MergeAll] Error:', error.message);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ==================== AI从创意创建（简化版） ====================

app.post(`${PREFIX}/series/create-from-idea`, async (c) => {
  try {
    const body = await c.req.json();
    const { userInput, userPhone, targetAudience, scriptGenre } = body;
    const totalEpisodes = Math.min(Math.max(parseInt(body.totalEpisodes) || 10, 1), 50);
    if (!userInput || !userPhone) return c.json({ success: false, error: '缺少必要参数' }, 400);
    if (userInput.length > 5000) return c.json({ success: false, error: '创意��述不能超过5000字' }, 400);

    // v6.0.16+: 频率限制（创建系列是重量级操作）
    const rateCheck = rateLimiters.createSeries.check(userPhone);
    if (!rateCheck.allowed) {
      return c.json({ success: false, error: `创建过于频繁，请${rateCheck.retryAfter}秒后重试` }, 429);
    }

    // 确保用户存在
    const { data: eu } = await supabase.from('users').select('phone').eq('phone', userPhone).maybeSingle();
    if (!eu) await supabase.from('users').insert({ phone: userPhone, nickname: `用户${userPhone.slice(-4)}` }).select().maybeSingle();

    // 创建系列基础记录
    const { data: newSeries, error: createErr } = await supabase.from('series').insert({
      title: userInput.substring(0, 50) || '新漫剧',
      description: userInput,
      genre: scriptGenre || 'drama',
      style: 'comic',
      total_episodes: totalEpisodes,
      status: 'generating',
      user_phone: userPhone,
      story_outline: userInput,
    }).select().single();

    if (createErr || !newSeries) {
      console.error('[AI] create-from-idea: insert failed:', createErr?.message);
      return c.json({ success: false, error: createErr?.message || '创建失败' }, 500);
    }

    console.log(`[AI] create-from-idea: created series ${newSeries.id} for user ${userPhone}`);
    return c.json({ success: true, seriesId: newSeries.id, data: toCamelCase(newSeries) });
  } catch (error: any) {
    console.error('[AI] create-from-idea error:', truncateErrorMsg(error));
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ------------------------------------------------------------------
//  [H] 火山引擎 — 视频提交 / 状态查询 / Debug / 批量操作
// ------------------------------------------------------------------

// ==================== 火山引擎 - 视频生成 ====================

app.post(`${PREFIX}/volcengine/generate`, async (c) => {
  try {
    if (!VOLCENGINE_API_KEY) {
      console.error('[Volcengine] VOLCENGINE_API_KEY is not configured');
      return c.json({ error: 'VOLCENGINE_API_KEY未配置', message: '请在Supabase Dashboard中设置环境变量' }, 500);
    }
    const body = await c.req.json();
    const {
      userPhone, images, imageUrls, prompt, description, style = 'comic',
      duration = 10, model, resolution = '1080p', fps = 30, enableAudio = false,
      seriesId, episodeId, storyboardId, episodeNumber, storyboardNumber, title,
      codec: rawCodec, // v6.0.75: 可选编码格式 ('h264' | 'h265')
      aspectRatio: rawAspectRatio, // v6.0.79: 画面比例（9:16/16:9/1:1/4:3/3:4）
      forceRegenerate, // v6.0.87: 强制重新生成（跳过去重检查，用于分辨率不一致修复）
    } = body;
    // v6.0.77: 默认H265编码（更高画质+更小体积），异常时自动降级到H264
    const codec = (rawCodec === 'h264') ? 'h264' : 'h265';
    const finalImages = images || imageUrls || [];
    let finalPrompt = description || prompt || '';
    if (!finalPrompt || !finalPrompt.trim()) return c.json({ error: '请输入视频描述' }, 400);
    if (finalPrompt.length > 5000) return c.json({ error: '视频描述不能超过5000字' }, 400);

    // v6.0.16+: 频率限制（视频生成是高成本操作）
    if (userPhone) {
      const rateCheck = rateLimiters.generate.check(userPhone);
      if (!rateCheck.allowed) {
        return c.json({ error: `生成请求过于频繁，请${rateCheck.retryAfter}秒后重试` }, 429);
      }
    }

    // v6.0.96: 每日视频生成配额检查（非管理员账号每天5个免费，超出需付费5元/个）
    let quotaCheckInfo: { usedToday: number; freeLimit: number; paidCredits: number; freeRemaining: number } | null = null;
    if (userPhone && userPhone !== ADMIN_PHONE) {
      const quota = await getUserQuota(userPhone);
      if (quota.totalRemaining <= 0) {
        console.log(`[Quota] ${userPhone} exceeded daily quota: used=${quota.usedToday}/${quota.freeLimit} free, paid=${quota.paidCredits}`);
        return c.json({
          error: `今日免费视频生成配额已用完（已用${quota.usedToday}/${quota.freeLimit}个），每个视频仅需5元`,
          quotaExceeded: true,
          usedToday: quota.usedToday,
          freeLimit: quota.freeLimit,
          paidCredits: quota.paidCredits,
        }, 429);
      }
      quotaCheckInfo = { usedToday: quota.usedToday, freeLimit: quota.freeLimit, paidCredits: quota.paidCredits, freeRemaining: quota.freeRemaining };
    }

    // v5.6.0 + v6.0.8: 当 seriesId 存在时，自动从数据库查找漫剧/剧集/角色上下文 + 视觉风格指南，丰富视频 prompt
    // 解决"视频内容与漫剧主题无关"和"画面风格不一致"问题
    let ctxSeries: any = null; // v6.0.16: 提升作用域供风格锁定
    if (seriesId) {
      try {
        // v6.0.11: 并行获取 series + episode + characters 上下文（原3个顺序查询 → Promise.all）
        const contextQueries: Promise<any>[] = [
          supabase.from('series').select('title, description, genre, theme, style, coherence_check').eq('id', seriesId).maybeSingle(),
          supabase.from('series_characters').select('name, role, appearance, personality').eq('series_id', seriesId).limit(5),
        ];
        if (episodeNumber) {
          contextQueries.push(supabase.from('series_episodes').select('title, synopsis, growth_theme').eq('series_id', seriesId).eq('episode_number', episodeNumber).maybeSingle());
        }
        const ctxResults = await Promise.all(contextQueries);
        ctxSeries = ctxResults[0].data;
        const ctxChars = ctxResults[1].data;
        const ctxEpisode = episodeNumber ? ctxResults[2]?.data : null;

        const contextParts: string[] = [];
        if (ctxSeries?.title) contextParts.push(`漫剧《${ctxSeries.title}》`);
        if (ctxSeries?.description) contextParts.push(`故事背景：${ctxSeries.description.substring(0, 80)}`);
        if (ctxSeries?.theme) contextParts.push(`主题：${ctxSeries.theme}`);
        if (ctxEpisode?.title) contextParts.push(`第${episodeNumber}集「${ctxEpisode.title}」`);
        if (ctxEpisode?.synopsis) contextParts.push(`本集剧情：${ctxEpisode.synopsis.substring(0, 60)}`);

        // v6.0.8: 注入角色详细外貌（从 coherence_check 或 characters 表）
        const coherenceCheck = ctxSeries?.coherence_check;
        if (coherenceCheck?.characterAppearances && coherenceCheck.characterAppearances.length > 0) {
          // 优先使用视觉风格指南中锁定的角色外貌卡
          // v6.0.16: 强化角色身份锁定——格式改为"名字：外貌"以提高AI遵守率
          const charDesc = coherenceCheck.characterAppearances.map((ch: any) =>
            `[${ch.name}]外貌锁定：${ch.appearance || ch.role}`
          ).join('。');
          contextParts.push(`【角色外貌强制锁定——以下每个角色的五官/发型/服装/配饰必须100%严格���守，帧间不可有任何变化】${charDesc}。【违规红线】角色脸型/发色/服装颜色变化视为严重错误；面部痣/疤痕/胎记的位置和大小不允许任何偏移——左脸的痣绝不能出现在右脸`);
        } else if (ctxChars && ctxChars.length > 0) {
          // 回退：使用 characters 表的 appearance 字段（v6.0.69增强格式）
          const charDesc = ctxChars.map((ch: any) => `[${ch.name}]：${ch.appearance || ch.personality || ch.role}`).join('；');
          contextParts.push(`【角色外貌锁定】${charDesc}。所有角色五官/发型/服装/面部微特征(痣/疤痕/酒窝位置)必须严格遵守以上描述，帧间不可变化——面部痣的位置严禁左右互换或消失`);
        }

        // v6.0.8: 注入视觉风格指南中的色彩方案和构图规范（截取关键部分控制token）
        // v6.0.103: 全量注入视觉风格指南——解决不同分镜画面风格不统一问题
        // 根因: 此前仅提取~60字片段，不同分镜收到的风格信息碎片化导致画风漂移
        // 修复: 提取完整的色彩/构图/环境段落 + 角色外貌卡全文 + 风格DNA锚点
        if (coherenceCheck?.visualStyleGuide) {
          const guideText = coherenceCheck.visualStyleGuide;
          // 提取完整段落（增加到200字，覆盖关键视觉参数）
          const colorMatch = guideText.match(/【色彩方案】([^【]*)/);
          const compositionMatch = guideText.match(/【构图与光影规范】([^【]*)/);
          const envMatch = guideText.match(/【环境风格基准】([^【]*)/);
          const charCardMatch = guideText.match(/【角色外貌卡】([^【]*)/);
          const styleParts: string[] = [];
          if (charCardMatch) styleParts.push(`【角色外貌卡】${charCardMatch[1].trim().substring(0, 400)}`);
          if (colorMatch) styleParts.push(`【色彩】${colorMatch[1].trim().substring(0, 200)}`);
          if (compositionMatch) styleParts.push(`【构图光影】${compositionMatch[1].trim().substring(0, 200)}`);
          if (envMatch) styleParts.push(`【环境】${envMatch[1].trim().substring(0, 200)}`);
          if (styleParts.length > 0) {
            contextParts.push(`【全系列视觉风格指南——所有分镜必须100%遵守以下规范，严禁任何画风偏移】${styleParts.join('。')}`);
          }
        } else if (coherenceCheck?.baseStylePrompt) {
          contextParts.push(`画面风格：${coherenceCheck.baseStylePrompt.substring(0, 120)}`);
        }

        // v6.0.103: 风格一致性DNA锚点——从baseStylePrompt生成固定的风格指纹，确保每个分镜收到相同的风格基因
        const seriesStyleKey = ctxSeries?.style || style;
        const styleDesc = STYLE_PROMPTS[seriesStyleKey];
        if (styleDesc) {
          contextParts.push(`【风格DNA——本系列全部视频的视觉基因，每帧画面必须体现】${styleDesc}`);
        }

        // v6.0.116: 首帧风格锚定提示——引用系列首个已生成场景的画面作为全局视觉基准
        // 即使当前场景使用前序场景作为i2v参考（保证时序连贯），prompt中仍提示原始风格画面
        // 防止"电话游戏效应"——每场景只参考上一场景导致风格逐渐漂移
        const styleAnchorUrl = coherenceCheck?.styleAnchorImageUrl;
        const styleAnchorScene = coherenceCheck?.styleAnchorScene || '';
        if (styleAnchorUrl && typeof styleAnchorUrl === 'string' && styleAnchorUrl.startsWith('http')) {
          contextParts.push(`【全系列视觉基准帧(${styleAnchorScene})——当前场景的色调/光影/质感/渲染手法必须与此基准帧完全一致，任何偏移视为画风错误】参考基准画面已作为首帧提供`);
          console.log(`[Volcengine] 🎨 Style anchor hint injected in prompt: ${styleAnchorScene}`);
        }

        // v6.0.20: 强化分镜间视觉连贯性——注入前后场景完整上下文+图像参考
        if (seriesId && episodeNumber && storyboardNumber) {
          try {
            const sceneNum = parseInt(storyboardNumber);
            if (sceneNum > 0) {
              // v6.0.20: 扩大查询范围到前2个+后1个场景，获取更多连续性��下文
              const neighborRange = [sceneNum - 2, sceneNum - 1, sceneNum + 1].filter(n => n > 0);
              const { data: neighborScenes } = await supabase
                .from('series_storyboards')
                .select('scene_number, description, emotional_tone, location, camera_angle, image_url, dialogue, time_of_day')
                .eq('series_id', seriesId)
                .eq('episode_number', episodeNumber)
                .in('scene_number', neighborRange)
                .order('scene_number', { ascending: true });

              // v6.0.63: 跨集衔接——当本集scene 1/2缺少前序场景时，查询上一集末尾场景补充上下文
              let crossEpPrevScene: any = null;
              if (sceneNum <= 2 && episodeNumber > 1) {
                try {
                  const { data: prevEpLast } = await supabase
                    .from('series_storyboards')
                    .select('scene_number, description, emotional_tone, location, camera_angle, dialogue, time_of_day')
                    .eq('series_id', seriesId)
                    .eq('episode_number', episodeNumber - 1)
                    .order('scene_number', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                  if (prevEpLast) crossEpPrevScene = prevEpLast;
                } catch { /* non-blocking */ }
              }

              if (neighborScenes && neighborScenes.length > 0 || crossEpPrevScene) {
                const prevPrevScene = neighborScenes?.find((s: any) => s.scene_number === sceneNum - 2) || null;
                let prevScene: any = neighborScenes?.find((s: any) => s.scene_number === sceneNum - 1) || null;
                const nextScene = neighborScenes?.find((s: any) => s.scene_number === sceneNum + 1) || null;
                const transitionParts: string[] = [];

                // v6.0.63: 跨集末尾场景作为"虚拟前一场景"（仅当本集无前序场景时）
                if (!prevScene && crossEpPrevScene && sceneNum === 1) {
                  const locInfo = crossEpPrevScene.location ? `地点：${crossEpPrevScene.location}` : '';
                  const dlgInfo = crossEpPrevScene.dialogue ? `对话：「${crossEpPrevScene.dialogue.substring(0, 80)}」` : '';
                  transitionParts.push(`【上集末尾(第${episodeNumber - 1}集最后场景)——本集开头必须承接上集结尾】${crossEpPrevScene.description?.substring(0, 100) || ''}。情感：${crossEpPrevScene.emotional_tone || '自然'}，${[locInfo, dlgInfo].filter(Boolean).join('，')}。【关键约束】本集第1场景开场画面必须与上集结尾画面一致——角色服装/发型/位置延续，同一地点保持相同布景/光线`);
                  // 标记已用跨集场景，避免下面重复注入
                  prevScene = crossEpPrevScene;
                }

                // v6.0.78: 更详细的上下文——增加generation_metadata中的transition/endingVisualState
                if (prevScene && prevScene !== crossEpPrevScene) {
                  const locationInfo = prevScene.location ? `地点：${prevScene.location}` : '';
                  const timeInfo = prevScene.time_of_day ? `时段：${prevScene.time_of_day}` : '';
                  const camInfo = prevScene.camera_angle ? `镜头：${prevScene.camera_angle}` : '';
                  const dialogueInfo = prevScene.dialogue ? `对话：「${prevScene.dialogue.substring(0, 80)}」` : '';
                  transitionParts.push(`【上一场景(场景${sceneNum - 1})——画面必须连贯衔接】${prevScene.description?.substring(0, 100) || ''}。情感：${prevScene.emotional_tone || '自然'}，${[locationInfo, timeInfo, camInfo, dialogueInfo].filter(Boolean).join('，')}。【关键约束】本场景开头画面必须与上一场景结尾画面一致——相同角色保持相同服装/发型/表情过渡，相同地点保持相同布景/光线/天气`);
                }
                // v6.0.20: 前前场景用于建立更长的视觉记忆链
                if (prevPrevScene && prevScene) {
                  transitionParts.push(`【前2场景摘要】场景${sceneNum - 2}→场景${sceneNum - 1}：${(prevPrevScene.description || '').substring(0, 40)}→${(prevScene.description || '').substring(0, 40)}。保持视觉风格和角色外观的整体一致性`);
                }
                if (nextScene) {
                  transitionParts.push(`【下一场景(场景${sceneNum + 1})预告】${nextScene.description?.substring(0, 50) || ''}。本场景结尾需为下一场景做视觉铺垫，避免画面突变`);
                }
                // v6.0.69: 对话去重约束——防止同集内��话重复
                if (prevScene?.dialogue) {
                  transitionParts.push(`【对话去重】上一场景对话为「${prevScene.dialogue.substring(0, 60)}」——本场景必须推进全新对话内容，严禁重复或近似上一场景的台词`);
                }
                if (transitionParts.length > 0) {
                  contextParts.push(transitionParts.join('。'));
                  console.log(`[Volcengine] 🔗 Injected ${transitionParts.length} neighbor scene(s) context for continuity`);
                }
              }
            }
          } catch (neighborErr: any) {
            console.warn(`[Volcengine] Neighbor scenes lookup failed (non-blocking):`, neighborErr?.message);
          }
        }

        // v6.0.78: 注入当前分镜的transitionFromPrevious镜头衔接指令
        if (storyboardId) {
          try {
            const { data: currentSb } = await supabase
              .from('series_storyboards')
              .select('generation_metadata')
              .eq('id', storyboardId)
              .maybeSingle();
            if (currentSb?.generation_metadata) {
              const curMeta = typeof currentSb.generation_metadata === 'string'
                ? JSON.parse(currentSb.generation_metadata) : currentSb.generation_metadata;
              if (curMeta?.transitionFromPrevious) {
                contextParts.push(`【本场景镜头衔接指令】${curMeta.transitionFromPrevious}——视频开头必须体现这一镜头衔接`);
                console.log(`[Volcengine] 🎬 Injected current scene transitionFromPrevious: ${curMeta.transitionFromPrevious.substring(0, 50)}`);
              }
            }
          } catch { /* non-blocking */ }
        }

        if (contextParts.length > 0) {
          // 将故事上下文+视觉约束+前后场景上下文作为前缀追加到 prompt 前面
          finalPrompt = `${contextParts.join('。')}。场景描述：${finalPrompt}`;
          console.log(`[Volcengine] 📖 Enriched prompt with series context + visual style + neighbor scenes (${contextParts.length} parts)`);
        }
      } catch (ctxErr: any) {
        console.warn(`[Volcengine] Context lookup failed (non-blocking):`, ctxErr.message);
      }
    }

    // v6.0.21: 前一场景图片注入——当无用户图片时，自动用前一场景图片作为i2v起始参考
    // 这使 t2v 自动升级为 i2v，大幅提升场景间视觉连贯性
    // v6.0.116: 增加风格锚定图回退——当前序场景和跨集场景均无图片时，使用系列首个已生成场景的图片作为i2v风格锚点
    let prevSceneImageInjected = false;
    let styleAnchorInjected = false;
    if (seriesId && episodeNumber && storyboardNumber && finalImages.length === 0) {
      try {
        const sceneNum = parseInt(storyboardNumber);
        if (sceneNum > 1) {
          // 同集内前一场景图片
          const { data: prevSb } = await supabase
            .from('series_storyboards')
            .select('image_url, scene_number')
            .eq('series_id', seriesId)
            .eq('episode_number', episodeNumber)
            .eq('scene_number', sceneNum - 1)
            .maybeSingle();

          const refImageUrl = prevSb?.image_url;
          if (refImageUrl && typeof refImageUrl === 'string' && refImageUrl.startsWith('http')) {
            finalImages.push(refImageUrl);
            prevSceneImageInjected = true;
            console.log(`[Volcengine] 🖼️ Injected prev scene ${sceneNum - 1} image as i2v reference: ${refImageUrl.substring(0, 80)}...`);
          }
        } else if (sceneNum === 1 && episodeNumber > 1) {
          // v6.0.63: 跨集衔接——第1场景注入上一集最后一个场景的图片，确保上下集视觉连贯
          const { data: prevEpLastSb } = await supabase
            .from('series_storyboards')
            .select('image_url, scene_number, episode_number')
            .eq('series_id', seriesId)
            .eq('episode_number', episodeNumber - 1)
            .order('scene_number', { ascending: false })
            .limit(1)
            .maybeSingle();

          const prevEpImageUrl = prevEpLastSb?.image_url;
          if (prevEpImageUrl && typeof prevEpImageUrl === 'string' && prevEpImageUrl.startsWith('http')) {
            finalImages.push(prevEpImageUrl);
            prevSceneImageInjected = true;
            console.log(`[Volcengine] 🖼️ Cross-episode: injected ep${episodeNumber - 1} last scene (scene ${prevEpLastSb.scene_number}) image as i2v reference: ${prevEpImageUrl.substring(0, 80)}...`);
          }
        }

        // v6.0.116: 风格锚定图回退——当以上均无图片时，查找系列中任意已生成场景的首帧作为风格锚点
        // 优先级: coherence_check.styleAnchorImageUrl → 第1集第1场景image_url → 任意已生成场景image_url
        if (finalImages.length === 0) {
          let anchorImageUrl = ctxSeries?.coherence_check?.styleAnchorImageUrl || '';
          if (!anchorImageUrl || !anchorImageUrl.startsWith('http')) {
            // 查找系列中首个有image_url的场景（按episode_number+scene_number升序）
            const { data: firstImageSb } = await supabase
              .from('series_storyboards')
              .select('image_url, episode_number, scene_number')
              .eq('series_id', seriesId)
              .not('image_url', 'is', null)
              .order('episode_number', { ascending: true })
              .order('scene_number', { ascending: true })
              .limit(1)
              .maybeSingle();
            anchorImageUrl = firstImageSb?.image_url || '';
          }
          if (anchorImageUrl && anchorImageUrl.startsWith('http')) {
            finalImages.push(anchorImageUrl);
            styleAnchorInjected = true;
            console.log(`[Volcengine] 🎨 Style anchor image injected as i2v reference (no prev scene available): ${anchorImageUrl.substring(0, 80)}...`);
          }
        }
      } catch (refErr: any) {
        console.warn(`[Volcengine] Prev scene / style anchor image lookup failed (non-blocking):`, refErr?.message);
      }
    }

    console.log(`[Volcengine] 🎬 New request: style=${style}, dur=${duration}, audio=${enableAudio}, imgs=${finalImages.length}${prevSceneImageInjected ? '(+1 prev ref)' : styleAnchorInjected ? '(+1 style anchor)' : ''}, series=${seriesId || '-'}, ep=${episodeNumber || '-'}, sb=${storyboardNumber || '-'}`);

    // 确保用户存在
    if (userPhone) {
      const { data: eu } = await supabase.from('users').select('phone').eq('phone', userPhone).maybeSingle();
      if (!eu) await supabase.from('users').insert({ phone: userPhone, nickname: `用户${userPhone.slice(-4)}` }).select().maybeSingle();
    }

    // 简化模型选择（v6.0.21: 新增单图i2v路径——前场景注入后自动升级）
    let selectedModel = model || 'doubao-seedance-1-5-pro-251215';
    if (!model) {
      // v6.0.21: 系列分镜强制统一使用 seedance-1-5-pro 模型
      // 确��所有分镜输出一致的分���率/编码，避免MP4拼接因分辨率不匹配而失败
      if (seriesId && storyboardNumber) {
        selectedModel = 'doubao-seedance-1-5-pro-251215';
      } else if (enableAudio) {
        selectedModel = 'doubao-seedance-1-5-pro-251215';
      } else if (finalImages.length > 1) {
        selectedModel = 'doubao-seedance-1-0-lite-i2v-250428';
      } else if (finalImages.length === 1) {
        selectedModel = 'doubao-seedance-1-5-pro-251215';
      } else if (finalImages.length === 0) {
        selectedModel = 'doubao-seedance-1-0-lite-t2v-250428';
      }
    }

    // v5.6.2: 模型能力映射 — 限制时长/分辨率在模型支持范围内
    const MODEL_CAPS: Record<string, { maxDuration: number; resolutions: string[] }> = {
      'doubao-seedance-1-5-pro-251215': { maxDuration: 12, resolutions: ['480p', '720p'] },
      'doubao-seedance-1-0-pro-250528': { maxDuration: 10, resolutions: ['480p', '720p', '1080p'] },
      'doubao-seedance-1-0-pro-fast-251015': { maxDuration: 12, resolutions: ['480p', '720p', '1080p'] },
      'doubao-seedance-1-0-lite-t2v-250428': { maxDuration: 12, resolutions: ['480p', '720p'] },
      'doubao-seedance-1-0-lite-i2v-250428': { maxDuration: 10, resolutions: ['480p', '720p'] },
      'doubao-wan2-1-14b-250110': { maxDuration: 12, resolutions: ['480p', '720p', '1080p'] },
    };
    const caps = MODEL_CAPS[selectedModel] || { maxDuration: 12, resolutions: ['480p', '720p'] };

    // v5.6.2: 标准化分辨率（兼容 "1280x720"、"720p" 等格式）
    const RES_ORDER = ['480p', '720p', '1080p', '2k'];
    function normalizeRes(r: string): string {
      if (!r) return '720p';
      const l = r.toLowerCase().trim();
      if (l.includes('1280') || l === '720p') return '720p';
      if (l.includes('1920') || l === '1080p') return '1080p';
      if (l.includes('854') || l === '480p') return '480p';
      if (l.includes('2560') || l === '2k') return '2k';
      if (RES_ORDER.includes(l)) return l;
      return '720p';
    }
    const normalizedRes = normalizeRes(resolution);
    // 如果请���的分辨率超出模型能力，降级到模型最高支持
    const maxModelRes = caps.resolutions[caps.resolutions.length - 1] || '720p';
    let effectiveRes = RES_ORDER.indexOf(normalizedRes) > RES_ORDER.indexOf(maxModelRes)
      ? maxModelRes : normalizedRes;
    // v6.0.78: 系列分镜统一分辨率——从coherence_check读取用户选择的分辨率，默认720p
    // v6.0.79: 同时统一画面比例
    let effectiveAspectRatio = rawAspectRatio || '9:16';
    if (seriesId && storyboardNumber) {
      const seriesResolution = ctxSeries?.coherence_check?.resolution || '720p';
      effectiveRes = seriesResolution;
      effectiveAspectRatio = ctxSeries?.coherence_check?.aspectRatio || '9:16';
    }

    // v6.0.79: 分辨率 × 比例 → 宽高映射（参考主流平台标准）
    const ASPECT_RES_WH: Record<string, Record<string, [number, number]>> = {
      '16:9': { '480p': [854, 480],  '720p': [1280, 720],  '1080p': [1920, 1080], '2k': [2560, 1440] },
      '9:16': { '480p': [480, 854],  '720p': [720, 1280],  '1080p': [1080, 1920], '2k': [1440, 2560] },
      '1:1':  { '480p': [480, 480],  '720p': [720, 720],   '1080p': [1080, 1080], '2k': [1440, 1440] },
      '4:3':  { '480p': [640, 480],  '720p': [960, 720],   '1080p': [1440, 1080], '2k': [1920, 1440] },
      '3:4':  { '480p': [480, 640],  '720p': [720, 960],   '1080p': [1080, 1440], '2k': [1440, 1920] },
    };
    const aspectMap = ASPECT_RES_WH[effectiveAspectRatio] || ASPECT_RES_WH['9:16'];
    const [vWidth, vHeight] = aspectMap[effectiveRes] || aspectMap['720p'] || [720, 1280];
    console.log(`[Volcengine] AspectRatio: ${effectiveAspectRatio}, Resolution: ${effectiveRes} -> ${vWidth}x${vHeight}`);

    // v5.6.2: 根据模型能力钳制时长
    const parsedDuration = parseInt(String(duration)) || 5;
    const adjustedDuration = Math.max(5, Math.min(caps.maxDuration, parsedDuration));

    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`[Volcengine] Model: ${selectedModel}, Duration: ${adjustedDuration}s (req=${duration}), Resolution: ${effectiveRes} (${vWidth}x${vHeight}, req=${resolution}), AspectRatio: ${effectiveAspectRatio}, TaskID: ${taskId}`);

    // 🔒 v6.0.3: 分镜级去重 — 优先复用已有任务（含已完成），避免重复创建或重新生成已删除任务
    // v6.0.87: forceRegenerate=true 时跳过去重，允许强制重新生成（分辨率修复场景）
    if (forceRegenerate && storyboardId) {
      // 将旧的已完成任务标记为cancelled，防止后续被复用
      const { data: oldTasks } = await supabase.from('video_tasks')
        .select('task_id')
        .eq('user_phone', userPhone || 'system')
        .in('status', ['completed', 'failed'])
        .filter('generation_metadata->>storyboardId', 'eq', storyboardId);
      if (oldTasks && oldTasks.length > 0) {
        const oldIds = oldTasks.map((t: any) => t.task_id);
        await supabase.from('video_tasks').update({ status: 'cancelled' }).in('task_id', oldIds);
        console.log(`[Volcengine] 🔄 forceRegenerate: cancelled ${oldIds.length} old tasks for storyboard=${storyboardId}`);
      }
      // 同时清除 storyboard 表中的旧 video_url
      await supabase.from('series_storyboards').update({ video_url: null, status: 'draft' }).eq('id', storyboardId);
      console.log(`[Volcengine] 🔄 forceRegenerate: cleared video_url for storyboard=${storyboardId}`);
    }
    if (storyboardId && !forceRegenerate) {
      // Step 1: 检查是否有进行中的活跃任务
      const { data: activeTasks } = await supabase.from('video_tasks')
        .select('task_id, status, video_url, created_at')
        .eq('user_phone', userPhone || 'system')
        .in('status', ['pending', 'processing', 'submitted'])
        .filter('generation_metadata->>storyboardId', 'eq', storyboardId)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (activeTasks && activeTasks.length > 0) {
        const existing = activeTasks[0];
        console.warn(`[Volcengine] ⚠️ Duplicate blocked (active): storyboard=${storyboardId} has active task ${existing.task_id} (status=${existing.status})`);
        return c.json({
          success: true,
          local_task_id: existing.task_id,
          taskId: existing.task_id,
          message: 'Active task already exists for this storyboard',
          duplicate: true,
          existingStatus: existing.status,
        });
      }

      // Step 2: 检查是否有已完成且带有效 video_url 的任务（最近30天内）
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: completedTasks } = await supabase.from('video_tasks')
        .select('task_id, status, video_url, volcengine_task_id, thumbnail, created_at')
        .eq('user_phone', userPhone || 'system')
        .eq('status', 'completed')
        .not('video_url', 'is', null)
        .filter('generation_metadata->>storyboardId', 'eq', storyboardId)
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(1);

      if (completedTasks && completedTasks.length > 0) {
        const existing = completedTasks[0];
        // 验证 video_url 是有效的 HTTP URL（非空占位）
        if (existing.video_url && (existing.video_url.startsWith('http://') || existing.video_url.startsWith('https://'))) {
          console.log(`[Volcengine] ✅ Reusing completed task for storyboard=${storyboardId}: task=${existing.task_id}, url=${existing.video_url.substring(0, 60)}...`);
          return c.json({
            success: true,
            local_task_id: existing.task_id,
            taskId: existing.task_id,
            task_id: existing.volcengine_task_id || existing.task_id,
            message: 'Completed task already exists for this storyboard',
            duplicate: true,
            existingStatus: 'completed',
            existingVideoUrl: existing.video_url,
          });
        }
      }

      // Step 3: 检查 series_storyboards 表中是否已有 video_url（可能由其他方式写入）
      const { data: sbRecord } = await supabase.from('series_storyboards')
        .select('video_url, status')
        .eq('id', storyboardId)
        .maybeSingle();

      if (sbRecord?.video_url && (sbRecord.video_url.startsWith('http://') || sbRecord.video_url.startsWith('https://'))) {
        console.log(`[Volcengine] ✅ Storyboard ${storyboardId} already has video_url in series_storyboards: ${sbRecord.video_url.substring(0, 60)}...`);
        return c.json({
          success: true,
          local_task_id: `sb-existing-${storyboardId}`,
          taskId: `sb-existing-${storyboardId}`,
          message: 'Storyboard already has a video URL',
          duplicate: true,
          existingStatus: 'completed',
          existingVideoUrl: sbRecord.video_url,
        });
      }
    }

    // v5.5.0: title/style/duration 是真实列; model/resolution/fps/enableAudio 放入 metadata
    const { data: insertedTask, error: insertErr } = await supabase.from('video_tasks').insert({
      task_id: taskId,
      user_phone: userPhone || 'system',
      prompt: finalPrompt,
      title: title || finalPrompt.substring(0, 100) || `视频任务-${taskId.substring(5, 15)}`,
      style,
      duration: String(adjustedDuration),
      status: 'pending',
      generation_metadata: {
        seriesId, episodeId, storyboardId, episodeNumber, storyboardNumber,
        type: storyboardId ? 'storyboard_video' : 'standalone',
        model: selectedModel,
        resolution: effectiveRes,
        requestedResolution: resolution,
        aspectRatio: effectiveAspectRatio, // v6.0.79
        width: vWidth, height: vHeight,
        fps: parseInt(String(fps)) || 24,
        enableAudio,
        codec, // v6.0.77: 默认h265（更高画质），异常自动降级h264
      },
    }).select('task_id').single();
    if (insertErr) {
      console.error(`[Volcengine] ❌ DB insert failed for task ${taskId}:`, insertErr.message);
      return c.json({ error: `创建任务记录失败: ${insertErr.message}` }, 500);
    }
    console.log(`[Volcengine] ✅ DB insert confirmed: ${insertedTask.task_id}`);

    // v6.0.96: 扣减每日视频配额（优先消耗免费额度，再消耗付费额度）
    if (quotaCheckInfo && userPhone && userPhone !== ADMIN_PHONE) {
      try {
        const today = new Date().toISOString().split('T')[0];
        if (quotaCheckInfo.freeRemaining > 0) {
          await supabase.from('kv_store_fc31472c').upsert(
            { key: dailyCountKey(userPhone, today), value: String(quotaCheckInfo.usedToday + 1) },
            { onConflict: 'key' }
          );
          console.log(`[Quota] ${userPhone}: deducted free quota, used=${quotaCheckInfo.usedToday + 1}/${quotaCheckInfo.freeLimit}`);
        } else if (quotaCheckInfo.paidCredits > 0) {
          await supabase.from('kv_store_fc31472c').upsert(
            { key: paidCreditsKey(userPhone), value: String(Math.max(0, quotaCheckInfo.paidCredits - 1)) },
            { onConflict: 'key' }
          );
          console.log(`[Quota] ${userPhone}: deducted paid credit, remaining=${quotaCheckInfo.paidCredits - 1}`);
        }
      } catch (quotaErr: any) {
        console.warn('[Quota] Deduct error (non-blocking):', quotaErr.message);
      }
    }

    // 上传Base64图片
    const publicUrls: string[] = [];
    if (finalImages.length > 0) {
      const { data: buckets } = await supabase.storage.listBuckets();
      if (!buckets?.some((b: any) => b.name === IMAGE_BUCKET)) {
        await supabase.storage.createBucket(IMAGE_BUCKET, { public: true });
      }
      for (let i = 0; i < finalImages.length; i++) {
        const img = finalImages[i];
        if (typeof img === 'string' && img.startsWith('data:image/')) {
          try {
            const base64Data = img.split(',')[1];
            const mimeType = img.split(';')[0].split(':')[1];
            const ext = mimeType.split('/')[1];
            const binary = Uint8Array.from(atob(base64Data), ch => ch.charCodeAt(0));
            const fileName = `${Date.now()}-${i}.${ext}`;
            const { data: ud } = await supabase.storage.from(IMAGE_BUCKET).upload(fileName, binary, { contentType: mimeType, upsert: true });
            if (ud?.path) {
              const { data: urlD } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(ud.path);
              if (urlD?.publicUrl) publicUrls.push(urlD.publicUrl);
            }
          } catch (ue: any) { console.error(`[Volcengine] Image upload ${i} failed:`, ue.message); }
        } else if (typeof img === 'string' && img.startsWith('http')) {
          publicUrls.push(img);
        }
      }
    }

    // 构建火山引擎请求
    // v6.0.16: 强制使用DB中的系列风格，防止同一系列混用不同风格
    const effectiveStyle = (seriesId && ctxSeries?.style) ? ctxSeries.style : style;
    const stylePrompt = STYLE_PROMPTS[effectiveStyle] || STYLE_PROMPTS.comic;
    const contentArray: any[] = [];
    publicUrls.forEach(url => contentArray.push({ type: "image_url", image_url: { url } }));
    // v6.0.103: 增强风格锁定——从coherence_check提取色���/构图/环境的完整描述注入styleLock
    // 根因: 此前styleLock仅包含风格分类描述(如"真实写实风格...")，缺少具体色调/质感/渲染参数
    //       不同分镜只有类别相同但具体视觉参数不一致，导致画风漂移（同一部剧有的偏暖有的偏冷）
    let styleAnchor = '';
    if (seriesId && ctxSeries?.coherence_check?.visualStyleGuide) {
      const g = ctxSeries.coherence_check.visualStyleGuide;
      const cMatch = g.match(/【色彩方案】([^【]*)/);
      const lMatch = g.match(/【构图与光影规范】([^【]*)/);
      if (cMatch) styleAnchor += `色彩方案：${cMatch[1].trim().substring(0, 120)}。`;
      if (lMatch) styleAnchor += `光影规范：${lMatch[1].trim().substring(0, 120)}。`;
    }
    const styleLock = `【强制画风：${stylePrompt}。全片必须严格统一此风格，禁止混入其他画风。${styleAnchor}每个镜头的色调/光影/质感/渲染手法必须与同系列其他镜头完全一致】`;

    // v6.0.36: 专业镜头语言注入——将分镜的camera_angle映射为Seedance专业运镜指令
    let proShotDirective = '';
    if (seriesId && episodeNumber && storyboardNumber) {
      try {
        const { data: currentSb } = await supabase
          .from('series_storyboards')
          .select('camera_angle, emotional_tone, location, time_of_day')
          .eq('series_id', seriesId)
          .eq('episode_number', episodeNumber)
          .eq('scene_number', parseInt(storyboardNumber))
          .maybeSingle();
        if (currentSb?.camera_angle) {
          const mapped = PRO_SHOT_MAP[currentSb.camera_angle] || '';
          if (mapped) proShotDirective = `【镜头语言】${mapped}`;
        }
      } catch (shotErr: any) {
        console.warn(`[Volcengine] Shot mapping lookup failed (non-blocking):`, shotErr?.message);
      }
    }

    // v6.0.69: Seedance 2.0 专业视频约束——运镜/画质/防崩/角色锁定/作品类型定制
    const seedanceSuffix = publicUrls.length > 0
      ? `${SEEDANCE_BASE_SUFFIX}${SEEDANCE_I2V_EXTRA}。`
      : `${SEEDANCE_BASE_SUFFIX}。`;
    // v6.0.69: 根据作品类型注入个性化视频生成约束
    let productionTypeDirective = '';
    if (seriesId) {
      try {
        const ptKey = ctxSeries?.coherence_check?.productionType || 'short_drama';
        const ptConfig = PRODUCTION_TYPE_PROMPTS[ptKey];
        if (ptConfig) {
          productionTypeDirective = `【${ptConfig.label}视频规范】镜头：${ptConfig.shotStyle.substring(0, 80)}。色调：${ptConfig.colorTone.substring(0, 60)}。`;
        }
      } catch { /* non-blocking */ }
    }

    // v6.0.92: 画面比例专属构图强制指令——修复竖屏/方屏下角色主体不在主画面的问题
    // 根本原因: Seedance模型默认按16:9横屏构图习惯生成，输出竖屏(720×1280)时角色位置偏移至边缘
    // 修复: 在prompt最高优先级位置注入针对比例的构图规范，强制模型按对应尺寸居中对焦主体
    const ASPECT_FRAMING_DIRECTIVES: Record<string, string> = {
      '9:16': '【竖屏9:16构图——绝对强制执行】本视频尺寸为720×1280竖向画幅，主体角色必须严格沿画面垂直中轴线居中放置；人物头顶位于画面顶部20%-35%处，头部到腰部完整可见于画面中央区域；近景/中景构图下人脸高度不低于画面高度的20%；严禁主体向左/右偏移至画面边缘；严禁人物头部被画面上边缘裁切；严禁身体主要部位超出画面左右边界；所有角色面部表情和肢体动作须在画面可见区域内完整呈现',
      '1:1':  '【方形1:1构图——绝对强制执行】本视频尺寸为正方形画幅，主体角色垂直水平双向居中；人物上半身(头部至腰部)完整可见于画面中央；严禁主体偏移至任何方向的边缘导致被裁切',
      '3:4':  '【3:4竖向构图——绝对强制执行】本视频竖向画幅，主体角色沿垂直中轴居中；头顶至腰部完整可见在画面中央；严禁主体被左右边缘裁切或上下超出画面',
      '4:3':  '【4:3横向构图——强制执行】横向宽画幅，主体角色按三分法定位于画面内；人物完整可见，禁止主体超出画面上下边界',
      '16:9': '【16:9横屏构图——强制执行】宽屏横向画幅，人物按三分法构图完整可见于画面内；禁止主体被画面顶部或底部裁切',
    };
    const framingDirective = ASPECT_FRAMING_DIRECTIVES[effectiveAspectRatio] || ASPECT_FRAMING_DIRECTIVES['9:16'];
    console.log(`[Volcengine] 📐 AspectRatio framing directive injected for ${effectiveAspectRatio}: ${framingDirective.substring(0, 60)}...`);

    contentArray.push({ type: "text", text: `${styleLock}\n${framingDirective}${proShotDirective ? `\n${proShotDirective}` : ''}${productionTypeDirective ? `\n${productionTypeDirective}` : ''}\n${finalPrompt}\n${seedanceSuffix}` });

    // v5.6.2: 将视频时长、分辨率作为 API 参数传递（而非仅写在 text prompt 中）
    // 修复：之前 duration/resolution 只存在于 text 提示词，模型不一定遵守
    const reqBody: any = {
      model: selectedModel,
      content: contentArray,
      return_last_frame: true,
      // 顶层参数
      duration: adjustedDuration,
      width: vWidth,
      height: vHeight,
      // req_params 备用（部分 API 版本使用此字段）
      req_params: {
        duration: adjustedDuration,
        video_duration: adjustedDuration,
        width: vWidth,
        height: vHeight,
        resolution: effectiveRes,
        fps: parseInt(String(fps)) || 24,
        codec: codec, // v6.0.77: 默认h265
      },
    };
    if (enableAudio) reqBody.enable_audio = true;
    // v6.0.77: 编码参数（顶层+req_params双写，确保API识别）
    reqBody.codec = codec;
    reqBody.video_codec = codec;

    // v6.0.117: 移除确定性seed——Seedance API不支持/忽略seed参数
    // 风格一致性改由styleAnchorImageUrl(i2v参考图) + 首帧提示注入(prompt)两层保障

    console.log(`[Volcengine] Calling API: model=${selectedModel}, duration=${adjustedDuration}s, res=${effectiveRes}(${vWidth}x${vHeight}), content_items=${contentArray.length}, audio=${enableAudio}, codec=${codec}`);
    let apiResp: Response | null = null;
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        apiResp = await fetchWithTimeout(VOLCENGINE_BASE_URL, {
          method: 'POST', headers: { 'Authorization': `Bearer ${VOLCENGINE_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(reqBody),
        }, 180000);
        console.log(`[Volcengine] API response: status=${apiResp.status} (attempt ${attempt + 1})`);
        break;
      } catch (err: any) {
        lastErr = err;
        console.error(`[Volcengine] API attempt ${attempt + 1} failed:`, err.message);
        if (attempt < 2) await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
      }
    }
    if (!apiResp) {
      console.error(`[Volcengine] All 3 API attempts failed for task ${taskId}: ${lastErr?.message}`);
      await supabase.from('video_tasks').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('task_id', taskId);
      return c.json({ error: `火山引擎API请求失败: ${lastErr?.message || 'Unknown'}` }, 500);
    }
    const respText = await apiResp.text();
    let result: any;
    try { result = JSON.parse(respText); } catch {
      console.error(`[Volcengine] Parse error for task ${taskId}:`, respText.substring(0, 300));
      await supabase.from('video_tasks').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('task_id', taskId);
      return c.json({ error: 'API响应格式错误' }, 500);
    }
    if (!apiResp.ok) {
      const em = result.error?.message || result.message || 'API error';
      // v6.0.77: H265失败自动降级H264重试
      if (codec === 'h265' && (em.includes('codec') || em.includes('h265') || em.includes('unsupported') || apiResp.status === 400)) {
        console.warn(`[Volcengine] H265 failed (${em}), auto-fallback to H264...`);
        reqBody.codec = 'h264';
        reqBody.video_codec = 'h264';
        reqBody.req_params.codec = 'h264';
        await supabase.from('video_tasks').update({ generation_metadata: { ...reqBody, codec: 'h264', codecFallback: true } }).eq('task_id', taskId);
        try {
          const fallbackResp = await fetchWithTimeout(VOLCENGINE_BASE_URL, {
            method: 'POST', headers: { 'Authorization': `Bearer ${VOLCENGINE_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(reqBody),
          }, 180000);
          if (fallbackResp.ok) {
            const fallbackResult = JSON.parse(await fallbackResp.text());
            const volcTaskIdFb = fallbackResult.id || fallbackResult.task_id || fallbackResult.data?.id || '';
            if (volcTaskIdFb) {
              await supabase.from('video_tasks').update({ status: 'processing', volcengine_task_id: volcTaskIdFb, updated_at: new Date().toISOString() }).eq('task_id', taskId);
              console.log(`[Volcengine] ✅ H264 fallback success: local=${taskId}, volcengine=${volcTaskIdFb}`);
              return c.json({ success: true, task_id: volcTaskIdFb, local_task_id: taskId, taskId, volcTaskId: volcTaskIdFb, message: '视频生成任务已创建（H264降级）', codecFallback: true });
            }
          }
        } catch (fbErr: any) {
          console.error(`[Volcengine] H264 fallback also failed:`, fbErr.message);
        }
      }
      console.error(`[Volcengine] API error for task ${taskId}: ${em}`);
      await supabase.from('video_tasks').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('task_id', taskId);
      return c.json({ error: em, details: { error: result.error } }, apiResp.status);
    }
    const volcTaskId = result.id || result.task_id || result.data?.id || '';
    if (!volcTaskId) {
      console.error(`[Volcengine] No task ID in response for ${taskId}:`, JSON.stringify(result).substring(0, 200));
      await supabase.from('video_tasks').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('task_id', taskId);
      return c.json({ error: '未获取到火山引擎任务ID' }, 500);
    }
    await supabase.from('video_tasks').update({ status: 'processing', volcengine_task_id: volcTaskId, updated_at: new Date().toISOString() }).eq('task_id', taskId);
    console.log(`[Volcengine] ✅ Task created: local=${taskId}, volcengine=${volcTaskId}`);
    return c.json({ success: true, task_id: volcTaskId, local_task_id: taskId, taskId, volcTaskId, message: '视频生成任务已创建' });
  } catch (error: any) {
    console.error('[Volcengine] Generate error:', truncateErrorMsg(error));
    return c.json({ error: error.message }, 500);
  }
});

// 查询视频任务状态 — v5.4.0: 完成时自动转存阿���云 OSS
app.get(`${PREFIX}/volcengine/status/:taskId`, async (c) => {
  try {
    const taskId = c.req.param('taskId');
    // v6.0.23: 三重查找合并为单次 .or() 查询（原: 最多3次串行查询 → 现: 1次）
    let dbTask: any = null;
    {
      let orFilter = `task_id.eq.${taskId},volcengine_task_id.eq.${taskId}`;
      if (taskId.startsWith('vtask-')) orFilter += `,id.eq.${taskId}`;
      const { data: taskResults } = await supabase.from('video_tasks')
        .select('id, task_id, user_phone, prompt, style, duration, status, volcengine_task_id, video_url, thumbnail, generation_metadata, series_id, created_at, updated_at')
        .or(orFilter);
      if (taskResults && taskResults.length > 0) {
        // 优先级：task_id > volcengine_task_id > id PK
        dbTask = taskResults.find((t: any) => t.task_id === taskId)
          || taskResults.find((t: any) => t.volcengine_task_id === taskId)
          || taskResults[0];
      }
    }
    if (!dbTask && !taskId.startsWith('cgt-')) {
      return c.json({ success: false, error: '任务不存在', message: `Task ${taskId} not found in database` }, 404);
    }
    // v6.0.5: 已取消的任务直接返回 cancelled 状态，停止轮询
    if (dbTask && dbTask.status === 'cancelled') {
      return c.json({ success: true, data: { task_id: dbTask.task_id, status: 'cancelled', content: {} } });
    }
    // 已完成且有视频URL，直接返回（不重复查询火山引擎）
    if (dbTask && ['completed', 'success', 'succeeded'].includes(dbTask.status) && dbTask.video_url) {
      // v6.0.77: 如果已完成但URL仍非OSS，触发后台OSS补传（修复之前fire-and-forget失败的情况）
      if (isOSSConfigured() && !dbTask.video_url.includes('.aliyuncs.com') && dbTask.video_url.startsWith('http')) {
        const _localId = dbTask.task_id;
        const _meta = dbTask.generation_metadata;
        (async () => {
          try {
            const videoResult = await transferFileToOSS(dbTask.video_url, `videos/${_localId}.mp4`, 'video/mp4');
            if (videoResult.transferred) {
              await supabase.from('video_tasks').update({ video_url: videoResult.url }).eq('task_id', _localId);
              if (_meta?.type === 'storyboard_video' && _meta.seriesId && _meta.episodeNumber) {
                await supabase.from('series_storyboards').update({ video_url: videoResult.url })
                  .eq('series_id', _meta.seriesId).eq('episode_number', _meta.episodeNumber)
                  .eq('scene_number', _meta.storyboardNumber || _meta.sceneNumber);
              }
              console.log(`[OSS] ✅ Retry-transfer done for completed task ${_localId}`);
            }
          } catch (e: any) { console.warn(`[OSS] Retry-transfer failed for ${_localId}: ${e.message}`); }
        })().catch(() => {});
      }
      return c.json({ success: true, data: { task_id: dbTask.task_id, status: 'succeeded', content: { video_url: dbTask.video_url, cover_url: dbTask.thumbnail || '' }, created_at: dbTask.created_at, updated_at: dbTask.updated_at } });
    }
    const volcId = dbTask?.volcengine_task_id || (taskId.startsWith('cgt-') ? taskId : null);
    if (!volcId) {
      if (dbTask) return c.json({ success: true, data: { task_id: dbTask.task_id, status: dbTask.status, content: dbTask.video_url ? { video_url: dbTask.video_url, cover_url: dbTask.thumbnail || '' } : undefined, created_at: dbTask.created_at }, warning: '旧格式任务' });
      return c.json({ success: false, error: '任务不存在' }, 404);
    }
    if (!VOLCENGINE_API_KEY) {
      return c.json({ success: true, data: { task_id: dbTask?.task_id || taskId, status: dbTask?.status || 'unknown' }, warning: 'VOLCENGINE_API_KEY未配置' });
    }

    // ---- 查询火山引擎 API ---- v5.6.1: 降低超时到25s
    let apiResp: Response;
    try {
      apiResp = await fetchWithTimeout(`${VOLCENGINE_BASE_URL}/${volcId}`, { method: 'GET', headers: { 'Authorization': `Bearer ${VOLCENGINE_API_KEY}`, 'Content-Type': 'application/json' } }, 25000);
    } catch (fe: any) {
      if (dbTask) return c.json({ success: true, data: { task_id: dbTask.task_id, status: dbTask.status, content: dbTask.video_url ? { video_url: dbTask.video_url, cover_url: dbTask.thumbnail || '' } : undefined }, warning: '网络错误，显示数据库缓存', isFallback: true });
      return c.json({ success: false, error: `查询失败: ${fe.message}` }, 500);
    }
    const respText = await apiResp.text();
    let apiData: any;
    try { apiData = JSON.parse(respText); } catch (parseErr) { console.error('[Volcengine] JSON parse error:', parseErr, 'raw:', respText.substring(0, 200)); return c.json({ success: false, error: '火山引擎响应解析失败', parseError: true, message: respText.substring(0, 200) }, 500); }
    if (!apiResp.ok) {
      if (apiResp.status === 404 || apiData.error?.code === 'ResourceNotFound') {
        if (dbTask) await supabase.from('video_tasks').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('task_id', dbTask.task_id);
        return c.json({ success: false, error: '任务不存在', status: 'failed' }, 404);
      }
      return c.json({ error: '查询任务失败', details: apiData }, apiResp.status);
    }

    const volcStatus = apiData.status || 'unknown';
    let rawVideoUrl = '', rawThumbnailUrl = '';
    if (['succeeded', 'completed', 'success'].includes(volcStatus)) {
      rawVideoUrl = apiData.content?.video_url || apiData.video_url || '';
      rawThumbnailUrl = apiData.content?.cover_url || apiData.thumbnail || '';
    }

    // ---- v5.6.1: 视频完成 — 快速写DB + 立即返回，OSS转存fire-and-forget ----
    // 之前同步OSS转存（下载+上传30-120s）阻塞Edge Function导致：
    //   1. 状态轮询超时（前端timeout < 转存时间）
    //   2. 新的/generate请求被拒绝 → "Failed to fetch"
    //   3. 批量生成后续场景全部失败
    if (rawVideoUrl && dbTask) {
      const localId = dbTask.task_id;

      // Step 1: 立即将火山引擎原始URL写入DB（~100ms）
      const upd: any = { status: 'completed', video_url: rawVideoUrl, updated_at: new Date().toISOString() };
      if (rawThumbnailUrl) upd.thumbnail = rawThumbnailUrl;
      await supabase.from('video_tasks').update(upd).eq('task_id', localId);
      console.log(`[Volcengine] ✅ Task ${localId} completed → saved Volcengine URL to DB`);

      // Step 2: 同步到series表（轻量DB操作）
      if (dbTask.generation_metadata?.type === 'storyboard_video') {
        const meta = dbTask.generation_metadata;
        const _sid = meta.seriesId, _epn = meta.episodeNumber, _scn = meta.storyboardNumber || meta.sceneNumber;
        if (_sid && _epn && _scn) {
          try {
            const sbUpd: any = { video_url: rawVideoUrl, status: 'completed', updated_at: new Date().toISOString() };
            // v6.0.118: 同步thumbnail→storyboard.image_url，自动替换预设的referenceImageUrl
            // 效果: (a) UI展示真实生成缩略图 (b) 后续场景的prev-scene i2v引用自动升级为生成画面
            if (rawThumbnailUrl) sbUpd.image_url = rawThumbnailUrl;
            await supabase.from('series_storyboards').update(sbUpd)
              .eq('series_id', _sid).eq('episode_number', _epn).eq('scene_number', _scn);
            console.log(`[Volcengine] ✅ Synced video to storyboard S${_sid}/E${_epn}/Sc${_scn}`);
            if (rawThumbnailUrl) {
              const { data: epData } = await supabase.from('series_episodes')
                .select('id, thumbnail_url').eq('series_id', _sid).eq('episode_number', _epn).maybeSingle();
              if (epData && !epData.thumbnail_url) {
                await supabase.from('series_episodes').update({ thumbnail_url: rawThumbnailUrl, updated_at: new Date().toISOString() }).eq('id', epData.id);
              }
            }
            // v6.0.116: 风格锚定图自动保存——首个完成的场景自动成为全系列的视觉风格锚点
            // 后续所有无前序图的场景将使用此图作为i2v参考，确保风格一致
            if (rawThumbnailUrl || rawVideoUrl) {
              try {
                const { data: seriesForAnchor } = await supabase.from('series')
                  .select('coherence_check').eq('id', _sid).maybeSingle();
                const existingCoherence = seriesForAnchor?.coherence_check || {};
                // v6.0.118: 两阶段锚定——user-upload初始锚→首个生成场景自动升级
                // 阶段1: 无锚点→保存首个完成场景缩略图
                // 阶段2: user-upload锚(参考图)→自动升级为真实生成画面(更准确的Seedance输出风格)
                // 已有生成场景锚→不再覆盖(防止后续场景抢占)
                const shouldSetAnchor = !existingCoherence.styleAnchorImageUrl
                  || existingCoherence.styleAnchorScene === 'user-upload';
                if (shouldSetAnchor) {
                  const anchorUrl = rawThumbnailUrl || ''; // 优先使用缩略图（更小、加载更快）
                  if (anchorUrl) {
                    const upgradedFrom = existingCoherence.styleAnchorScene === 'user-upload'
                      ? 'user-upload' : undefined;
                    await supabase.from('series').update({
                      coherence_check: {
                        ...existingCoherence,
                        styleAnchorImageUrl: anchorUrl,
                        styleAnchorSetAt: new Date().toISOString(),
                        styleAnchorScene: `E${_epn}S${_scn}`,
                        ...(upgradedFrom ? { styleAnchorUpgradedFrom: upgradedFrom } : {}),
                      },
                    }).eq('id', _sid);
                    console.log(`[Volcengine] 🎨 Style anchor ${upgradedFrom ? 'UPGRADED from user-upload' : 'saved'} for series ${_sid}: E${_epn}S${_scn} → ${anchorUrl.substring(0, 60)}...`);
                  }
                }
              } catch (anchorErr: any) {
                console.warn(`[Volcengine] Style anchor save (non-blocking): ${anchorErr?.message}`);
              }
            }
          } catch (syncErr: any) {
            console.warn(`[Volcengine] Series sync: ${syncErr?.message}`);
          }
        }
      }

      // Step 3: v6.0.131 OSS转存 — await with 12s timeout（替代fire-and-forget）
      // 原fire-and-forget问题: Edge Function返回response后可能被杀死，IIFE中的OSS转存来不及完成
      // 新策略: 用Promise.race等待最多12s，大部分10s视频(~5-10MB)在12s内可完成转存
      //   成功 → 直接返回OSS URL（DB已更新），前端拿到持久化URL
      //   超时 → 返回原始Volcengine URL，后台继续转存（下次轮询early-return路径补充）
      let finalVideoUrl = rawVideoUrl;
      let ossPending = false;
      if (isOSSConfigured() && !rawVideoUrl.includes('.aliyuncs.com')) {
        const _meta = dbTask.generation_metadata;
        const OSS_TIMEOUT_MS = 12000;
        const ossTransferTask = (async () => {
          const videoResult = await transferFileToOSS(rawVideoUrl, `videos/${localId}.mp4`, 'video/mp4');
          if (videoResult.transferred) {
            const ossUpd: any = { video_url: videoResult.url };
            if (rawThumbnailUrl) {
              try {
                const thumbResult = await transferFileToOSS(rawThumbnailUrl, `thumbnails/${localId}.jpg`, 'image/jpeg');
                if (thumbResult.transferred) ossUpd.thumbnail = thumbResult.url;
              } catch (e: any) { console.warn(`[Volcengine] Thumbnail OSS transfer failed (non-critical):`, e.message); }
            }
            await supabase.from('video_tasks').update(ossUpd).eq('task_id', localId);
            if (_meta?.type === 'storyboard_video' && _meta.seriesId && _meta.episodeNumber) {
              await supabase.from('series_storyboards').update({ video_url: videoResult.url })
                .eq('series_id', _meta.seriesId).eq('episode_number', _meta.episodeNumber)
                .eq('scene_number', _meta.storyboardNumber || _meta.sceneNumber);
            }
            return videoResult.url; // OSS URL
          }
          return null;
        })();

        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), OSS_TIMEOUT_MS));
        try {
          const ossUrl = await Promise.race([ossTransferTask, timeoutPromise]);
          if (ossUrl) {
            finalVideoUrl = ossUrl;
            console.log(`[OSS] ✅ Await transfer done (within ${OSS_TIMEOUT_MS}ms): ${localId} → ${ossUrl.substring(0, 60)}...`);
          } else {
            ossPending = true;
            console.log(`[OSS] ⏱ Transfer timeout (${OSS_TIMEOUT_MS}ms), returning Volcengine URL. Background continues: ${localId}`);
            // 后台继续——即使超时，ossTransferTask仍在执行（但Edge Function可能随时被杀）
            ossTransferTask.then((url) => {
              if (url) console.log(`[OSS] ✅ Late background transfer done: ${localId}`);
            }).catch((err) => {
              console.warn(`[OSS] Background transfer failed for ${localId}: ${err.message}`);
            });
          }
        } catch (ossErr: any) {
          ossPending = true;
          console.warn(`[OSS] Transfer error for ${localId}: ${ossErr.message}`);
        }
      }

      // Step 4: 返回（可能是OSS URL或原始Volcengine URL）
      return c.json({
        success: true,
        data: {
          ...apiData,
          content: { ...(apiData.content || {}), video_url: finalVideoUrl, cover_url: rawThumbnailUrl || apiData.content?.cover_url || '' },
          oss_pending: ossPending,
        },
      });
    }

    // ---- 任务尚未完成：更新DB状态并返回 ----
    if (dbTask) {
      const dbStatus = volcStatus === 'failed' ? 'failed' : volcStatus;
      await supabase.from('video_tasks').update({ status: dbStatus, updated_at: new Date().toISOString() }).eq('task_id', dbTask.task_id);
    }
    return c.json({ success: true, data: { ...apiData, content: apiData.content || {} } });
  } catch (error: any) {
    console.error('[Volcengine] Status error:', truncateErrorMsg(error));
    return c.json({ error: error.message }, 500);
  }
});

// 获取用户任务列表
// v6.0.5: 过滤掉 cancelled 状态的任务（已删除系列的残留任务）
// v6.0.7: 自愈机制——自动检测并取消孤儿任务（系列已删除但任务仍在）
app.get(`${PREFIX}/volcengine/tasks`, async (c) => {
  try {
    const userPhone = c.req.query('userPhone');
    if (!userPhone) return c.json({ success: true, tasks: [], total: 0, message: '请先登录' });
    const page = Math.max(parseInt(c.req.query('page_num') || '1') || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(c.req.query('page_size') || '20') || 20, 1), 100);
    const offset = (page - 1) * pageSize;
    // v6.0.23: select specific fields instead of *
    const { data: tasks, error } = await supabase.from('video_tasks').select('task_id, user_phone, prompt, title, style, duration, status, volcengine_task_id, video_url, thumbnail, generation_metadata, created_at, updated_at').eq('user_phone', userPhone).not('status', 'eq', 'cancelled').order('created_at', { ascending: false }).range(offset, offset + pageSize - 1);
    if (error) return c.json({ success: true, tasks: [], total: 0, error: error.message });

    // v6.0.7: 自愈——检测孤儿任务（系列已删除但视频任务仍残留）
    const activeTasks = tasks || [];
    const seriesIdSet = new Set<string>();
    for (const t of activeTasks) {
      const meta = t.generation_metadata;
      if (meta && typeof meta === 'object' && (meta as any).seriesId) {
        seriesIdSet.add((meta as any).seriesId);
      }
    }

    let orphanSeriesIds = new Set<string>();
    if (seriesIdSet.size > 0) {
      const seriesIds = Array.from(seriesIdSet);
      const { data: existingSeries, error: seriesCheckErr } = await supabase
        .from('series')
        .select('id')
        .in('id', seriesIds);
      // 安全检查：如果 series 表查询失败，跳过自愈（避免误杀所有任务）
      if (seriesCheckErr) {
        console.warn(`[Tasks] Series existence check failed (skipping orphan cleanup): ${seriesCheckErr.message}`);
      } else {
        const existingIds = new Set((existingSeries || []).map((s: any) => s.id));
        orphanSeriesIds = new Set(seriesIds.filter(id => !existingIds.has(id)));
      }

      // 异步批量取消孤儿任务（fire-and-forget，不阻塞响应）
      if (orphanSeriesIds.size > 0) {
        console.log(`[Tasks] 🧹 Auto-cancelling orphan tasks for deleted series: ${Array.from(orphanSeriesIds).join(', ')}`);
        for (const orphanSid of orphanSeriesIds) {
          supabase
            .from('video_tasks')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .contains('generation_metadata', { seriesId: orphanSid })
            .in('status', ['pending', 'processing', 'submitted'])
            .then(({ error: cancelErr }) => {
              if (cancelErr) console.warn(`[Tasks] orphan cancel error for series ${orphanSid}: ${cancelErr.message}`);
              else console.log(`[Tasks] ✅ Orphan tasks for series ${orphanSid} auto-cancelled`);
            });
        }
      }
    }

    // 过滤掉孤儿任务后返回
    const filteredTasks = orphanSeriesIds.size > 0
      ? activeTasks.filter(t => {
          const meta = t.generation_metadata;
          if (meta && typeof meta === 'object' && (meta as any).seriesId) {
            return !orphanSeriesIds.has((meta as any).seriesId);
          }
          return true;
        })
      : activeTasks;

    // v6.0.77: 自愈过期卡住的任务——超过20分钟仍��� pending/processing/submitted 的视频任务标记为 failed
    const STALE_THRESHOLD_MS = 20 * 60 * 1000; // 20 minutes
    const now = Date.now();
    const staleTaskIds: string[] = [];
    for (const t of filteredTasks) {
      if (['pending', 'processing', 'submitted'].includes(t.status)) {
        const createdAt = new Date(t.created_at).getTime();
        const age = now - createdAt;
        if (age > STALE_THRESHOLD_MS) {
          staleTaskIds.push(t.task_id);
          t.status = 'failed'; // 前端立即看到 failed
        }
      }
    }
    if (staleTaskIds.length > 0) {
      console.warn(`[Tasks] Auto-expiring ${staleTaskIds.length} stale tasks (>20min): [${staleTaskIds.join(',')}]`);
      // 异步批量更新DB（fire-and-forget，不阻塞响应）
      supabase
        .from('video_tasks')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .in('task_id', staleTaskIds)
        .then(({ error: staleErr }: any) => {
          if (staleErr) console.warn(`[Tasks] stale task update error: ${staleErr.message}`);
          else console.log(`[Tasks] ${staleTaskIds.length} stale tasks marked as failed in DB`);
        });
    }

    return c.json({ success: true, tasks: toCamelCase(filteredTasks), total: filteredTasks.length });
  } catch (error: any) { console.error('[GET /volcengine/active-tasks] Error:', error); return c.json({ success: true, tasks: [], total: 0, error: error.message }); }
});

// 调试任务
app.get(`${PREFIX}/volcengine/debug/:taskId`, async (c) => {
  try {
    const taskId = c.req.param('taskId');
    const { data, error } = await supabase.from('video_tasks').select('*').eq('task_id', taskId).maybeSingle();
    if (error) return c.json({ success: false, error: error.message }, 500);
    if (!data) return c.json({ success: false, error: 'Task not found' }, 404);
    return c.json({ success: true, data: toCamelCase(data) });
  } catch (error: any) { console.error('[GET /volcengine/debug/:taskId] Error:', error); return c.json({ success: false, error: error.message }, 500); }
});

// v6.0.5: 取消单个视频任务
app.post(`${PREFIX}/volcengine/cancel/:taskId`, async (c) => {
  try {
    const taskId = c.req.param('taskId');
    const { error } = await supabase
      .from('video_tasks')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('task_id', taskId)
      .in('status', ['pending', 'processing', 'submitted']);
    if (error) return c.json({ success: false, error: error.message }, 500);
    console.log(`[Volcengine] ✅ Task ${taskId} cancelled`);
    return c.json({ success: true });
  } catch (error: any) {
    console.error('[POST /volcengine/cancel/:taskId] Error:', error?.message);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// v6.0.6: 批量取消指定系列的所有视频任务（从前端显式调用，补充 DELETE /series/:id 的级联取消）
app.post(`${PREFIX}/volcengine/cancel-series-tasks/:seriesId`, async (c) => {
  try {
    const seriesId = c.req.param('seriesId');
    console.log(`[Volcengine] 🚫 Cancelling all active tasks for series ${seriesId}...`);
    const { data: cancelledTasks, error } = await supabase
      .from('video_tasks')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .contains('generation_metadata', { seriesId })
      .in('status', ['pending', 'processing', 'submitted'])
      .select('task_id');
    if (error) {
      console.warn(`[Volcengine] cancel-series-tasks error: ${error.message}`);
      return c.json({ success: false, error: error.message }, 500);
    }
    console.log(`[Volcengine] ✅ Cancelled ${cancelledTasks?.length || 0} tasks for series ${seriesId}`);
    return c.json({ success: true, cancelledCount: cancelledTasks?.length || 0 });
  } catch (error: any) {
    console.error('[POST /volcengine/cancel-series-tasks/:seriesId] Error:', error?.message);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 重试视频任务
app.post(`${PREFIX}/volcengine/retry/:taskId`, async (c) => {
  try {
    const taskId = c.req.param('taskId');
    const { data: task } = await supabase.from('video_tasks').select('task_id, style, series_id, prompt, generation_metadata').eq('task_id', taskId).maybeSingle();
    if (!task) return c.json({ success: false, error: '任务不存在' }, 404);
    if (!VOLCENGINE_API_KEY) return c.json({ success: false, error: 'VOLCENGINE_API_KEY未配置' }, 500);
    // v6.0.16: 重试也强制从DB读取系列风格
    let retryStyle = task.style;
    if (task.series_id) {
      const { data: retrySeries } = await supabase.from('series').select('style').eq('id', task.series_id).maybeSingle();
      if (retrySeries?.style) retryStyle = retrySeries.style;
    }
    const sp = STYLE_PROMPTS[retryStyle] || STYLE_PROMPTS.comic;
    const styleLockR = `【强制画风：${sp}。全片必须严格统一此风格，禁止混入其他画风】`;
    const content: any[] = [{ type: 'text', text: `${styleLockR}\n${task.prompt}` }];
    const meta = task.generation_metadata || {};
    const rb: any = { model: meta.model || 'doubao-seedance-1-5-pro-251215', content, return_last_frame: true };
    if (meta.enableAudio) rb.enable_audio = true;
    const resp = await fetchWithTimeout(VOLCENGINE_BASE_URL, { method: 'POST', headers: { 'Authorization': `Bearer ${VOLCENGINE_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(rb) }, 180000);
    if (!resp.ok) { const ed = await resp.json().catch(() => ({})); return c.json({ success: false, error: ed.error?.message || 'Retry failed' }, 500); }
    const result = await resp.json();
    const newVolcId = result.id || result.task_id || '';
    if (newVolcId) await supabase.from('video_tasks').update({ status: 'processing', volcengine_task_id: newVolcId, video_url: null, thumbnail: null, updated_at: new Date().toISOString() }).eq('task_id', taskId);
    return c.json({ success: true, data: { taskId, volcTaskId: newVolcId, status: 'processing' } });
  } catch (error: any) {
    console.error('[Volcengine] Retry error:', truncateErrorMsg(error));
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ==================== 社区互动补全路由 ====================

app.get(`${PREFIX}/community/works/:workId/comments`, async (c) => {
  try {
    const workId = c.req.param('workId');
    const page = Math.max(parseInt(c.req.query('page') || '1') || 1, 1);
    const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '20') || 20, 1), 100);
    const offset = (page - 1) * limit;
    const { data: comments, error } = await supabase.from('comments').select('id, work_id, user_phone, content, created_at').eq('work_id', workId).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    if (error) return c.json({ success: false, error: error.message }, 500);
    const phones = [...new Set((comments || []).map((cm: any) => cm.user_phone))];
    let usersMap = new Map();
    if (phones.length > 0) {
      const { data: users } = await supabase.from('users').select('phone, nickname, avatar_url').in('phone', phones);
      usersMap = new Map((users || []).map((u: any) => [u.phone, u]));
    }
    const enriched = (comments || []).map((cm: any) => { const u = usersMap.get(cm.user_phone); return { ...toCamelCase(cm), username: u?.nickname || '匿名用户', userAvatar: u?.avatar_url || '' }; });
    return c.json({ success: true, data: enriched, comments: enriched });
  } catch (error: any) { console.error('[GET /community/works/:workId/comments] Error:', error); return c.json({ success: false, error: error.message }, 500); }
});

app.post(`${PREFIX}/community/works/:workId/comments`, async (c) => {
  try {
    const workId = c.req.param('workId');
    const { userPhone, content } = await c.req.json();
    if (!userPhone || !content) return c.json({ success: false, error: 'userPhone and content required' }, 400);
    if (content.length > 2000) return c.json({ success: false, error: '评论内容不能超过2000字' }, 400);
    const { data, error } = await supabase.from('comments').insert({ work_id: workId, user_phone: userPhone, content: content.trim() }).select().single();
    if (error) return c.json({ success: false, error: error.message }, 500);
    return c.json({ success: true, data: toCamelCase(data) });
  } catch (error: any) { console.error('[POST /community/works/:workId/comments] Error:', error); return c.json({ success: false, error: error.message }, 500); }
});

app.post(`${PREFIX}/community/works/:workId/like`, async (c) => {
  try {
    const workId = c.req.param('workId');
    const { userPhone } = await c.req.json();
    if (!userPhone) return c.json({ success: false, error: 'userPhone required' }, 400);
    const { data: ex } = await supabase.from('likes').select('id').eq('work_id', workId).eq('user_phone', userPhone).maybeSingle();
    if (ex) {
      await supabase.from('likes').delete().eq('id', ex.id);
      const { count } = await supabase.from('likes').select('id', { count: 'exact', head: true }).eq('work_id', workId);
      return c.json({ success: true, isLiked: false, likes: count || 0 });
    } else {
      const { error: insertErr } = await supabase.from('likes').insert({ work_id: workId, user_phone: userPhone });
      if (insertErr) {
        if (insertErr.code === '23505') {
          console.warn(`[POST /community/works/:workId/like] Race condition, treating as unlike: ${workId}/${userPhone}`);
          await supabase.from('likes').delete().eq('work_id', workId).eq('user_phone', userPhone);
          const { count: raceCount } = await supabase.from('likes').select('id', { count: 'exact', head: true }).eq('work_id', workId);
          return c.json({ success: true, isLiked: false, likes: raceCount || 0 });
        }
        return c.json({ success: false, error: insertErr.message }, 500);
      }
      const { count } = await supabase.from('likes').select('id', { count: 'exact', head: true }).eq('work_id', workId);
      return c.json({ success: true, isLiked: true, likes: count || 0 });
    }
  } catch (error: any) { console.error('[POST /community/works/:workId/like] Error:', error); return c.json({ success: false, error: error.message }, 500); }
});

app.get(`${PREFIX}/community/works/:workId/like-status`, async (c) => {
  try {
    const workId = c.req.param('workId');
    const userPhone = c.req.query('userPhone');
    if (!userPhone) return c.json({ success: false, error: 'userPhone required' }, 400);
    // v6.0.23: 并行化两个独立查询
    const [{ data: ex }, { count }] = await Promise.all([
      supabase.from('likes').select('id').eq('work_id', workId).eq('user_phone', userPhone).maybeSingle(),
      supabase.from('likes').select('id', { count: 'exact', head: true }).eq('work_id', workId),
    ]);
    return c.json({ success: true, isLiked: !!ex, likes: count || 0 });
  } catch (error: any) { console.error('[GET /community/works/:workId/like-status] Error:', error); return c.json({ success: false, error: error.message }, 500); }
});

// TODO: increment-view 和 share ��前是空操作 stub。
// video_tasks 表没有 views_count / shares_count 列，需要 DDL 迁移后才能实现真实计数。
// 前端以 fire-and-forget 方式调用，不依赖返回数据，因此 stub 不影响功能。
app.post(`${PREFIX}/community/works/:workId/increment-view`, async (c) => {
  try {
    return c.json({ success: true });
  } catch (error: any) {
    console.warn('[Community] increment-view stub error:', error?.message);
    return c.json({ success: true });
  }
});

app.post(`${PREFIX}/community/works/:workId/share`, async (c) => {
  try {
    return c.json({ success: true });
  } catch (error: any) {
    console.warn('[Community] share stub error:', error?.message);
    return c.json({ success: true });
  }
});

app.post(`${PREFIX}/community/publish`, async (c) => {
  try {
    const { phone, taskId, prompt, thumbnail, videoUrl } = await c.req.json();
    if (!phone || !taskId) return c.json({ success: false, error: 'phone and taskId required' }, 400);
    const upd: any = { status: 'completed', updated_at: new Date().toISOString() };
    if (videoUrl) upd.video_url = videoUrl;
    if (thumbnail) upd.thumbnail = thumbnail;
    if (prompt) upd.prompt = prompt;
    await supabase.from('video_tasks').update(upd).eq('task_id', taskId);
    return c.json({ success: true });
  } catch (error: any) { console.error('[POST /community/publish] Error:', error); return c.json({ success: false, error: error.message }, 500); }
});

// v6.0.14: 增强版 refresh-video — 检测过期URL → 重新查询火山引擎 → 转存OSS
app.post(`${PREFIX}/community/works/:workId/refresh-video`, async (c) => {
  try {
    const workId = c.req.param('workId');
    // v6.0.23: 三重查找合并为单次 .or() 查询
    let task: any = null;
    {
      let orFilter = `task_id.eq.${workId},volcengine_task_id.eq.${workId}`;
      if (workId.startsWith('vtask-')) orFilter += `,id.eq.${workId}`;
      const { data: taskResults } = await supabase.from('video_tasks')
        .select('task_id, video_url, thumbnail, volcengine_task_id, generation_metadata')
        .or(orFilter);
      if (taskResults && taskResults.length > 0) {
        task = taskResults.find((t: any) => t.task_id === workId)
          || taskResults.find((t: any) => t.volcengine_task_id === workId)
          || taskResults[0];
      }
    }
    if (!task) return c.json({ success: false, error: 'Work not found' }, 404);

    const currentUrl = task.video_url || '';
    const isOssUrl = currentUrl.includes('aliyuncs.com') || currentUrl.includes('oss-');

    // 如果已转存到OSS，直接返回（OSS URL不会过期）
    if (isOssUrl && currentUrl) {
      console.log(`[RefreshVideo] ${workId} — already on OSS`);
      return c.json({ success: true, data: { videoUrl: currentUrl, thumbnailUrl: task.thumbnail || '' } });
    }

    // 火山引擎URL（可能已过期），尝试重新查询获取新URL
    const volcId = task.volcengine_task_id;
    if (!volcId || !VOLCENGINE_API_KEY) {
      console.warn(`[RefreshVideo] ${workId} — no volcengine_task_id or API key`);
      return c.json({ success: true, data: { videoUrl: currentUrl, thumbnailUrl: task.thumbnail || '' }, warning: 'Cannot refresh: missing volcengine info' });
    }

    console.log(`[RefreshVideo] ${workId} — querying Volcengine (volcId: ${volcId})`);
    let freshVideoUrl = '', freshThumbnailUrl = '';
    try {
      const apiResp = await fetchWithTimeout(`${VOLCENGINE_BASE_URL}/${volcId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${VOLCENGINE_API_KEY}`, 'Content-Type': 'application/json' },
      }, 20000);
      if (apiResp.ok) {
        const apiData = await apiResp.json();
        if (['succeeded', 'completed', 'success'].includes(apiData.status || '')) {
          freshVideoUrl = apiData.content?.video_url || apiData.video_url || '';
          freshThumbnailUrl = apiData.content?.cover_url || apiData.thumbnail || '';
        }
      }
    } catch (volcErr: any) {
      console.warn(`[RefreshVideo] Volcengine query failed: ${volcErr.message}`);
    }

    if (!freshVideoUrl) {
      console.warn(`[RefreshVideo] ${workId} — Volcengine returned no URL, may be permanently expired`);
      return c.json({ success: false, error: '视频已从火山引擎过期删除，需要重新生成' });
    }

    // 更新DB
    const upd: any = { video_url: freshVideoUrl, updated_at: new Date().toISOString() };
    if (freshThumbnailUrl) upd.thumbnail = freshThumbnailUrl;
    await supabase.from('video_tasks').update(upd).eq('task_id', task.task_id);
    console.log(`[RefreshVideo] ✅ ${workId} — refreshed URL from Volcengine`);

    // 转存到OSS（fire-and-forget）
    if (isOSSConfigured() && !freshVideoUrl.includes('.aliyuncs.com')) {
      (async () => {
        try {
          const result = await transferFileToOSS(freshVideoUrl, `videos/${task.task_id}.mp4`, 'video/mp4');
          if (result.transferred) {
            const ossUpd: any = { video_url: result.url };
            if (freshThumbnailUrl) {
              try {
                const thumbResult = await transferFileToOSS(freshThumbnailUrl, `thumbnails/${task.task_id}.jpg`, 'image/jpeg');
                if (thumbResult.transferred) ossUpd.thumbnail = thumbResult.url;
              } catch (e: any) { console.warn('[RefreshVideo] Thumbnail OSS failed:', e.message); }
            }
            await supabase.from('video_tasks').update(ossUpd).eq('task_id', task.task_id);
            if (task.generation_metadata?.seriesId && task.generation_metadata?.episodeNumber) {
              const sbUpd: any = { video_url: result.url };
              await supabase.from('series_storyboards').update(sbUpd)
                .eq('series_id', task.generation_metadata.seriesId)
                .eq('episode_number', task.generation_metadata.episodeNumber)
                .eq('scene_number', task.generation_metadata.storyboardNumber || task.generation_metadata.sceneNumber);
            }
            console.log(`[RefreshVideo/OSS] ✅ ${task.task_id} transferred`);
          }
        } catch (ossErr: any) {
          console.warn(`[RefreshVideo/OSS] Failed: ${ossErr.message}`);
        }
      })().catch(() => {});
    }

    return c.json({ success: true, data: { videoUrl: freshVideoUrl, thumbnailUrl: freshThumbnailUrl || task.thumbnail || '' } });
  } catch (error: any) { console.error('[POST /community/works/:workId/refresh-video] Error:', error); return c.json({ success: false, error: error.message }, 500); }
});

app.post(`${PREFIX}/community/tasks/cleanup-failed`, async (c) => {
  try {
    await supabase.from('video_tasks').delete().eq('status', 'failed').lt('created_at', new Date(Date.now() - 7 * 86400000).toISOString());
    return c.json({ success: true, data: { cleaned: true } });
  } catch (error: any) { console.error('[POST /community/tasks/cleanup-failed] Error:', error); return c.json({ success: false, error: error.message }, 500); }
});

app.post(`${PREFIX}/community/tasks/batch-status`, async (c) => {
  try {
    const { taskIds } = await c.req.json();
    if (!taskIds || !Array.isArray(taskIds)) return c.json({ success: false, error: 'taskIds required' }, 400);
    const { data, error } = await supabase.from('video_tasks').select('task_id, status, video_url, thumbnail').in('task_id', taskIds);
    if (error) return c.json({ success: false, error: error.message }, 500);
    return c.json({ success: true, data: toCamelCase(data || []) });
  } catch (error: any) { console.error('[POST /community/tasks/batch-status] Error:', error); return c.json({ success: false, error: error.message }, 500); }
});

// ------------------------------------------------------------------
//  [J] OSS & 同步 — 视频转存OSS / 批量同步状态 / 综合恢复
// ------------------------------------------------------------------

// ==================== 视频转存到阿里云 OSS ====================

app.post(`${PREFIX}/video/transfer`, async (c) => {
  try {
    const { taskId, volcengineUrl } = await c.req.json();
    if (!taskId || !volcengineUrl) return c.json({ success: false, error: 'taskId and volcengineUrl required' }, 400);

    if (!isOSSConfigured()) {
      return c.json({ success: false, error: '阿里云 OSS 未配置，请设置 ALIYUN_OSS_ACCESS_KEY_ID / SECRET / BUCKET / REGION 环境变量' }, 500);
    }

    console.log(`[Transfer] Starting OSS transfer for task ${taskId}`);
    const result = await transferFileToOSS(volcengineUrl, `videos/${taskId}.mp4`, 'video/mp4');

    if (result.transferred) {
      // 更新 video_tasks 表中的 video_url 为 OSS URL
      await supabase.from('video_tasks').update({ video_url: result.url, updated_at: new Date().toISOString() }).eq('task_id', taskId);

      // 同步到 series_storyboards（如果有 metadata）
      const { data: dbTask } = await supabase.from('video_tasks').select('generation_metadata').eq('task_id', taskId).maybeSingle();
      if (dbTask?.generation_metadata?.type === 'storyboard_video') {
        const meta = dbTask.generation_metadata;
        if (meta.seriesId && meta.episodeNumber && (meta.storyboardNumber || meta.sceneNumber)) {
          await supabase.from('series_storyboards')
            .update({ video_url: result.url, updated_at: new Date().toISOString() })
            .eq('series_id', meta.seriesId)
            .eq('episode_number', meta.episodeNumber)
            .eq('scene_number', meta.storyboardNumber || meta.sceneNumber);
        }
      }

      console.log(`[Transfer] ✅ OSS transfer complete: ${result.url}`);
      return c.json({ success: true, data: { ossUrl: result.url, originalUrl: volcengineUrl } });
    } else {
      return c.json({ success: false, error: 'OSS transfer failed, video_url unchanged' }, 500);
    }
  } catch (error: any) {
    console.error('[Transfer] Error:', truncateErrorMsg(error));
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ==================== 批量同步火山引擎任务状态 + 转存 OSS ====================

// v5.5.1: 带 deadline 防超时 + 并行批处理
app.post(`${PREFIX}/volcengine/sync-pending-tasks`, async (c) => {
  const DEADLINE_MS = 50000;
  const BATCH_SIZE = 3;
  const PER_TASK_TIMEOUT = 15000;
  const startTime = Date.now();
  const isDeadlineNear = () => (Date.now() - startTime) > DEADLINE_MS;

  try {
    console.log('[Sync] v5.5.1: Starting comprehensive sync with deadline...');

    // v6.0.24: 精简字段——sync只需task_id/volcengine_task_id/generation_metadata，排除prompt等大字段
    const SYNC_TASK_FIELDS = 'task_id, volcengine_task_id, status, video_url, thumbnail, generation_metadata, series_id, created_at';
    const [{ data: pendingTasks, error: qErr }, { data: completedNoUrl }, { data: completedVolcUrl }] = await Promise.all([
      supabase.from('video_tasks').select(SYNC_TASK_FIELDS).in('status', ['pending', 'processing', 'running']).not('volcengine_task_id', 'is', null).order('created_at', { ascending: false }).limit(20),
      supabase.from('video_tasks').select(SYNC_TASK_FIELDS).eq('status', 'completed').not('volcengine_task_id', 'is', null).is('video_url', null).order('created_at', { ascending: false }).limit(10),
      supabase.from('video_tasks').select(SYNC_TASK_FIELDS).eq('status', 'completed').not('volcengine_task_id', 'is', null).not('video_url', 'is', null).like('video_url', '%volces.com%').order('created_at', { ascending: false }).limit(10),
    ]);

    if (qErr) return c.json({ success: false, error: qErr.message }, 500);

    const taskMap = new Map<string, any>();
    for (const t of (pendingTasks || [])) taskMap.set(t.task_id, t);
    for (const t of (completedNoUrl || [])) taskMap.set(t.task_id, t);
    for (const t of (completedVolcUrl || [])) taskMap.set(t.task_id, t);
    const allTasks = Array.from(taskMap.values());

    if (allTasks.length === 0) {
      return c.json({ success: true, message: '没有待同步的任务', synced: 0, failed: 0, stillRunning: 0, total: 0 });
    }

    console.log(`[Sync] Found ${allTasks.length} tasks (pending=${pendingTasks?.length || 0}, noUrl=${completedNoUrl?.length || 0}, volcUrl=${completedVolcUrl?.length || 0})`);

    let synced = 0, failed = 0, stillRunning = 0, skipped = 0;

    async function syncOneTask(task: any): Promise<void> {
      const volcId = task.volcengine_task_id;
      try {
        const resp = await fetchWithTimeout(`${VOLCENGINE_BASE_URL}/${volcId}`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${VOLCENGINE_API_KEY}`, 'Content-Type': 'application/json' },
        }, PER_TASK_TIMEOUT);

        if (!resp.ok) {
          if (resp.status === 404) {
            await supabase.from('video_tasks').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('task_id', task.task_id);
            failed++;
          }
          return;
        }

        const apiData = await resp.json();
        const volcStatus = apiData.status || 'unknown';

        if (['succeeded', 'completed', 'success'].includes(volcStatus)) {
          let videoUrl = apiData.content?.video_url || apiData.video_url || '';
          let thumbnailUrl = apiData.content?.cover_url || apiData.thumbnail || '';

          if (videoUrl && !isDeadlineNear()) {
            try { const vr = await transferFileToOSS(videoUrl, `videos/${task.task_id}.mp4`, 'video/mp4'); videoUrl = vr.url; } catch (e: any) { console.warn(`[Sync] Video OSS transfer failed for ${task.task_id}:`, e.message); }
          }
          if (thumbnailUrl && !isDeadlineNear()) {
            try { const tr = await transferFileToOSS(thumbnailUrl, `thumbnails/${task.task_id}.jpg`, 'image/jpeg'); thumbnailUrl = tr.url; } catch (e: any) { console.warn(`[Sync] Thumbnail OSS transfer failed for ${task.task_id}:`, e.message); }
          }

          const upd: any = { status: 'completed', updated_at: new Date().toISOString() };
          if (videoUrl) upd.video_url = videoUrl;
          if (thumbnailUrl) upd.thumbnail = thumbnailUrl;
          await supabase.from('video_tasks').update(upd).eq('task_id', task.task_id);

          if (videoUrl && task.generation_metadata?.type === 'storyboard_video') {
            const meta = task.generation_metadata;
            const sn = meta.storyboardNumber || meta.sceneNumber;
            if (meta.seriesId && meta.episodeNumber && sn) {
              const sbUpd: any = { video_url: videoUrl, status: 'completed', updated_at: new Date().toISOString() };
              await supabase.from('series_storyboards').update(sbUpd)
                .eq('series_id', meta.seriesId).eq('episode_number', meta.episodeNumber).eq('scene_number', sn);
            }
          }
          synced++;
          console.log(`[Sync] ✅ ${task.task_id} -> completed`);
        } else if (['failed', 'error'].includes(volcStatus)) {
          await supabase.from('video_tasks').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('task_id', task.task_id);
          failed++;
        } else {
          stillRunning++;
        }
      } catch (err: any) {
        console.warn(`[Sync] Error checking task ${task.task_id}: ${err.message}`);
        failed++;
      }
    }

    for (let i = 0; i < allTasks.length; i += BATCH_SIZE) {
      if (isDeadlineNear()) {
        skipped = allTasks.length - i;
        console.warn(`[Sync] ⏱ Deadline approaching (${Date.now() - startTime}ms), skipping remaining ${skipped} tasks`);
        break;
      }
      const batch = allTasks.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(syncOneTask));
    }

    const elapsed = Date.now() - startTime;
    const message = `同步完成(${elapsed}ms)：${synced} 个已完成，${failed} 个失败，${stillRunning} 个仍在处理${skipped > 0 ? `，${skipped} 个���超时跳过` : ''}`;
    console.log(`[Sync] ✅ ${message}`);
    return c.json({ success: true, total: allTasks.length, synced, failed, stillRunning, skipped, message });
  } catch (error: any) {
    console.error('[Sync] Batch sync error:', truncateErrorMsg(error));
    return c.json({ success: false, error: error.message }, 500);
  }
});

// v5.5.1: 综合恢复所有视频任务 — 带 deadline 防超时 + 并行批处理
app.post(`${PREFIX}/volcengine/recover-all-tasks`, async (c) => {
  const DEADLINE_MS = 50000; // 50秒 deadline，确保在 Edge Function 超时前返回
  const BATCH_SIZE = 3; // 并行处理批次大小
  const PER_TASK_TIMEOUT = 15000; // 每个火山引擎 API 调用 15秒超时
  const startTime = Date.now();

  const isDeadlineNear = () => (Date.now() - startTime) > DEADLINE_MS;

  try {
    const body = await c.req.json().catch(() => ({}));
    const seriesId = body.seriesId || '';
    console.log(`[Recover] Starting full recovery${seriesId ? ` for series ${seriesId}` : ' (global)'}...`);

    // 1. 查出所有需要恢复���任务（v6.0.24: 精简字段）
    const RECOVER_FIELDS = 'task_id, volcengine_task_id, status, video_url, thumbnail, generation_metadata, series_id, created_at';
    let pendingQuery = supabase.from('video_tasks')
      .select(RECOVER_FIELDS)
      .in('status', ['pending', 'processing', 'running'])
      .not('volcengine_task_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20);

    let completedNoUrlQuery = supabase.from('video_tasks')
      .select(RECOVER_FIELDS)
      .eq('status', 'completed')
      .not('volcengine_task_id', 'is', null)
      .is('video_url', null)
      .order('created_at', { ascending: false })
      .limit(10);

    let volcUrlQuery = supabase.from('video_tasks')
      .select(RECOVER_FIELDS)
      .eq('status', 'completed')
      .not('volcengine_task_id', 'is', null)
      .not('video_url', 'is', null)
      .like('video_url', '%volces.com%')
      .order('created_at', { ascending: false })
      .limit(10);

    // 如果指定了 seriesId，通过 generation_metadata JSONB 过滤
    if (seriesId) {
      pendingQuery = pendingQuery.contains('generation_metadata', { seriesId });
      completedNoUrlQuery = completedNoUrlQuery.contains('generation_metadata', { seriesId });
      volcUrlQuery = volcUrlQuery.contains('generation_metadata', { seriesId });
    }

    const [{ data: p1 }, { data: p2 }, { data: p3 }] = await Promise.all([
      pendingQuery, completedNoUrlQuery, volcUrlQuery
    ]);

    const taskMap = new Map<string, any>();
    for (const t of (p1 || [])) taskMap.set(t.task_id, t);
    for (const t of (p2 || [])) taskMap.set(t.task_id, t);
    for (const t of (p3 || [])) taskMap.set(t.task_id, t);
    const allRecoverTasks = Array.from(taskMap.values());

    if (allRecoverTasks.length === 0) {
      return c.json({ success: true, total: 0, recovered: 0, failed: 0, alreadyOK: 0, ossTransferred: 0, message: '所有任务状态正常' });
    }

    console.log(`[Recover] Found ${allRecoverTasks.length} tasks (${p1?.length || 0} pending, ${p2?.length || 0} no-url, ${p3?.length || 0} volc-url)`);

    let recovered = 0, failed = 0, alreadyOK = 0, ossTransferred = 0, skipped = 0;

    // 单个任务恢复逻辑
    async function recoverOneTask(task: any): Promise<void> {
      const volcId = task.volcengine_task_id;
      try {
        const resp = await fetchWithTimeout(`${VOLCENGINE_BASE_URL}/${volcId}`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${VOLCENGINE_API_KEY}`, 'Content-Type': 'application/json' },
        }, PER_TASK_TIMEOUT);

        if (!resp.ok) {
          if (resp.status === 404) {
            await supabase.from('video_tasks').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('task_id', task.task_id);
            failed++;
          }
          return;
        }

        const apiData = await resp.json();
        const volcStatus = apiData.status || 'unknown';

        if (['succeeded', 'completed', 'success'].includes(volcStatus)) {
          let videoUrl = apiData.content?.video_url || apiData.video_url || '';
          let thumbnailUrl = apiData.content?.cover_url || apiData.thumbnail || '';

          // 转存到 OSS（仅在 deadline 未近时尝试）
          if (videoUrl && !isDeadlineNear()) {
            try {
              const vr = await transferFileToOSS(videoUrl, `videos/${task.task_id}.mp4`, 'video/mp4');
              videoUrl = vr.url;
              ossTransferred++;
            } catch (e: any) { console.warn(`[Recover] Video OSS transfer failed for ${task.task_id}:`, e.message); }
          }
          if (thumbnailUrl && !isDeadlineNear()) {
            try {
              const tr = await transferFileToOSS(thumbnailUrl, `thumbnails/${task.task_id}.jpg`, 'image/jpeg');
              thumbnailUrl = tr.url;
            } catch (e: any) { console.warn(`[Recover] Thumbnail OSS transfer failed for ${task.task_id}:`, e.message); }
          }

          const upd: any = { status: 'completed', updated_at: new Date().toISOString() };
          if (videoUrl) upd.video_url = videoUrl;
          if (thumbnailUrl) upd.thumbnail = thumbnailUrl;
          await supabase.from('video_tasks').update(upd).eq('task_id', task.task_id);

          // 同步到 series_storyboards
          if (videoUrl && task.generation_metadata?.type === 'storyboard_video') {
            const meta = task.generation_metadata;
            const sn = meta.storyboardNumber || meta.sceneNumber;
            if (meta.seriesId && meta.episodeNumber && sn) {
              const sbUpd: any = { video_url: videoUrl, status: 'completed', updated_at: new Date().toISOString() };
              await supabase.from('series_storyboards').update(sbUpd)
                .eq('series_id', meta.seriesId).eq('episode_number', meta.episodeNumber).eq('scene_number', sn);
            }
          }

          recovered++;
          console.log(`[Recover] ✅ ${task.task_id} -> recovered (${Date.now() - startTime}ms elapsed)`);
        } else if (['failed', 'error'].includes(volcStatus)) {
          await supabase.from('video_tasks').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('task_id', task.task_id);
          failed++;
        } else {
          alreadyOK++;
        }
      } catch (err: any) {
        console.warn(`[Recover] Error recovering task ${task.task_id}: ${err.message}`);
        failed++;
      }
    }

    // 分批并行处理，遇到 deadline 提前结束
    for (let i = 0; i < allRecoverTasks.length; i += BATCH_SIZE) {
      if (isDeadlineNear()) {
        skipped = allRecoverTasks.length - i;
        console.warn(`[Recover] ⏱ Deadline approaching (${Date.now() - startTime}ms), skipping remaining ${skipped} tasks`);
        break;
      }
      const batch = allRecoverTasks.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(recoverOneTask));
    }

    const elapsed = Date.now() - startTime;
    const message = `全量恢复完成(${elapsed}ms)：${recovered} 个已恢复，${ossTransferred} 个已转存OSS，${failed} 个失败，${alreadyOK} 个仍在处理${skipped > 0 ? `，${skipped} 个因超时跳过` : ''}`;
    console.log(`[Recover] ✅ ${message}`);
    return c.json({ success: true, total: allRecoverTasks.length, recovered, failed, alreadyOK, ossTransferred, skipped, message });
  } catch (error: any) {
    console.error('[Recover] Full recovery error:', truncateErrorMsg(error));
    return c.json({ success: false, error: error.message, total: 0, recovered: 0, failed: 0, alreadyOK: 0, ossTransferred: 0, message: error.message }, 500);
  }
});

// v6.0.131: 将已完成但未转存 OSS 的视频批量转存（增强版）
// 改进: HEAD检查跳过已过期TOS URL + 可选seriesId过滤 + limit提升50
app.post(`${PREFIX}/volcengine/transfer-completed-to-oss`, async (c) => {
  try {
    if (!isOSSConfigured()) {
      return c.json({ success: false, error: '阿里云 OSS 未配置' }, 500);
    }

    const body = await c.req.json().catch(() => ({}));
    const filterSeriesId = body.seriesId || '';

    const DEADLINE_MS = 50000;
    const startTime = Date.now();
    const isDeadlineNear = () => (Date.now() - startTime) > DEADLINE_MS;

    console.log(`[OSS-Batch] v6.0.131: Starting batch OSS transfer${filterSeriesId ? ` for series ${filterSeriesId}` : ''} with deadline...`);

    let query = supabase.from('video_tasks')
      .select('task_id, video_url, thumbnail, generation_metadata')
      .eq('status', 'completed')
      .not('video_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50);

    // v6.0.131: 可选按seriesId过滤（配合前端按需触发）
    if (filterSeriesId) {
      query = query.filter('generation_metadata->>seriesId', 'eq', filterSeriesId);
    }

    const { data: tasks, error: qErr } = await query;

    if (qErr) return c.json({ success: false, error: qErr.message }, 500);

    const needTransfer = (tasks || []).filter((t: any) => t.video_url && !t.video_url.includes('.aliyuncs.com'));
    if (needTransfer.length === 0) {
      return c.json({ success: true, message: '所有已完成任务的视频均已在 OSS 上', transferred: 0, total: 0, errors: 0 });
    }

    console.log(`[OSS-Batch] Found ${needTransfer.length} tasks needing OSS transfer`);
    let transferred = 0, errors = 0, skipped = 0;

    let headSkipped = 0;
    for (const task of needTransfer) {
      if (isDeadlineNear()) {
        skipped = needTransfer.length - transferred - errors - headSkipped;
        console.warn(`[OSS-Batch] ⏱ Deadline, skipping remaining ${skipped}`);
        break;
      }
      try {
        // v6.0.131: HEAD检查跳过已过期TOS URL（避免浪费120s timeout下载必定403的URL）
        if (task.video_url.includes('volces.com') || task.video_url.includes('tos-cn')) {
          try {
            const headResp = await fetch(task.video_url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
            if (headResp.status === 403) {
              console.warn(`[OSS-Batch] ⏭ ${task.task_id}: TOS URL expired (HEAD 403), skipping`);
              headSkipped++;
              continue;
            }
          } catch { /* HEAD failed (timeout/network) — try transfer anyway */ }
        }
        const vr = await transferFileToOSS(task.video_url, `videos/${task.task_id}.mp4`, 'video/mp4');
        if (vr.transferred) {
          const upd: any = { video_url: vr.url, updated_at: new Date().toISOString() };
          await supabase.from('video_tasks').update(upd).eq('task_id', task.task_id);

          if (task.generation_metadata?.type === 'storyboard_video') {
            const meta = task.generation_metadata;
            const sn = meta.storyboardNumber || meta.sceneNumber;
            if (meta.seriesId && meta.episodeNumber && sn) {
              await supabase.from('series_storyboards').update({ video_url: vr.url, updated_at: new Date().toISOString() })
                .eq('series_id', meta.seriesId).eq('episode_number', meta.episodeNumber).eq('scene_number', sn);
            }
          }

          if (task.thumbnail && !task.thumbnail.includes('.aliyuncs.com') && !isDeadlineNear()) {
            try {
              const tr = await transferFileToOSS(task.thumbnail, `thumbnails/${task.task_id}.jpg`, 'image/jpeg');
              if (tr.transferred) {
                await supabase.from('video_tasks').update({ thumbnail: tr.url }).eq('task_id', task.task_id);
              }
            } catch (e: any) { console.warn(`[OSS-Batch] Thumbnail transfer failed for ${task.task_id}:`, e.message); }
          }

          transferred++;
          console.log(`[OSS-Batch] ✅ ${task.task_id} transferred`);
        }
      } catch (err: any) {
        errors++;
        console.warn(`[OSS-Batch] ❌ ${task.task_id} failed: ${err.message}`);
      }
    }

    const elapsed = Date.now() - startTime;
    return c.json({
      success: true,
      total: needTransfer.length,
      transferred,
      errors,
      skipped,
      headSkipped,
      message: `批量转存完成(${elapsed}ms)：${transferred} 成功，${errors} 失败，${headSkipped} URL已过期跳过${skipped > 0 ? `，${skipped} 因��时跳过` : ''}`,
    });
  } catch (error: any) {
    console.error('[OSS-Batch] Error:', truncateErrorMsg(error));
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ==================== 漫剧缩略图同步 ====================

// 🔥 v5.2.0: 批量同步缩略图 — 从已完成的 video_tasks 回写到 series_episodes
app.post(`${PREFIX}/series/:id/sync-thumbnails`, async (c) => {
  try {
    const seriesId = c.req.param('id');
    console.log(`[Thumbnails] Syncing thumbnails for series ${seriesId}`);

    // 1. 查找该系列所有已完成的视频任务（有 thumbnail 且 metadata 标明 storyboard_video）
    const { data: tasks, error: taskErr } = await supabase.from('video_tasks')
      .select('task_id, video_url, thumbnail, generation_metadata')
      .eq('status', 'completed')
      .not('thumbnail', 'is', null)
      .filter('generation_metadata->>seriesId', 'eq', seriesId)
      .filter('generation_metadata->>type', 'eq', 'storyboard_video');

    if (taskErr) {
      console.error('[Thumbnails] Query tasks error:', taskErr.message);
      return c.json({ success: false, error: taskErr.message }, 500);
    }

    if (!tasks || tasks.length === 0) {
      return c.json({ success: true, synced: 0, message: 'No completed video tasks with thumbnails found' });
    }

    // 2. 按 episodeNumber 分组，取每组第一个缩略图；并���更新 storyboards
    const episodeThumbnails = new Map<number, string>();
    let storyboardsSynced = 0;
    const now = new Date().toISOString();

    // 收集需要更新的分镜，然后用 Promise.all 并行化（消除 N+1）
    const sbUpdatePromises: Promise<void>[] = [];
    for (const task of tasks) {
      const meta = task.generation_metadata;
      if (!meta?.episodeNumber || !meta?.sceneNumber) continue;

      if (task.video_url) {
        sbUpdatePromises.push(
          supabase.from('series_storyboards')
            .update({ video_url: task.video_url, status: 'completed', updated_at: now })
            .eq('series_id', seriesId)
            .eq('episode_number', meta.episodeNumber)
            .eq('scene_number', meta.sceneNumber)
            .then(({ error: sbErr }) => { if (!sbErr) storyboardsSynced++; })
        );
      }

      // 收集第一个缩略图
      if (task.thumbnail && !episodeThumbnails.has(meta.episodeNumber)) {
        episodeThumbnails.set(meta.episodeNumber, task.thumbnail);
      }
    }
    await Promise.all(sbUpdatePromises);

    // 3. 批量更新 episodes 缩略图（仅当当前为空时）
    // 一次性查出该系列所有 episodes，在内存过滤后并行 UPDATE（消除 N+1）
    let episodesSynced = 0;
    if (episodeThumbnails.size > 0) {
      const epNumbers = Array.from(episodeThumbnails.keys());
      const { data: allEps } = await supabase.from('series_episodes')
        .select('id, episode_number, thumbnail_url')
        .eq('series_id', seriesId)
        .in('episode_number', epNumbers);

      const epUpdatePromises: Promise<void>[] = [];
      for (const ep of (allEps || [])) {
        if (!ep.thumbnail_url && episodeThumbnails.has(ep.episode_number)) {
          const thumb = episodeThumbnails.get(ep.episode_number)!;
          epUpdatePromises.push(
            supabase.from('series_episodes')
              .update({ thumbnail_url: thumb, updated_at: now })
              .eq('id', ep.id)
              .then(({ error: epErr }) => { if (!epErr) episodesSynced++; })
          );
        }
      }
      await Promise.all(epUpdatePromises);
    }

    console.log(`[Thumbnails] ✅ Synced: ${storyboardsSynced} storyboard videos, ${episodesSynced} episode thumbnails`);
    return c.json({
      success: true,
      synced: episodesSynced,
      storyboardsSynced,
      totalTasksFound: tasks.length,
      message: `同步完成：${episodesSynced} 个剧集缩略图，${storyboardsSynced} 个分镜视频URL`,
    });
  } catch (error: any) {
    console.error('[Thumbnails] Sync error:', truncateErrorMsg(error));
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ==================== 漫剧进度和生成路由 ====================

app.get(`${PREFIX}/series/:id/batch-status`, async (c) => {
  try {
    const seriesId = c.req.param('id');
    // Use filter on JSONB column - generation_metadata->>'seriesId' = ?
    const { data, error } = await supabase.from('video_tasks')
      .select('task_id, status, video_url, thumbnail')
      .filter('generation_metadata->>seriesId', 'eq', seriesId);
    if (error) return c.json({ success: false, error: error.message }, 500);
    return c.json({ success: true, data: toCamelCase(data || []) });
  } catch (error: any) { console.error('[GET /series/:id/batch-status] Error:', error); return c.json({ success: false, error: error.message }, 500); }
});

app.post(`${PREFIX}/series/:id/generate`, async (c) => {
  try {
    await supabase.from('series').update({ status: 'generating', updated_at: new Date().toISOString() }).eq('id', c.req.param('id'));
    return c.json({ success: true, message: 'Generation started' });
  } catch (error: any) { console.error('[POST /series/:id/generate] Error:', error); return c.json({ success: false, error: error.message }, 500); }
});

// ==================== AI 剧集生成（替代原503桩路由） ====================
// 下方三个路由为 v5.0.2 完整实现，替代旧的 503 stub

app.post(`${PREFIX}/series/:id/generate-episodes-ai`, async (c) => {
  try {
    const seriesId = c.req.param('id');
    const body = await c.req.json();
    const totalEpisodes = Math.min(Math.max(parseInt(body.totalEpisodes) || 10, 1), 50);

    // v6.0.23: select specific fields — only need basic info for episode generation prompt
    const { data: series, error: seriesErr } = await supabase
      .from('series').select('id, title, description, genre, theme, style, total_episodes').eq('id', seriesId).maybeSingle();
    if (seriesErr || !series) {
      return c.json({ success: false, error: seriesErr?.message || '漫剧不存在' }, 404);
    }

    console.log(`[AI] generate-episodes-ai: series=${seriesId}, totalEpisodes=${totalEpisodes}`);
    let episodeOutlines: any[] = [];

    if (VOLCENGINE_API_KEY || ALIYUN_BAILIAN_API_KEY) {
      try {
        const prompt = `你是一位专业的漫剧编剧。请根据以下信息，为漫剧创作${totalEpisodes}集的详细大纲。\n\n漫剧标题：${series.title}\n剧集简介：${series.description || '未提供'}\n${series.genre ? `类型：${series.genre}` : ''}\n${series.theme ? `主题：${series.theme}` : ''}\n\n请严格按以下JSON格式回复（不要包含markdown标记），返回一个数组：\n[{"episodeNumber":1,"title":"集标题","synopsis":"50-80字简介","growthTheme":"成长主题","keyMoments":["场景1","场景2"]}]\n\n要求：每集标题简洁有力，【最重要的规则】你的所有创作内容必须100%围绕上面给出的漫剧标题和简介来展开！禁止编造与标题和简介无关的故事。角色名、职业、背景必须与用户提供的标题/简介/类型保持一致。每一集的剧情都必须是用户给定主题的自然延伸。\\n\\n要求：\\n1. 每集标题简洁有力，必须与漫剧主题相关\\n2. 故事线有递进和转折，前期建立世界观，中期���展冲突，后期走向高潮和结局\\n3. 所有角色��事件、场景必须紧扣用户给定的标题「${series.title}」\\n4. 如果用户提供了具体简介，每集剧情必须是该简介故事的具体展开`;
        // v6.0.35: 修复大纲prompt中Unicode乱码（用户??定→用户给定, 标???→标题）+双反斜杠修复
        const promptFixed = `你是一位专业的漫剧编剧。请根据以下信息，为漫剧创作${totalEpisodes}集的详细大纲。\n\n漫剧标题：${series.title}\n剧集简介：${series.description || '未提供'}\n${series.genre ? `类型：${series.genre}` : ''}\n${series.theme ? `主题：${series.theme}` : ''}\n\n请严格按以下JSON格式回复（不要包含markdown标记），返回一个数组：\n[{"episodeNumber":1,"title":"集标题","synopsis":"50-80字简介","growthTheme":"成长主题","keyMoments":["场景1","场景2"]}]\n\n要求：每集标题简洁有���，【最重要的规则】你的所有创作内容必须100%围绕上面给出的漫剧标题和简介来展开！禁止编造与主题和简介无关的故事。角色名、职业、背景必须与用户提供的标题/简介/类型保持一致。每一集的剧情都必须是用户给定主题的自然延伸。\n\n要求：\n1. 每集标题简洁有力，必须与漫剧主题相关\n2. 故事线有递进和转折，前期建立世界观，中期发展冲突，后期走向高潮和结局\n3. 所有角色、事件、场景必须紧扣用户给定的标题「${series.title}」\n4. 如果用户提供了具体简介，每集剧情必须是该简介故事的具体展开`;
        // v6.0.19: callAI 多模型路由（heavy tier — 多集大纲生成）
        const aiResult = await callAI({
          messages: [{ role: 'user', content: promptFixed }],
          tier: 'heavy',
          temperature: 0.8,
          max_tokens: 6000,
          timeout: 90000,
        });
        const content = aiResult.content;
        try {
          const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
          const parsed = JSON.parse(cleaned);
          episodeOutlines = Array.isArray(parsed) ? parsed : (parsed.episodes || []);
        } catch { console.warn('[AI] generate-episodes-ai: JSON parse failed, using fallback'); }
      } catch (aiErr: any) {
        console.warn('[AI] generate-episodes-ai: AI call failed:', truncateErrorMsg(aiErr));
      }
    }

    if (episodeOutlines.length === 0) {
      const titles = ['命运的开端','初次交锋','暗流涌动','转折点','真相初现','并肩作战','信任危机','绝地反击','最终决战','尘埃落定'];
      const synopses = ['主角登场，日常生活中遭遇意外事件，命运的齿轮开始转动。','主角面对第一个挑战，遇到重要配角。','暗中的势力浮出水面，事情远比想象中复杂。','关键信息揭露，信念受到动摇，需要做出重大抉择。','真相逐渐清晰，但新的危机在酝酿。','并肩作战，共同面对强敌，友情在战斗中升华。','信任遭受考验，必须独自面对困境。','绝境之中找到新的力量，开始反击。','终极对决，命运即将揭晓。','归于平静，完成成长，故事迎来结局。'];
      episodeOutlines = Array.from({ length: Math.min(totalEpisodes, 30) }, (_, i) => ({
        episodeNumber: i + 1,
        title: i < 10 ? titles[i] : `第${i + 1}集`,
        synopsis: i < 10 ? synopses[i] : `故事持续发展，新角色出场，情节逐步深入。`,
        growthTheme: '成长与蜕变',
        keyMoments: [`场景${i + 1}A`, `场景${i + 1}B`],
      }));
    }

    episodeOutlines = episodeOutlines.map((ep: any, idx: number) => ({
      episodeNumber: ep.episodeNumber || ep.episode_number || idx + 1,
      title: ep.title || `第${idx + 1}集`,
      synopsis: ep.synopsis || ep.description || '',
      growthTheme: ep.growthTheme || ep.growth_theme || '成长',
      keyMoments: ep.keyMoments || ep.key_moments || [],
    }));

    await supabase.from('series_episodes').delete().eq('series_id', seriesId);

    // v6.0.78: 保存cliffhanger/previousEpisodeLink到key_moment（JSON编码后缀）
    const episodeRows = episodeOutlines.map((ep: any) => {
      const keyMomentsStr = Array.isArray(ep.keyMoments) ? ep.keyMoments.join('; ') : '';
      const cliffhanger = ep.cliffhanger || '';
      const prevLink = ep.previousEpisodeLink || '';
      const metaSuffix = (cliffhanger || prevLink) ? ` ||META:${JSON.stringify({ cliffhanger, previousEpisodeLink: prevLink })}` : '';
      return {
        series_id: seriesId, episode_number: ep.episodeNumber, title: ep.title,
        synopsis: ep.synopsis, growth_theme: ep.growthTheme,
        key_moment: keyMomentsStr + metaSuffix, status: 'draft',
      };
    });

    const { data: insertedEpisodes, error: insertErr } = await supabase
      .from('series_episodes').upsert(episodeRows, { onConflict: 'series_id,episode_number' }).select();

    if (insertErr) {
      console.error('[AI] generate-episodes-ai: DB insert error:', insertErr.message);
      return c.json({ success: false, error: `数据库写入失败: ${insertErr.message}` }, 500);
    }

    await supabase.from('series').update({ total_episodes: episodeOutlines.length, status: 'in-progress' }).eq('id', seriesId);
    console.log(`[AI] generate-episodes-ai: Created ${insertedEpisodes?.length || 0} episodes`);
    return c.json({ success: true, data: toCamelCase(insertedEpisodes || []), count: insertedEpisodes?.length || 0, fallback: !ALIYUN_BAILIAN_API_KEY });
  } catch (error: any) {
    console.error('[AI] generate-episodes-ai error:', truncateErrorMsg(error));
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.post(`${PREFIX}/episodes/:id/generate-storyboards-ai`, async (c) => {
  try {
    const episodeId = c.req.param('id');
    const body = await c.req.json();
    const sceneCount = Math.min(Math.max(parseInt(body.sceneCount) || 8, 1), 30);

    // v6.0.78: episode增加key_moment用于读取cliffhanger/previousEpisodeLink
    const { data: episode, error: epErr } = await supabase
      .from('series_episodes').select('id, series_id, episode_number, title, synopsis, key_moment').eq('id', episodeId).maybeSingle();
    if (epErr || !episode) return c.json({ success: false, error: '剧集不存在' }, 404);

    const { data: series } = await supabase
      .from('series').select('title, description, style, genre, coherence_check').eq('id', episode.series_id).maybeSingle();

    // v6.0.15: 查询角色和相邻剧集上下文，增强分镜连贯性
    const { data: sbChars } = await supabase.from('series_characters')
      .select('name, role, appearance').eq('series_id', episode.series_id).limit(5);
    const sbCharBlock = (sbChars || []).map((ch: any) => `${ch.name}(${ch.role}): ${ch.appearance || '标准外��'}`).join('; ');

    // v6.0.23: 并行查询前后集上下文
    let prevEpCtx = '', nextEpCtx = '';
    const [prevEpRes, nextEpRes] = await Promise.all([
      episode.episode_number > 1
        ? supabase.from('series_episodes').select('title, synopsis, key_moment').eq('series_id', episode.series_id).eq('episode_number', episode.episode_number - 1).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('series_episodes').select('title, synopsis').eq('series_id', episode.series_id).eq('episode_number', episode.episode_number + 1).maybeSingle(),
    ]);
    if (prevEpRes.data) {
      prevEpCtx = `上一集「${prevEpRes.data.title}」：${(prevEpRes.data.synopsis || '').substring(0, 50)}`;
      // v6.0.78: 从key_moment提取上集cliffhanger供衔接
      const prevKM = prevEpRes.data.key_moment || '';
      const prevMetaMatch = prevKM.match(/\|\|META:(.+)$/);
      if (prevMetaMatch) {
        try {
          const prevMeta = JSON.parse(prevMetaMatch[1]);
          if (prevMeta.cliffhanger) prevEpCtx += `。上集悬念：${prevMeta.cliffhanger}`;
        } catch { /* ignore parse error */ }
      }
    }
    if (nextEpRes.data) nextEpCtx = `下一集「${nextEpRes.data.title}」：${(nextEpRes.data.synopsis || '').substring(0, 50)}`;

    // v6.0.78: 从当前集key_moment提取previousEpisodeLink
    let currentEpLink = '';
    const currentKM = (episode as any).key_moment || '';
    const currentMetaMatch = currentKM.match(/\|\|META:(.+)$/);
    if (currentMetaMatch) {
      try {
        const currentMeta = JSON.parse(currentMetaMatch[1]);
        if (currentMeta.previousEpisodeLink) currentEpLink = currentMeta.previousEpisodeLink;
      } catch { /* ignore parse error */ }
    }

    const sbStyleGuide = series?.coherence_check?.visualStyleGuide || '';
    const sbBaseStyle = STYLE_PROMPTS[series?.style || 'realistic'] || '';
    // v6.0.36: 读取作品类型
    const sbProductionType = series?.coherence_check?.productionType || 'short_drama';
    const sbPtInfo = PRODUCTION_TYPE_PROMPTS[sbProductionType] || PRODUCTION_TYPE_PROMPTS.short_drama;

    console.log(`[AI] generate-storyboards-ai: episode=${episodeId}, sceneCount=${sceneCount}, chars=${sbChars?.length || 0}, prodType=${sbProductionType}`);
    let sbOutlines: any[] = [];

    if (VOLCENGINE_API_KEY || ALIYUN_BAILIAN_API_KEY) {
      try {
        // v6.0.15+v6.0.35: 增强prompt——角色/风格/邻集上下文+场景衔接+Seedance 2.0分镜优化+Unicode修复
        // NOTE: sbPrompt2 is immediately overwritten below, this initial value is a legacy placeholder
        let sbPrompt2: string = '';
        // (legacy initial prompt removed — overwritten below by v6.0.78 prompt)
        void `你是一位专业的漫画分镜师，擅长为AI视频生成引擎编写高质量分镜。请为以下剧集创作${sceneCount}个分镜场景。\n\n漫剧标题：${series?.title || '未知'}\n剧集标题：${episode.title}\n剧集简��：${episode.synopsis || '未提供'}\n\n请严格按以下JSON格式回复（不要包含markdown标记），返回一个数组：\n[{"sceneNumber":1,"description":"场景详细描述(50-100字,含主体外貌+连续动作+环境+光影)","dialogue":"角色对话","location":"场景地点","timeOfDay":"早晨/上午/���午/下午/傍晚/夜晚","cameraAngle":"近景/中景/远景/全景/特写/俯拍/仰拍","duration":8,"emotionalTone":"情感基调"}]`;
        // v6.0.15: 追加角色、风格、邻集上下文 + 场景衔接要求
        // v6.0.35→v6.0.36: 覆盖修复Unicode乱码+注入专业视听语言知识
        // v6.0.78: 重写分镜prompt——强化衔接+角色一致性+characters字段
        sbPrompt2 = `你是一位${sbPtInfo.label}级别的专业分镜师兼摄影指导，精通视听语言理论，擅长为AI视频生成引擎编写电影级分镜。请为以下剧集创作${sceneCount}个分镜场景。\n\n漫剧标题：${series?.title || '未知'}\n��集标题：${episode.title}\n剧集简介：${episode.synopsis || '未提供'}\n\n请严格按以下JSON格式回复（不要包含markdown标记），返回一个数组：\n[{"sceneNumber":1,"description":"场景详细描述(50-100字,含主体外貌+连续动作+环境+光影)","dialogue":"角色全名：对话内容(每场景必填2-3句推动剧情的对话,格式如:林小雨：我不会放弃的\\n张明：你确定吗)","location":"场景地点","timeOfDay":"早晨/上午/中午/下午/傍晚/夜晚","cameraAngle":"近景/中景/远景/全景/特写/俯拍/仰拍","characters":["本场景出���角色全名1","角色全名2"],"duration":10,"emotionalTone":"情感基调","transitionFromPrevious":"与上一场景的镜头衔接(第1个场景写开场)","endingVisualState":"本场景结束时画面状态(20字)"}]`;
        // v6.0.112: 修复sbPrompt2内残留的Unicode乱码（剧集标题/出场角色）
        sbPrompt2 = sbPrompt2.replace(/\\n.{1,6}集标题：/, '\\n剧集标题：').replace(/本场景出.{1,6}角色全名1/, '本场景出场角色全名1');
        const extraCtx: string[] = [];
        // v6.0.36: 注入专业景别编排知识+蒙太奇技法
        extraCtx.push(`\n【景别编排节奏】场景cameraAngle须形成变化：开场远景→中景互动→中近景情感→特写高潮→中景推进→远景收尾。禁止连续3场景相同景别。蒙太奇：对比(明暗对比)/平行(双线交叉)/隐喻(笼中鸟暗喻束缚)。`);
        if (sbCharBlock) extraCtx.push(`\n【角色外貌卡】${sbCharBlock}`);
        if (sbStyleGuide) extraCtx.push(`\n【视觉风格】${sbStyleGuide.substring(0, 300)}`);
        else if (sbBaseStyle) extraCtx.push(`\n【画面风格】${sbBaseStyle}`);
        if (prevEpCtx) extraCtx.push(`\n【前集回顾】${prevEpCtx}`);
        if (nextEpCtx) extraCtx.push(`\n【后集预告】${nextEpCtx}`);
        // v6.0.78: 注入当前集承接说明（从key_moment META中提取）
        if (currentEpLink) extraCtx.push(`\n【本集开头承接】${currentEpLink}——第1个场景必须体现这一衔接`);
        // v6.0.20: 大幅强化场景连贯性要求
        extraCtx.push(`\n【场景连贯性——最高优先级要求】
1. 角色一致性：同一角色在所有场景中服装/发型/配饰/体型必须完全一致，描述中必须出现具体角色名和完整外貌特征（不可用"他""她"代替）
2. 环境连续性：同一地点的场景，环境细节（天气/光线/家具/陈设/季节）必须保持一致；转换��点时必须描述转场过程
3. 时间连续性：注明每个场景的时段（早晨/上��/中午/下午/傍晚/夜晚），相邻场景时间必须合理衔接，禁止无理由跳跃
4. 情感过渡：情感基调变化必须渐进（如平静→好奇→紧张→恐惧），禁止跳跃式突变
5. 动作连贯：上一场景角色"走向门口"，下一场景必须从"推开门"或"门外"开始，禁止空间跳跃
6. 视觉构图��进：镜头语言应有节奏感——远景建立环境→中景交代人物→近景推进情感→特写强化冲突，避免连续相同机位
7. 对话角色锁定：dialogue字段必须标注说话者角色名（格式："角色名：对话内容"），同一角色的语气/口头禅必须前后一致，禁止张冠李戴
8. 角色出场追踪：每个场景的description必须明确列出该场景中出场的所有角色全名及其当前动作/位置，禁止用代词模糊指代`);
        // v6.0.34: Seedance 2.0 视频生成优化——指导AI写出更适合视频引擎的分镜描述
        extraCtx.push(`\n【视频生成优化——description写法���南】\n1. 结构：「主体外貌特征 + 连续动作(3-4步) + 场景环境 + 光影氛围���\n2. 动作拆解示例：不写"她跳舞"，写"她右脚轻点地面→身体缓缓旋转→裙摆随惯性展开→双臂向两侧舒展"\n3. 光影必写：每个场景必须包含光源描述（如"窗外暖阳斜射""头顶日光灯冷白光""街边霓虹灯红蓝交替"）\n4. 禁止抽象词：不写"激烈战斗"写"右拳挥出→对方侧身闪避→回身一脚踢向腰部→对方后退两步撞上墙壁"`);
        // v6.0.112: 修复description写法指南条目的Unicode乱码（指南/氛围）
        extraCtx[extraCtx.length - 1] = `\n【视频生成优化——description写法指南】\n1. 结构：「主体外貌特征 + 连续动作(3-4步) + 场景环境 + 光影氛围」\n2. 动作拆解示例：不写"她跳舞"，写"她右脚轻点地面→身体缓缓旋转→裙摆随惯性展开→双臂向两侧舒展"\n3. 光影必写：每个场景必须包含光源描述（如"窗外暖阳斜射""头顶日光灯冷白光""街边霓虹灯红蓝交替"）\n4. 禁止抽象词：不写"激烈战斗"写"右拳挥出→对方侧身闪避���回身一脚踢向腰部→对方后退两步撞上墙壁"`;
        if (prevEpCtx) extraCtx.push(`\n第1个场景必须承接上一集结尾——描述中明确体现从上集最后画面过渡到本集开场的衔接。`);
        // v6.0.69: 反重复+中国审美+角色语言个性化
        extraCtx.push(`\n【严禁重复——红线规则】\n1. 不同场景的description禁止出现相同或近似的动作描写或情节，每个场景必须推进新剧���事件\n2. dialogue中同一角色不可在不同场景说出含义相似的话，禁止车轱辘对话\n3. 同集内禁止出现相同location+相同动作的场景组合\n4. 如果上一场景是对话推进，下一场景必须是行动/事件而非再次对话`);
        extraCtx.push(`\n【中国审美与价值观】\n1. 人物形象精致优美：五官端正比例协调、气质自然不夸张、衣着得体有品位\n2. 场景环境美观：注重构图美感、色彩和谐、光影层次\n3. 情节传递正向价值：勇气/善良/成长/责任/家国情怀\n4. 角色语言得体：符合角色身份和年龄，避免不符合国情的表达方式`);
        // v6.0.63: 对白匹配+角色出场追踪规则
        extraCtx.push(`\n【对话与角色匹配——严格要求】\n1. dialogue字段中每句对话必须标明说话者全名（格式："陈世美：我是冤枉的"），禁止无名对话\n2. dialogue中出现的角色必须在同一场景的description中已明确出场，禁止幽灵角色说话\n3. 同一角色的语气/称谓/口头禅必须全剧一致\n4. 多角色对话场景必须在description中交代所有参与者的位置和朝向`);
        // v6.0.84: dialogue必填强制规则
        extraCtx.push(`\n【对白必填——核心要求】dialogue字段严禁为空！每个场景至少2-3句角色对话，对话须推动剧情、揭示性格或��造冲突。唯一例外：纯动作追逐场景可写"角色名：(内心)独白内容"。`);
        sbPrompt2 += extraCtx.join('');
        // v6.0.19: callAI 多模型路由（heavy tier — 分镜创作）
        // v6.0.84: max_tokens 6000→7000（单集6场景+必填对话增大输出量）
        const aiResult = await callAI({
          messages: [{ role: 'user', content: sbPrompt2 }],
          tier: 'heavy',
          temperature: 0.7,
          max_tokens: 7000,
          timeout: 90000,
        });
        const content = aiResult.content;
        // v6.0.84: 使用repairTruncatedStoryboardJSON替代简单JSON.parse
        const { parsed: sbParsedResult, repaired: sbWasRepaired, scenesRecovered } = repairTruncatedStoryboardJSON(content);
        if (sbParsedResult) {
          if (sbWasRepaired) console.log(`[AI] generate-storyboards-ai: JSON repaired, ${scenesRecovered} scenes recovered`);
          sbOutlines = Array.isArray(sbParsedResult) ? sbParsedResult : [];
        } else {
          console.warn('[AI] generate-storyboards-ai: JSON parse+repair all failed');
        }
      } catch (aiErr: any) {
        console.warn('[AI] generate-storyboards-ai: AI call failed:', truncateErrorMsg(aiErr));
      }
    }

    if (sbOutlines.length === 0) {
      const tpls = [
        { desc: '开场画面，建立场景氛围', cam: '远景', tone: '期待' },
        { desc: '角色登场，展现人物状态', cam: '中景', tone: '自然' },
        { desc: '关���对话，推动剧情', cam: '中近景', tone: '认真' },
        { desc: '冲突或转折发生', cam: '特写', tone: '紧张' },
        { desc: '角色做出选择', cam: '中景', tone: '坚定' },
        { desc: '行动场景', cam: '中景', tone: '激动' },
        { desc: '高潮时刻', cam: '特写', tone: '震撼' },
        { desc: '本集结尾', cam: '远景', tone: '余韵' },
      ];
      // v6.0.112: 修复tpls[2]描述中的Unicode乱码（关键→关键）
      tpls[2].desc = '关键对话，推动剧情';
      sbOutlines = Array.from({ length: Math.min(sceneCount, 12) }, (_, i) => {
        const t = tpls[i % tpls.length];
        return { sceneNumber: i + 1, description: `${episode.title} - 场景${i + 1}：${t.desc}`, dialogue: '', location: '', timeOfDay: i < sceneCount / 2 ? '白天' : '夜晚', cameraAngle: t.cam, duration: 10, emotionalTone: t.tone };
      });
    }

    await supabase.from('series_storyboards').delete().eq('series_id', episode.series_id).eq('episode_number', episode.episode_number);

    // v6.0.78: 保存characters字段+transitionFromPrevious到generation_metadata
    const sbRows = sbOutlines.map((sb: any, idx: number) => ({
      series_id: episode.series_id, episode_number: episode.episode_number,
      scene_number: sb.sceneNumber || sb.scene_number || idx + 1,
      description: sb.description || `场景${idx + 1}`, dialogue: sb.dialogue || '',
      characters: sb.characters || [],
      location: sb.location || '', time_of_day: sb.timeOfDay || sb.time_of_day || '',
      camera_angle: sb.cameraAngle || sb.camera_angle || '中景',
      duration: sb.duration || 10, emotional_tone: sb.emotionalTone || sb.emotional_tone || '', status: 'draft',
    }));

    const { data: insertedSbs, error: sbInsertErr } = await supabase.from('series_storyboards').upsert(sbRows, { onConflict: 'series_id,episode_number,scene_number' }).select();
    if (sbInsertErr) {
      console.error('[AI] generate-storyboards-ai: DB upsert error:', sbInsertErr.message);
      return c.json({ success: false, error: `数据库写入失败: ${sbInsertErr.message}` }, 500);
    }

    console.log(`[AI] generate-storyboards-ai: Created ${insertedSbs?.length || 0} storyboards`);
    return c.json({ success: true, data: toCamelCase(insertedSbs || []), count: insertedSbs?.length || 0, fallback: !ALIYUN_BAILIAN_API_KEY });
  } catch (error: any) {
    console.error('[AI] generate-storyboards-ai error:', truncateErrorMsg(error));
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.post(`${PREFIX}/series/:id/generate-full-ai`, async (c) => {
  try {
    const seriesId = c.req.param('id');
    const body = await c.req.json();

    // v6.0.75: 增加 status + updated_at 用于幂等性防护
    const { data: series, error: seriesErr } = await supabase
      .from('series').select('id, title, description, genre, style, theme, total_episodes, coherence_check, story_outline, status, updated_at').eq('id', seriesId).maybeSingle();
    if (seriesErr || !series) return c.json({ success: false, error: seriesErr?.message || '漫剧不存在' }, 404);

    // v6.0.94: 幂等性防护窗口 3分钟→10分钟（每批次AI+retry需~3min，防止双批次~6min内被误判为卡住）
    // v6.0.75原始逻辑：3分钟内的generating状态阻止重复请求
    // v6.0.115: forceRetry=true 时跳过幂等性检查（修复: retrySeries先更新updated_at→generate-full-ai看到fresh updated_at→静默BLOCK→重试永远不生效）
    const forceRetry = body.forceRetry === true;
    if (series.status === 'generating' && !forceRetry) {
      const updatedAt = series.updated_at ? new Date(series.updated_at).getTime() : 0;
      const elapsedMs = Date.now() - updatedAt;
      if (elapsedMs < 10 * 60 * 1000) {
        console.warn(`[AI] generate-full-ai: BLOCKED duplicate request for series=${seriesId} (status=generating, updated ${Math.round(elapsedMs / 1000)}s ago)`);
        return c.json({ success: true, data: { message: '生成任务已在进行中，���等待完成', alreadyGenerating: true }, alreadyGenerating: true });
      }
      // 超过10分钟的generating状态视为卡住，允许重新生成
      console.warn(`[AI] generate-full-ai: Stale generating status for series=${seriesId} (${Math.round(elapsedMs / 1000)}s old), allowing re-generation`);
    }
    if (forceRetry) {
      console.log(`[AI] generate-full-ai: forceRetry=true, bypassing idempotency guard for series=${seriesId}`);
    }

    const totalEpisodes = Math.min(Math.max(parseInt(series.total_episodes) || 10, 1), 50);
    const seriesStyle = series.style || 'realistic';
    // v6.0.16: 参考图URL
    const referenceImageUrl = series.coherence_check?.referenceImageUrl || '';
    // v6.0.36: 作品类型（从coherence_check读取，默认short_drama）
    const productionType = series.coherence_check?.productionType || 'short_drama';
    console.log(`[AI] generate-full-ai: series=${seriesId}, title=${series.title}, totalEpisodes=${totalEpisodes}, style=${seriesStyle}, prodType=${productionType}${referenceImageUrl ? ', hasRefImage=true' : ''}`);

    // 🔥 v5.2.0: 写入实时进度，前端轮询 GET /series/:id 可读取
    // 降级保护：如果 generation_progress 列不存在，仅更新 status
    const updateProgress = async (currentStep: number, totalSteps: number, stepName: string, extra?: any) => {
      try {
        const { error: fullErr } = await supabase.from('series').update({
          status: 'generating',
          current_step: currentStep,
          total_steps: totalSteps,
          generation_progress: { currentStep, totalSteps, stepName, startedAt: new Date().toISOString(), ...extra },
          updated_at: new Date().toISOString(),
        }).eq('id', seriesId);

        if (fullErr) {
          // generation_progress 列可能不存在，降级到只更新 status
          console.warn(`[AI] generate-full-ai: progress update failed (step ${currentStep}):`, fullErr.message, '-> fallback');
          await supabase.from('series').update({
            status: 'generating',
            updated_at: new Date().toISOString(),
          }).eq('id', seriesId);
        }
      } catch (e: any) {
        console.warn(`[AI] generate-full-ai: progress update exception (step ${currentStep}):`, e?.message);
      }
    };

    await updateProgress(0, 6, '准备中...');

    // ===== Steps 1+2 并行: 剧集大纲 + 角色（互不依赖，并行省~60s） =====
    // v6.0.93: 原串行流程约需 120s(大纲)+60s(角色)=180s；并行后关键路径仅120s
    await updateProgress(1, 6, '正在并行生成剧集大纲���角色...');

    // --- 构建大纲 prompt（与原Step1完全一致）---
    let episodeOutlines: any[] = [];
    // v6.0.93: 声明在外层作用域，通过闭包赋值（取代旧的单独Step2）
    let characterRows: any[] = [];
    let createdChars: any[] | undefined;

    const ptLabel = (PRODUCTION_TYPE_PROMPTS[productionType] || PRODUCTION_TYPE_PROMPTS.short_drama).label;
    const ptNarrative = (PRODUCTION_TYPE_PROMPTS[productionType] || PRODUCTION_TYPE_PROMPTS.short_drama).narrativeStyle;

    if (VOLCENGINE_API_KEY || ALIYUN_BAILIAN_API_KEY) {
      // v6.0.93: Promise.all 并行执行大纲生成 + 角色生成
      const refImgHintText = referenceImageUrl ? `\n【参考图】用户提供了参考图，请参考其人物形象、服饰风格来设计角色外貌。` : '';

      const charPromptLines = [
        `你是一位超一流的专业漫剧导演和编剧。请根据以下信息，为漫剧创作3-5个主要角色。`,
        ``, `漫剧标题：${series.title}`, `剧集简介：${series.description || '未提供'}`,
        series.genre ? `类型：${series.genre}` : '', series.theme ? `主题：${series.theme}` : '', ``,
        `请严格按JSON格式回复（不要markdown），返回数组：`,
        `[{"name":"角色名","role":"protagonist|supporting|antagonist","description":"角色背景故事(80-120字,含职业/家庭背景/人���关键经历/核心动机/内心矛盾/性格成因)","appearance":"外貌特征(50-80字，必须包含年龄、身高体型、发型发色、面部特征、标志性服装配饰)","personality":"性格���征与说话风格(30-50字,含性格标签+说话习惯+口头禅+情绪表达方式)","relationships":"与其他角色的关系(20-40字,如与XX是青梅竹马/暗恋XX/与XX有仇怨)"}]`,
        refImgHintText, ``, `要求：`,
        `1. 必须有1个protagonist，1-2个supporting，可选1个antagonist`,
        `2. 角色之间要有关联和互动关系`,
        `3. 【极重要】外貌描述必须极度详细且唯一可辨识：精确年龄(如22岁)、身高(如168cm)、体型(如���细/健壮)、发型发色(如齐肩黑色直发刘海偏左/棕色短寸头)、瞳色(如深棕色/黑色)、肤色(如白皙/小麦色)、面部特征(如瓜子脸高鼻梁/方脸浓眉)、面部微特征(如右嘴角上方有一颗小痣/无痣无疤)、标志性服装(如白色连帽卫衣+牛仔裤/黑色西装)、标志性配饰(如银色项链/圆框眼镜)——越详细AI视频生成角色越一致`,
        `4. 角色名字、职业、背景必须与标题「${series.title}」和简介匹配`,
        `5. 同一��色appearance在所有场景保持一致，不要换装换发型`,
        `6. 【审美要求】角色形象应优美精致，符合当代中国主流审美：五官端正、比例协调、气质自然、衣着得体有品位；主角形象要有辨识度和记忆点；避免夸张怪异的外貌设计`,
        `7. 【唯一性��点】每个角色必须有至少2个视觉锚点(如：只有她有红色发带+圆框眼镜)，确保不同角色在视觉上绝不混淆`,
        `8. 【面部微特征锁定】如果角色有痣、疤痕、胎记、酒窝、雀斑等面部微特征，必须精确标注位置(如"左眼角下方2cm处有一颗小痣")；如果没有则明确写"面部无痣无疤"——这些微特征一旦设定，全剧所有场景必须100%位置一致，绝不允许痣从左脸跑到右脸`,
      ].filter(Boolean).join('\n');
      // v6.0.112: 修复charPromptLines中体型描述的Unicode乱码（纤细）
      const charPromptLinesFixed = charPromptLines.replace(/体型\(如.{1,6}细\/健壮\)/, '体型(如纤细/健壮)');

      try {
        // v6.0.78: 全面重写剧本生成prompt——提升多样性/创新性/吸引力
        const epGenPromptLines = [
          `你是一位拿过金鸡奖/飞天奖的顶级${ptLabel}编剧，也是一位洞察人性的故事大师。你的作品以"意想不到的���节反转""真实到令人心痛的人���命运""让观众欲罢不能的悬念钩子"著称。现在请为${ptLabel}创作${totalEpisodes}集的详细大纲。`,
          ``,
          `作品主题：${series.title}`,
          `剧集简介：${series.description || '未提供'}`,
          series.genre ? `类型：${series.genre}` : '',
          series.theme ? `主题：${series.theme}` : '',
          series.story_outline ? `故事大纲：${(series.story_outline || '').substring(0, 600)}` : '',
          `作品类型叙事要求：${ptNarrative}`,
          ``,
          `请严格按以下JSON格式回复（不要包含markdown标记），返回一个数组：`,
          `[{"episodeNumber":1,"title":"集标题(4-8字,新颖有画面感)","synopsis":"80-120字简介,必须含:本集核心事件+具体角色名+关键转折+情感高潮","growthTheme":"本集主题(不超过6字)","keyMoments":["具体场景1(含角色名和动作)","具体场景2"],"cliffhanger":"本集结尾的具体悬念画面(20-30字)","previousEpisodeLink":"本集开头如何承接上集(第1集写开端)"}]`,
          ``,
          `【创作的灵魂——像大导演一样思考】`,
          `你不是在填表格,你是在创造一部让人上瘾的作品。每一集像一颗精心设计的炸弹：铺垫-引爆-余震-新引线。`,
          ``,
          `【顶级剧本6大铁律】`,
          `1.【��套路】严禁陈词滥调："迎接挑战""获得成长与领悟""在困境中找到力量""命运的齿轮开始转动""坚定了信念"。每一句都必须是具体的、有画面感的、独一无二的事件。`,
          `2.【人物弧光】主角不是圣人——TA要犯错、要自私、要在道德灰色地带挣扎。好人要有缺点,坏人要有苦衷。`,
          `3.【钩子设计】每集结尾必须有让观众"不看下集会死"的悬念:震惊的发现/不可能的选择/意外出现的人/改变一切的信。禁止空洞悬念。`,
          `4.【情节密度】每集至少2个改变角色命运的具体事件。事件有因果链——A做了X导致B发现了Y,于是C不得不做Z。`,
          `5.【情感真实】愤怒时不说"我很生气"而是摔门而去,紧张时不说"好紧张"而是指甲掐进手心。`,
          `6.【节奏控制】前20%快速抓人,20-40%升级冲突,40-60%中段大反转,60-80%高潮连环,最后20%情感收束。`,
          ``,
          `【剧情连贯性红线】`,
          `1.所有创作必须100%围绕标题「${series.title}」和简介展开`,
          `2.每集synopsis必须包含具体角色名和具体事件`,
          `3.角色决定必须有后果——第3集的谎言第5集必须被揭穿`,
          `4.配角不是工具人——每个配角至少有自己的故事线`,
          `5.已发生的重大事件必须在后续被角色记住和提及`,
          `6.每集核心冲突类型必须不同:发现秘密/被迫选择/信任崩塌/意外重逢/真相大白/背叛与原谅/身份暴露/生死抉择,不可重复`,
          `7.cliffhanger字段:最后1集写"故事完结",其余集写具体悬念画面`,
          `8.不同角色说话方式必须有明显差异,体现各自性格身份`,
          `7. 每集synopsis必须包含具体事件名和角色名，不能只写空泛的"故事发展"`,
          `8. cliffhanger字段：最后1集写"故事完结"，其余集写具体的伏笔或悬念内容`,
        ].filter(Boolean).join('\n');
        // v6.0.78: dead code below — extraRules已合并入主体prompt，但保留变量声明以避免编译错误
        const extraRules = '\n9. 【严禁重复套路】每集核心冲突类型必须不同——禁止多集出现类似模式，每集必须有独特事件类型(发现秘密/背叛/重逢/抉择/对决等)\n10. 【角色语言个性化】不同角色说话方式必须有明显差异，体现各自性格身份；对话内容不可跨集重复';
        // v6.0.112: 修复epGenPromptLines中情节反转的Unicode乱码
        const epGenPromptFixed = epGenPromptLines.replace(/意想不到的.{1,6}节反转/, '意想不到的情节反转'); // v6.0.78: 直接使用（旧extraRules已合并入主体）

        // v6.0.93: 并行执行大纲生成 + 角色生成（互不依赖，节省~60s）
        // 清除旧角色数据放到并行前（重试安全）
        const { error: delCharErr } = await supabase.from('series_characters').delete().eq('series_id', seriesId);
        if (delCharErr) console.warn('[AI] generate-full-ai: delete old characters warning:', delCharErr.message);

        console.log('[AI] generate-full-ai: ⚡ Launching parallel: episode outlines + characters...');
        const [epResult, charResult] = await Promise.allSettled([
          // 大纲生成
          callAI({
            messages: [{ role: 'user', content: epGenPromptFixed }],
            tier: 'heavy',
            temperature: 0.92,
            max_tokens: 8000,
            timeout: 120000,
          }),
          // 角色生成
          callAI({
            messages: [{ role: 'user', content: charPromptLinesFixed }],
            tier: 'medium',
            temperature: 0.8,
            max_tokens: 3000,
            timeout: 60000,
          }),
        ]);
        console.log(`[AI] generate-full-ai: Parallel results: ep=${epResult.status}, char=${charResult.status}`);

        // 处理大纲结果
        if (epResult.status === 'fulfilled') {
          try {
            const cleaned = epResult.value.content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
            const parsed = JSON.parse(cleaned);
            episodeOutlines = Array.isArray(parsed) ? parsed : (parsed.episodes || []);
          } catch { console.warn('[AI] generate-full-ai: Episode outline JSON parse failed, using fallback'); }
        } else {
          console.warn('[AI] generate-full-ai: Episode outline AI call failed:', truncateErrorMsg(epResult.reason));
        }

        // 处理角色结果（写入外层作用域 characterRows/createdChars）
        if (charResult.status === 'fulfilled') {
          try {
            const cleaned = charResult.value.content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
            const parsed = JSON.parse(cleaned);
            const chars = Array.isArray(parsed) ? parsed : (parsed.characters || []);
            characterRows = chars.map((ch: any) => ({
              series_id: seriesId,
              name: ch.name || '未命名角色',
              role: ['protagonist', 'supporting', 'antagonist', 'mentor', 'extra'].includes(ch.role) ? ch.role : 'supporting',
              description: `${ch.description || ''}${ch.relationships ? '。关系：' + ch.relationships : ''}`,
              appearance: ch.appearance || '',
              personality: ch.personality || '',
            }));
          } catch { console.warn('[AI] generate-full-ai: Character JSON parse failed, using fallback'); }
        } else {
          console.warn('[AI] generate-full-ai: Character AI call failed:', truncateErrorMsg(charResult.reason));
        }

        // 角色兜底
        if (characterRows.length === 0) {
          characterRows = [
            { series_id: seriesId, name: '主角', role: 'protagonist', description: '故事的主人公，怀揣梦想的年轻人', appearance: '20岁左右，精神饱满，目光坚定', personality: '勇敢、坚韧、善良' },
            { series_id: seriesId, name: '挚友', role: 'supporting', description: '主角最信任的伙伴，总在关键时刻伸出援手', appearance: '与主角同龄，性格开朗，笑容爽朗', personality: '忠诚、幽默、热心' },
            { series_id: seriesId, name: '导师', role: 'supporting', description: '引导主角成长的智者，拥有丰富的阅历', appearance: '中年人，气质沉稳，目光深邃', personality: '睿智、严厉、关怀' },
          ];
        }

        // 写入角色到 DB（并行AI完成后同步写）
        const { data: insertedChars, error: charInsertErrInner } = await supabase
          .from('series_characters').insert(characterRows).select();
        if (charInsertErrInner) {
          console.warn('[AI] generate-full-ai: character insert warning:', charInsertErrInner.message);
        } else {
          createdChars = insertedChars || [];
          console.log(`[AI] generate-full-ai: ✅ Created ${createdChars.length} characters (parallel)`);
        }
      } catch (aiErr: any) {
        console.warn('[AI] generate-full-ai: Parallel AI call failed:', truncateErrorMsg(aiErr));
      }
    }

    // v6.0.94: 并行完成后补充进度更新（告知前端Step1+2已完成）
    await updateProgress(2, 6, `剧集大纲+角色创建完成（${episodeOutlines.length}集/${characterRows.length}个角色）...`);

    // 兜底：如果并行路径完全跳过（无AI key），在这里生成默认角色并写DB
    if (characterRows.length === 0) {
      characterRows = [
        { series_id: seriesId, name: '主角', role: 'protagonist', description: '故事���主人公，怀揣梦想的年轻人', appearance: '20岁左右，精神饱满，目光坚定', personality: '勇敢、坚韧、善良' },
        { series_id: seriesId, name: '挚友', role: 'supporting', description: '主角最信任的伙伴，总在关键时刻伸出援手', appearance: '与主角同龄，性格开朗，笑容爽朗', personality: '忠诚、幽默、热心' },
        { series_id: seriesId, name: '导师', role: 'supporting', description: '引导主角成长的智者，拥有丰富的阅历', appearance: '中年人，气质沉稳，目光深邃', personality: '睿智、严厉、关怀' },
      ];
      // v6.0.112: 修复fallback主角描述中的Unicode乱码（故事的主人公）
      if (characterRows[0]?.name === '主角') characterRows[0].description = '故事的主人公，怀揣梦想的年轻人';
      const { error: delCharErr2 } = await supabase.from('series_characters').delete().eq('series_id', seriesId);
      if (delCharErr2) console.warn('[AI] generate-full-ai: delete old characters warning:', delCharErr2.message);
      const { data: fallbackChars } = await supabase.from('series_characters').insert(characterRows).select();
      createdChars = fallbackChars || [];
    }

    // ===== Step 3: 生成视觉风格指南（v6.0.8 新增） =====
    await updateProgress(3, 6, '正在生成视觉风格指南...');
    let visualStyleGuide = '';
    const baseStylePrompt = STYLE_PROMPTS[seriesStyle] || STYLE_PROMPTS.realistic;

    if (VOLCENGINE_API_KEY || ALIYUN_BAILIAN_API_KEY) {
      try {
        const charAppearanceList = characterRows.map((ch: any) =>
          `${ch.name}（${ch.role}）：${ch.appearance || '未描述'}`
        ).join('\n');

        const styleGuidePrompt = `你是一位专业的漫画美术总监。请为以下漫剧创建一份统一的视觉风格指南，确保全系列画面风格一致。

漫剧标题：${series.title}
故事简介：${series.description || '未提供'}
${series.genre ? `类型：${series.genre}` : ''}
视觉风格方向：${baseStylePrompt}
${referenceImageUrl ? `用户提供了参考图，请参考其视觉风格、色调、构图来制定风格指南。` : ''}
主要角色：
${charAppearanceList || '暂无角色信息'}

请按以下格式输出视觉风格指南（纯文本，不要JSON格式）：

【角色外貌卡】
为每个角色写出60-100字的详细视觉描述，包含：发型发色(刘海方向/长度)、瞳色、面部五官比例(脸型/眉形/鼻形/唇形)、面部微特征(痣/疤痕/酒窝/雀斑的精确位置，如"右嘴角上方1cm有小痣"，没有则写"面部无痣无疤")、体型身高、标志性服装/配饰。确保每次出现该角色时视觉100%一致。

【色彩方案】
定���全系列��主色调、辅色调、情绪色彩映射（如紧张=冷色、温馨=暖色），30-50字。

【构图与光影规范】
定义常用构图方式、光影风格、画面质感，30-50字。

【环境风格基准】
定义场景环境的整体美术风格、建筑风格、自然环境特征，30-50字。

要求：
1. 所有描述必须与「${seriesStyle}」风格（${baseStylePrompt}）高度统一
2. 角色外貌描述必须极��具体，能作为AI视频生成的精确参考，包含可量化的视觉锚点
3. 控制总字数在300-500字以内，言简意赅
4. 角色形象设计符合当代中国主流审美：五官精致端正、身材比例协调、气质自然得体、衣着有品位感
5. 【面部微特征锁定】痣/疤痕/胎记/酒窝的位置一旦设定，全系列所有场景必须完全一致——绝不允许左右脸互换或位置漂移
6. 每个角色至少2个独特的视觉辨识标志(如独特发型/标志性配饰/特殊服装颜色)，确保视频生成时不会��淆不同角色`;

        // v6.0.19: callAI 多模型路由（medium tier — 风格指南）
        const sgResult = await callAI({
          messages: [{ role: 'user', content: styleGuidePrompt }],
          tier: 'medium',
          temperature: 0.6,
          max_tokens: 2000,
          timeout: 60000,
        });
        visualStyleGuide = sgResult.content.trim();
        console.log(`[AI] generate-full-ai: ✅ Visual style guide generated (${visualStyleGuide.length} chars, model=${sgResult.model})`);
      } catch (sgErr: any) {
        console.warn('[AI] generate-full-ai: Style guide AI error:', truncateErrorMsg(sgErr));
      }
    }

    // Fallback: 如果AI生成失败，用基础风格+角色信息拼一个简单指南
    if (!visualStyleGuide) {
      const charFallback = characterRows.map((ch: any) =>
        `${ch.name}：${ch.appearance || '标准角色外貌'}`
      ).join('；');
      // v6.0.35: 修复Unicode乱码——原行???角色外貌→【角色外貌】
      visualStyleGuide = `【视觉风格】${baseStylePrompt}。【角色外貌】${charFallback}。【色彩方案】根据情节自然调整，保持画面统一。`; // v6.0.35→v6.0.41: 本体已修复，注释残留已清理
    }

    // 将视觉风格指南保存到 series 的 coherence_check 字段（JSONB）
    // v6.0.78: 保留已有coherence_check中的resolution/productionType/isPublic等字段
    const existingCoherence = series.coherence_check || {};
    try {
      await supabase.from('series').update({
        coherence_check: {
          ...existingCoherence, // 保留resolution/productionType/isPublic等已有配置
          visualStyleGuide,
          characterAppearances: characterRows.map((ch: any) => ({
            name: ch.name, role: ch.role, appearance: ch.appearance || '',
          })),
          baseStyle: seriesStyle,
          baseStylePrompt,
          referenceImageUrl, // v6.0.16: 保留参考图URL
          generatedAt: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      }).eq('id', seriesId);
      console.log(`[AI] generate-full-ai: ✅ Visual style guide saved to coherence_check`);
    } catch (sgSaveErr: any) {
      console.warn('[AI] generate-full-ai: Style guide save warning:', sgSaveErr?.message);
    }

    // ===== Step 4: 写入剧集数据 =====
    await updateProgress(4, 6, `正在写入${episodeOutlines.length}集剧集数据...`);

    // 清除旧数据（重试时必须先删除，注意顺序：先子表再父表）
    const { error: delSbErr } = await supabase.from('series_storyboards').delete().eq('series_id', seriesId);
    if (delSbErr) console.warn('[AI] generate-full-ai: delete old storyboards warning:', delSbErr.message);
    const { error: delEpErr } = await supabase.from('series_episodes').delete().eq('series_id', seriesId);
    if (delEpErr) console.warn('[AI] generate-full-ai: delete old episodes warning:', delEpErr.message);

    // v6.0.78: 保存cliffhanger/previousEpisodeLink到key_moment（JSON编码后缀）
    const episodeRows = episodeOutlines.map((ep: any) => {
      const keyMomentsStr = Array.isArray(ep.keyMoments) ? ep.keyMoments.join('; ') : '';
      const cliffhanger = ep.cliffhanger || '';
      const prevLink = ep.previousEpisodeLink || '';
      const metaSuffix = (cliffhanger || prevLink) ? ` ||META:${JSON.stringify({ cliffhanger, previousEpisodeLink: prevLink })}` : '';
      return {
        series_id: seriesId, episode_number: ep.episodeNumber, title: ep.title,
        synopsis: ep.synopsis, growth_theme: ep.growthTheme,
        key_moment: keyMomentsStr + metaSuffix, status: 'draft',
      };
    });

    // 使用 upsert 防止重试时唯一约束冲突 (series_id + episode_number)
    const { data: createdEpisodes, error: epInsertErr } = await supabase
      .from('series_episodes').upsert(episodeRows, { onConflict: 'series_id,episode_number' }).select();

    if (epInsertErr) {
      console.error('[AI] generate-full-ai: Episode insert error:', epInsertErr.message);
      const { error: failUpErr } = await supabase.from('series').update({
        status: 'failed',
        generation_progress: { currentStep: 4, totalSteps: 6, stepName: '剧集写入失败', error: epInsertErr.message, failedAt: new Date().toISOString() },
      }).eq('id', seriesId);
      if (failUpErr) await supabase.from('series').update({ status: 'failed' }).eq('id', seriesId);
      return c.json({ success: false, error: `剧集写入失败: ${epInsertErr.message}` }, 500);
    }

    // ===== Step 5: 为每集生成基础分镜 =====
    await updateProgress(5, 6, '正在生成分镜场景...');
    const scenesPerEp = 6;
    // v6.0.90: 改为按批次立即写DB、释放内存，避免大型系列OOM
    let totalSbInserted = 0;
    let totalSbScenes = 0;
    let accumDialogueFillStats = { filledCount: 0, totalEmpty: 0 };
    let accumDialogueAiEnhanced = 0;
    const sbCamTpl = [
      { cam: '远景', tone: '期待' },
      { cam: '中景', tone: '自然' },
      { cam: '中近景', tone: '认真' },
      { cam: '特写', tone: '紧张' },
      { cam: '中景', tone: '坚定' },
      { cam: '远景', tone: '余韵' },
    ];

    // 获取角色名称列表用于场景描述
    const charNames = characterRows.map((ch: any) => ch.name).filter(Boolean).join('、');

    // v5.6.0: 使用AI为每集生成具体的分镜描述，而非硬编码通用模板
    // v6.0.84: 降至每批2集（原3集prompt过大导致AI超时或截断JSON）
    const SB_BATCH_SIZE = 2;
    const epBatches: any[][] = [];
    for (let bi = 0; bi < episodeOutlines.length; bi += SB_BATCH_SIZE) {
      epBatches.push(episodeOutlines.slice(bi, bi + SB_BATCH_SIZE));
    }

    // v6.0.8: 构建角色外貌卡（用于分镜prompt注入，确保每帧角色外貌一致）
    const charAppearanceBlock = characterRows.map((ch: any) =>
      `- ${ch.name}（${ch.role}）：${ch.appearance || '标准外貌'}`
    ).join('\n');

    // v6.0.8: 追踪已生成的批次，用于传递前集摘要上下文
    let previousBatchSummary = '';

    let sbAiFallback = false;
    let sbConsecutiveAiFails = 0; // v6.0.84: 跟踪连续AI失败次数，>=3次才永久放弃
    // v6.0.86: 生成质量统���
    let statsAiSuccessBatches = 0;
    let statsAiRepairedBatches = 0;
    let statsRetrySuccessBatches = 0;
    let statsFallbackBatches = 0;
    for (let batchIdx = 0; batchIdx < epBatches.length; batchIdx++) {
      const epBatch = epBatches[batchIdx];
      // v6.0.104: 心跳——每批次开始时更新updated_at，防止前端误判为卡住
      // （AI单次调用可达90s，多批次总耗时可超300s；此前心跳仅在首次AI调用前触发一次）
      try { await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', seriesId); } catch { /* non-blocking */ }
      // v6.0.84: ��次级进度更新（前端可实时显示"分镜 第2/5批"）
      await updateProgress(5, 6, `正在生成分镜场景 (第${batchIdx + 1}/${epBatches.length}批, 共${episodeOutlines.length}集)...`, {
        storyboardBatch: batchIdx + 1,
        storyboardTotalBatches: epBatches.length,
        scenesGeneratedSoFar: totalSbScenes,
      });
      let batchAiSuccess = false; // v6.0.84: 本批次AI是否成功
      // v6.0.90: 每批次使用局部数组，处理完立即写DB并释放内存，防止大型系列OOM
      const batchRows: any[] = [];
      if ((VOLCENGINE_API_KEY || ALIYUN_BAILIAN_API_KEY) && !sbAiFallback) { // v6.0.84: 修复——原仅检查ALIYUN导致仅配VOLCENGINE时跳过AI
        // v6.0.84: 提升prompt构建至try外部，使retry块可访问sbPrompt
        const batchEpInfo = epBatch.map((ep: any) => {
          let epLine = `第${ep.episodeNumber}集「${ep.title}」：${ep.synopsis || '未提供'}`;
          if (ep.cliffhanger) epLine += `（伏笔/悬念：${ep.cliffhanger}）`;
          return epLine;
        }).join('\n');

        const contextBlock = previousBatchSummary
          ? `\n【前集摘要——必须承接以下剧情】\n${previousBatchSummary}\n`
          : '';

        // v6.0.115: 风格指南截断从500→1000字符——500字切断角色��貌卡+色彩方案等关键参数，导致不同批次分镜收到的风格信息不完整→风格不一致
        // v6.0.115: 始终注入baseStylePrompt风格DNA，即使有visualStyleGuide也要补充（确保跨批次风格基因一致）
        const styleGuideBlock = visualStyleGuide
          ? `\n【视觉风格指南——所有场景必须遵守】\n${visualStyleGuide.substring(0, 1000)}\n【风格DNA锁定】${baseStylePrompt}\n`
          : `\n【视觉风格】${baseStylePrompt}\n`;

        const cinematographyBlock = getCinematographyBlock(productionType);
        const ptInfo = PRODUCTION_TYPE_PROMPTS[productionType] || PRODUCTION_TYPE_PROMPTS.short_drama;

        // v6.0.78+v6.0.84: 重写分镜prompt——强化衔接连贯性+角色一致性+反套路（提升至try外供retry使用）
        const sbPrompt = `你是一位${ptInfo.label}级别的专业分镜师兼摄影指导，精通视听语言理论。请为以下作品的每集创作${scenesPerEp}个电影级分镜场景描述。

作品标题：${series.title}
故事简介：${series.description || '未提供'}
${series.genre ? `类型：${series.genre}` : ''}
${series.theme ? `主题：${series.theme}` : ''}
${cinematographyBlock}
${styleGuideBlock}
【角色外貌卡——场景描述中必须使用以下外貌特征】
${charAppearanceBlock || '角色待定'}
${contextBlock}
需要创作分镜的剧集：
${batchEpInfo}

请严格按以下JSON格式回复（不要包含markdown标记），对每集返回${scenesPerEp}个场景：
[{"episodeNumber":1,"scenes":[{"sceneNumber":1,"description":"具体场景描述(50-80字,含角色全名+外貌+连续动作3步+环境+光影)","dialogue":"角色全名：具体对话内容(每场景至少1-3���推动剧情的对话,多人对话用换行分隔,格式如:林小雨：我不会放弃的\\n张明：你确定吗)","characters":["本场景出场角色全名1","角色全名2"],"location":"具体地点(如林小雨家的客厅)","timeOfDay":"早晨/上午/中午/下午/傍晚/夜晚","cameraAngle":"近景/中景/远景/全景/特写/俯拍/仰拍","emotionalTone":"情感基调","transitionFromPrevious":"与上一个场景的镜头衔接方式(第1个场景写开场)","endingVisualState":"本场景结束时的画面状态(20-30字,角色姿态+表情+环境)"}]}]

要求：
1. 每个场景描述必须紧扣该集标题和剧情简介，不要写通用描述
2. 描述中必须出现具体角色名和外貌特征（参照角色外貌卡），不要用"主角""配角"等泛称
3. characters字段必须列出本场景所有出场角色的全名，与dialogue中的说话人一致
4. 【对白必填——核心要求】dialogue字段严禁为空！每个场景至少2-4句角色对话，格式"角色全名：对话内容\\n角色全名：回应"。对话须推动剧情、揭示性格或制造冲突，严禁空泛废话。唯一例外：纯动作追逐场景可写"角色名：(内心)独白"。严禁出现未在characters中列出的角色说话
5. 6个场景依次为：开场建立→角色互动→情节推进→冲突/转折→高潮时刻→结尾悬念
6. 描述要具体生动，适合作为AI视频生成的提示词
7. 所有画面风格必须与【视觉风格指南】一致
6. 如果有【前集摘要】，第一个场景必须自然衔接前集结尾
7. 【场景衔接——最重要】相邻场景必须视觉和叙事连贯：
   a. 同一角色跨场景出场时，服装/发型/配饰描述必须完全一致
   b. 场景地点不变时，环境细节（天气/光线/陈设）不能突变
   c. endingVisualState必须与下一场景开头自然衔接——如角色"转身离开教室"则下一场景从"走廊"开始
   d. ��感基调���化必须渐进，禁止跳跃（如温馨不能直接跳暴怒）
   e. transitionFromPrevious描述镜头语言：如"镜头跟随角色移动到YY""时间推移淡入""从特写拉远到全景"
   f. 场景描述的前10个字必须在空间或时间上承接上一场景的endingVisualState
   g. 每个场景的location字段必须具体（如"林小雨家的客厅"而非"室内"），同一地点在不同场景中使用完全相同的location值
   h. 每个场景的timeOfDay必须明确且与上一场景合理衔接（同一场景内不可能从白天跳到深夜）
8. 【画面质量——电影级4要素】description必须含：(a)光线设计(光源方向+色温) (b)构图位置(人物画面位置+前���/背景层次) (c)环境氛围(5感沉浸细节) (d)色彩情绪(主色调与情感映射)。具体如：光线方向（如"窗外暖阳斜照"）、主体动作（如"转身面向镜头"）、环境氛围词（如"宁静的""紧张的"），以确保AI视频生成结果具有电影级画面质感
9. 【动作描写——视频生成关键】将大动作拆成3-4个连续小步骤（如不写"她跳舞"，写"右脚轻点地面→身体缓缓旋转→裙摆随惯性展开→双臂向两侧舒展"），禁止模糊动作词（如"打斗""奔跑"），必须拆解为具体肢体动作
10. 【景别编排节奏】每集场景cameraAngle必须有节奏变化：开场远景→中景互动→中近景情感→特写高潮→中景推进→远景收尾，禁止连续3场景相同景别
11. 【蒙太奇技法】transitionFromPrevious运用专业蒙太奇：对比蒙太奇(贫富/明暗对比)、平行蒙太奇(双线交叉)、隐喻蒙太奇(笼中鸟暗喻束缚)、积累蒙太奇(同类画面叠加)
12. 【严禁重复——最关键】(a)不同场景的description禁止出现相同或近似的动作/对话/情节，每个场景必须推进新的剧情事件；(b)dialogue字段中同一角色不可在不同场景重复相似语句；(c)同一集内禁止出现相同location+相同动作的场景组合；(d)如果上一场景角色"对话"了，下一场景必须是"行动"而非再次"对话"
13. 【角色语言个性化】每个角色的对话风格必须与其性格一致且有辨识度——如内向角色说话简短含蓄、外向角色说话热情直白、反派角色语气阴沉或傲慢。dialogue必须标注说话人全名(如"林小雨：我不会放弃的")，严禁出现未被定义的角色突然说话
14. 【中国审美与价值观】人物形象优美端庄、气质自然不夸张；情节传递正向价值观(勇气/善良/成长/责任)；场景环境精致美��；避免低俗/恐怖/暴力等不适内容`;

        // v6.0.112: 修复sbPrompt中情感基调/前景背景层次的Unicode乱码
        const sbPromptFixed = sbPrompt
          .replace(/d\. .{1,6}感基调变化必须渐进/, 'd. 情感基调变化必须渐进')
          .replace(/人物画面位置\+前.{1,6}\/背景层次/, '人物画面位置+前景/背景层次');
        try {
          // v6.0.84: timeout 45s→90s, max_tokens 6000→8000（2集×6场景结构化JSON需更多token+时间）
          const sbAiResult = await callAI({
            messages: [{ role: 'user', content: sbPromptFixed }],
            tier: 'heavy',
            temperature: 0.75,
            max_tokens: 8000,
            timeout: 90000,
          });
          {
            const sbContent = sbAiResult.content;
            // v6.0.84: 使用repairTruncatedStoryboardJSON替代简单JSON.parse，支持截断恢复
            const { parsed: sbParsed, repaired: sbRepaired, scenesRecovered: sbRecovered } = repairTruncatedStoryboardJSON(sbContent);
            if (sbParsed) {
              if (sbRepaired) console.log(`[AI] generate-full-ai: JSON was truncated, repaired with ${sbRecovered} scenes recovered`);
              const epScenes = Array.isArray(sbParsed) ? sbParsed : (sbParsed.episodes || [sbParsed]);
              for (const epData of epScenes) {
                const epNum = epData.episodeNumber || epData.episode_number;
                const scenes = epData.scenes || (epData.sceneNumber ? [epData] : []); // v6.0.84: 兼容修复后的扁平scene
                for (let si = 0; si < Math.min(scenes.length, scenesPerEp); si++) {
                  const scene = scenes[si];
                  const camTpl = sbCamTpl[si % sbCamTpl.length];
                  const sceneCharacters = scene.characters || [];
                  batchRows.push({
                    series_id: seriesId, episode_number: epNum, scene_number: scene.sceneNumber || scene.scene_number || si + 1,
                    description: scene.description || '', dialogue: scene.dialogue || '',
                    characters: sceneCharacters,
                    location: scene.location || '',
                    time_of_day: scene.timeOfDay || scene.time_of_day || '',
                    camera_angle: scene.cameraAngle || scene.camera_angle || camTpl.cam,
                    duration: 10, emotional_tone: scene.emotionalTone || scene.emotional_tone || camTpl.tone, status: 'draft',
                  });
                }
              }
              console.log(`[AI] generate-full-ai: AI storyboards batch ok, batch rows=${batchRows.length}`);
              batchAiSuccess = true; // v6.0.84
              if (sbRepaired) statsAiRepairedBatches++; else statsAiSuccessBatches++; // v6.0.86
              sbConsecutiveAiFails = 0;
            } else {
              console.warn('[AI] generate-full-ai: Storyboard JSON parse+repair all failed');
            }
          }
        } catch (sbAiErr: any) {
          console.warn('[AI] generate-full-ai: Storyboard AI error:', truncateErrorMsg(sbAiErr));
        }

        // v6.0.84: 首次失败时重试1次（降低temperature提高JSON输出稳定性）
        if (!batchAiSuccess) {
          sbConsecutiveAiFails++;
          if (sbConsecutiveAiFails >= 3) {
            console.warn(`[AI] generate-full-ai: ${sbConsecutiveAiFails} consecutive AI failures, permanently switching to fallback`);
            sbAiFallback = true;
          } else {
            console.log(`[AI] generate-full-ai: Batch ${batchIdx} AI failed (attempt ${sbConsecutiveAiFails}), retrying with lower temperature...`);
            try {
              await new Promise(r => setTimeout(r, 2000)); // 短暂等待
              // v6.0.104: ���试前心跳——retry AI call也可达90s
              try { await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', seriesId); } catch { /* non-blocking */ }
              const retryResult = await callAI({
                messages: [{ role: 'user', content: sbPromptFixed }], // v6.0.115: 修复——原使用sbPrompt(含Unicode乱码)而非sbPromptFixed
                tier: 'heavy',
                temperature: 0.5, // 降低temperature提高稳定性
                max_tokens: 8000,
                timeout: 90000,
              });
              const retryContent = retryResult.content;
              // v6.0.84: 重试也使用repairTruncatedStoryboardJSON
              const { parsed: retryParsed, repaired: retryRepaired } = repairTruncatedStoryboardJSON(retryContent);
              if (!retryParsed) throw new Error('Retry JSON parse+repair all failed');
              if (retryRepaired) console.log(`[AI] generate-full-ai: Retry JSON was truncated but repaired`);
              const retryEpScenes = Array.isArray(retryParsed) ? retryParsed : (retryParsed.episodes || [retryParsed]);
              for (const epData of retryEpScenes) {
                const epNum = epData.episodeNumber || epData.episode_number;
                const scenes = epData.scenes || (epData.sceneNumber ? [epData] : []);
                for (let si = 0; si < Math.min(scenes.length, scenesPerEp); si++) {
                  const scene = scenes[si];
                  const camTpl = sbCamTpl[si % sbCamTpl.length];
                  const sceneCharacters = scene.characters || [];
                  batchRows.push({
                    series_id: seriesId, episode_number: epNum, scene_number: scene.sceneNumber || scene.scene_number || si + 1,
                    description: scene.description || '', dialogue: scene.dialogue || '',
                    characters: sceneCharacters, location: scene.location || '',
                    time_of_day: scene.timeOfDay || scene.time_of_day || '',
                    camera_angle: scene.cameraAngle || scene.camera_angle || camTpl.cam,
                    duration: 10, emotional_tone: scene.emotionalTone || scene.emotional_tone || camTpl.tone, status: 'draft',
                  });
                }
              }
              batchAiSuccess = true;
              sbConsecutiveAiFails = 0;
              statsRetrySuccessBatches++; // v6.0.86
              console.log(`[AI] generate-full-ai: ✅ Retry succeeded for batch ${batchIdx}, batch rows=${batchRows.length}`);
            } catch (retryErr: any) {
              console.warn(`[AI] generate-full-ai: Retry also failed for batch ${batchIdx}:`, truncateErrorMsg(retryErr));
            }
          }
        }
      }

      // v6.0.87: Fallback——只要AI+retry都���败就立即生成fallback分镜（不再等3次连续失败）
      // 旧逻辑: sbAiFallback需>=3次连续失败才触发，导致前1-2批零分镜（短剧致命bug）
      if (!batchAiSuccess) {
        statsFallbackBatches++; // v6.0.86
        for (const ep of epBatch) {
          const alreadyGen = batchRows.some((row: any) => row.episode_number === ep.episodeNumber);
          if (alreadyGen) continue;
          const syn = ep.synopsis || ep.title || '���事展开';
          // v6.0.112: 修复syn回退值中的Unicode乱码（故事展开）
          const synFixed = (ep.synopsis || ep.title) || '故事展开';
          const hero = characterRows[0]?.name || '主角';
          const ally = characterRows[1]?.name || '伙伴';
          const fallbackScenes = [
            { desc: `${series.title}的世界中，${hero}登场，${synFixed.substring(0, 25)}的序幕徐缓拉开`, cam: '远景', tone: '期待' },
            { desc: `${hero}与${ally}相遇，围绕「${ep.title}」展开对话和互动`, cam: '中景', tone: '自然' },
            { desc: `「${ep.title}」核心事件展开，${hero}面临重要抉择，${synFixed.substring(0, 30)}`, cam: '中近景', tone: '认真' },
            { desc: `剧情急转，${hero}遭遇意外冲突，「${ep.title}」的关键转折点到来`, cam: '特写', tone: '紧张' },
            { desc: `${hero}做出了一个出人意料的决定，${ally}试图阻止但为时已晚`, cam: '中景', tone: '坚定' },
            { desc: `尘埃落定，${hero}独自站在空旷的场景中，远处传来一个意想不到的声音`, cam: '远景', tone: '余韵' },
          ];
          for (let fs = 0; fs < scenesPerEp; fs++) {
            const ft = fallbackScenes[fs % fallbackScenes.length];
            batchRows.push({
              series_id: seriesId, episode_number: ep.episodeNumber, scene_number: fs + 1,
              description: `${ep.title} - 场景${fs + 1}：${ft.desc}`, dialogue: '', location: '',
              camera_angle: ft.cam, duration: 10, emotional_tone: ft.tone, status: 'draft',
            });
          }
        }
      }

      // v6.0.8: 更新前集摘要——将当前批次的剧��概要追加，供下一批使用
      const batchSummary = epBatch.map((ep: any) => {
        let summary = `第${ep.episodeNumber}集「${ep.title}」：${(ep.synopsis || '').substring(0, 40)}`;
        if (ep.cliffhanger) summary += `→悬念：${ep.cliffhanger.substring(0, 30)}`;
        return summary;
      }).join('；');
      previousBatchSummary = previousBatchSummary
        ? `${previousBatchSummary}；${batchSummary}`
        : batchSummary;
      // 控制摘要长度，避免token爆炸（保留最近6集的摘要）
      const summaryParts = previousBatchSummary.split('；');
      if (summaryParts.length > 6) {
        previousBatchSummary = summaryParts.slice(-6).join('；');
      }

      // v6.0.89: 每批次立即处理并写DB，释放内存（防止大型系列OOM）
      if (batchRows.length > 0) {
        // v6.0.85: 空dialogue模板补填（per-batch）
        const batchFillStats = detectAndFillEmptyDialogues(batchRows, characterRows, episodeOutlines);
        if (batchFillStats.totalEmpty > 0) {
          console.log(`[AI] generate-full-ai: Batch ${batchIdx + 1} dialogue template-fill: ${batchFillStats.filledCount}/${batchFillStats.totalEmpty} filled`);
        }
        accumDialogueFillStats.filledCount += batchFillStats.filledCount;
        accumDialogueFillStats.totalEmpty += batchFillStats.totalEmpty;

        // v6.0.86: AI dialogue智能润色（per-batch，best-effort）
        if (batchFillStats.filledCount > 0 && (VOLCENGINE_API_KEY || ALIYUN_BAILIAN_API_KEY)) {
          try {
            const scenesToEnhance = batchRows
              .filter((row: any) => row.dialogue && (row.dialogue.includes('：（看向远方）') || row.dialogue.includes('这件事没有退路') || row.dialogue.includes('说来听听') || row.dialogue.includes('谢谢你一直陪在我身边') || row.dialogue.includes('总觉得有什么不对劲') || row.dialogue.includes('原来真相是这样')))
              .slice(0, 12);
            if (scenesToEnhance.length > 0) {
              const dlgCharNames = characterRows.map((ch: any) => `${ch.name}（${ch.role}）`).join('、');
              const sceneSummaries = scenesToEnhance.map((s: any, i: number) =>
                `场景${i + 1}[EP${s.episode_number}S${s.scene_number}]: ${(s.description || '').substring(0, 60)} | 情感:${s.emotional_tone || '自然'}`
              ).join('\n');
              const dialoguePrompt = `你是一位专业编剧。请为以下${scenesToEnhance.length}个场景各生成2-3句简短对话（每句不超过20字）。\n角色：${dlgCharNames}\n作品标题：${series.title}\n\n${sceneSummaries}\n\n要求：\n- 对话必须符合场景描述和情感基调\n- 每个场景的对话用"角色名：对话内容"格式，多句用换行分隔\n- 对话要自然、口语化，有情感张力\n- 返回JSON数组，每项格式：{"index":场景序号(从1开始), "dialogue":"对话��容"}\n\n只返回JSON数组，不要其他内容。`;
              try {
                // v6.0.104: 对话润色前心跳
                try { await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', seriesId); } catch { /* non-blocking */ }
                const dialogueResult = await callAI({
                  messages: [
                    { role: 'system', content: '你是专业影视编��，擅长写自然、有感情的角色对话。只返回JSON。' },
                    { role: 'user', content: dialoguePrompt },
                  ],
                  tier: 'light',
                  temperature: 0.8,
                  max_tokens: 2000,
                  timeout: 30000,
                });
                const dlgContent = dialogueResult.content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
                const dlgParsed = JSON.parse(dlgContent);
                if (Array.isArray(dlgParsed)) {
                  let batchEnhanced = 0;
                  for (const item of dlgParsed) {
                    const idx = (item.index || 0) - 1;
                    if (idx >= 0 && idx < scenesToEnhance.length && item.dialogue && item.dialogue.trim().length > 3) {
                      scenesToEnhance[idx].dialogue = item.dialogue.trim();
                      batchEnhanced++;
                    }
                  }
                  accumDialogueAiEnhanced += batchEnhanced;
                  console.log(`[AI] generate-full-ai: Batch ${batchIdx + 1} dialogue AI-enhanced: ${batchEnhanced}/${scenesToEnhance.length}`);
                }
              } catch (dlgAiErr: any) {
                console.warn(`[AI] generate-full-ai: Batch ${batchIdx + 1} dialogue AI enhancement failed:`, truncateErrorMsg(dlgAiErr));
              }
            }
          } catch (dlgErr: any) {
            console.warn(`[AI] generate-full-ai: Batch ${batchIdx + 1} dialogue enhancement outer error:`, dlgErr?.message);
          }
        }

        // 立即写入DB并释放当前批次内存
        for (let i = 0; i < batchRows.length; i += 50) {
          const chunk = batchRows.slice(i, i + 50);
          const { data: ins, error: sbErr } = await supabase.from('series_storyboards').upsert(chunk, { onConflict: 'series_id,episode_number,scene_number' }).select();
          if (sbErr) console.warn(`[AI] generate-full-ai: Batch ${batchIdx + 1} storyboard write error:`, sbErr.message);
          else totalSbInserted += ins?.length || 0;
        }
        totalSbScenes += batchRows.length;
        console.log(`[AI] generate-full-ai: Batch ${batchIdx + 1} wrote ${batchRows.length} rows (total inserted=${totalSbInserted})`);
      }
    }

    // v6.0.118: 参考图→首帧注入——将referenceImageUrl预设为E1S1的image_url
    // 效果: E1S2+生成视频时，prev-scene查询直接命中E1S1.image_url（无需走style anchor回退路径）
    // 形成完整的i2v链: referenceImageUrl→E1S1→E1S2→...→E{n}S{m}，风格从首帧逐场景传递
    // 当E1S1视频生成完成后，volcengine/status回调会自动用真实thumbnail覆盖此预设值
    if (referenceImageUrl && totalSbInserted > 0) {
      try {
        await supabase.from('series_storyboards')
          .update({ image_url: referenceImageUrl, updated_at: new Date().toISOString() })
          .eq('series_id', seriesId)
          .eq('episode_number', 1)
          .eq('scene_number', 1);
        console.log(`[AI] generate-full-ai: 🖼️ Reference image pre-set as E1S1 image_url → bootstraps i2v chain for all subsequent scenes`);
      } catch (e: any) {
        console.warn(`[AI] generate-full-ai: E1S1 image_url pre-set failed (non-blocking):`, e?.message);
      }
    }

    // ===== Step 6: 完成 =====
    // v6.0.86: 汇总生成质量统计
    const genStats = {
      totalBatches: epBatches.length,
      aiSuccessBatches: statsAiSuccessBatches,
      aiRepairedBatches: statsAiRepairedBatches,
      retrySuccessBatches: statsRetrySuccessBatches,
      fallbackBatches: statsFallbackBatches,
      totalScenes: totalSbScenes,
      emptyDialogues: accumDialogueFillStats.totalEmpty,
      templateFilled: accumDialogueFillStats.filledCount,
      aiEnhancedDialogues: accumDialogueAiEnhanced,
    };
    console.log(`[AI] generate-full-ai: 📊 Quality stats: ${JSON.stringify(genStats)}`);

    // �� 关键修复：生成完成后设为 completed，而非 in-progress
    // 前端 useSeries 和 SeriesCreationPanel 依赖 completed 状态来触发视频生成
    const { error: completeErr } = await supabase.from('series').update({
      status: 'completed',
      total_episodes: episodeOutlines.length,
      current_step: 6,
      total_steps: 6,
      generation_progress: {
        currentStep: 6, totalSteps: 6, stepName: '创作完成',
        completedAt: new Date().toISOString(),
        qualityStats: genStats, // v6.0.86: 质量统计持久化
      },
      updated_at: new Date().toISOString(),
    }).eq('id', seriesId);

    // 降级：如果有 generation_progress 列问题，至少保证 status=completed
    if (completeErr) {
      console.warn('[AI] generate-full-ai: complete update with progress failed:', completeErr.message, '-> fallback');
      await supabase.from('series').update({
        status: 'completed',
        total_episodes: episodeOutlines.length,
        updated_at: new Date().toISOString(),
      }).eq('id', seriesId);
    }

    // v6.0.91: 修复——旧变量名 dialogueAiEnhanced/dialogueFillStats 在v6.0.90重命名后未更新，导致ReferenceError
    // ReferenceError在catch块中将status='completed'覆写为status='failed'（所有成功生成均变为失败）
    console.log(`[AI] generate-full-ai: ✅ Done! ${createdChars?.length || 0} chars, ${createdEpisodes?.length || 0} eps, ${totalSbInserted} sbs (AI:${statsAiSuccessBatches} repair:${statsAiRepairedBatches} retry:${statsRetrySuccessBatches} fb:${statsFallbackBatches}) dlg:${accumDialogueAiEnhanced}ai/${accumDialogueFillStats.filledCount}tpl/${accumDialogueFillStats.totalEmpty}empty`);
    return c.json({
      success: true,
      data: {
        charactersCreated: createdChars?.length || 0,
        episodesCreated: createdEpisodes?.length || 0,
        storyboardsCreated: totalSbInserted,
        episodes: toCamelCase(createdEpisodes || []),
        characters: toCamelCase(createdChars || []),
        qualityStats: genStats, // v6.0.86
      },
      fallback: !ALIYUN_BAILIAN_API_KEY,
    });
  } catch (error: any) {
    console.error('[AI] generate-full-ai error:', truncateErrorMsg(error));
    try {
      // 尝试写入失败详情
      const { error: failErr } = await supabase.from('series').update({
        status: 'failed',
        generation_progress: { currentStep: 0, totalSteps: 6, stepName: '生成异常', error: truncateErrorMsg(error), failedAt: new Date().toISOString() },
      }).eq('id', c.req.param('id'));
      // 降级：只设 status=failed
      if (failErr) {
        await supabase.from('series').update({ status: 'failed' }).eq('id', c.req.param('id'));
      }
    } catch (statusErr: any) {
      console.warn('[AI] generate-full-ai: failed to write failure status to DB:', statusErr?.message);
    }
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ------------------------------------------------------------------
//  [L] AI 路由 — 剧集大纲 / 故事增强 / 图片生成 / prompt润色
// ------------------------------------------------------------------

// ==================== AI 路由 ====================

// AI生成剧集大纲（被 aiEpisodeGenerator.ts 后台调用）
app.post(`${PREFIX}/ai/generate-episodes`, async (c) => {
  try {
    const body = await c.req.json();
    const { seriesTitle, seriesDescription, genre, theme, targetAudience } = body;
    const totalEpisodes = Math.min(Math.max(parseInt(body.totalEpisodes) || 10, 1), 50);

    if (!seriesTitle || !seriesDescription) {
      return c.json({ success: false, error: '标题和描述不能为空' }, 400);
    }

    // 无AI key时使用模板fallback
    if (!ALIYUN_BAILIAN_API_KEY) {
      const titles = ['命运的开端', '初次交锋', '暗流涌动', '转折点', '真相初现', '并肩作战', '信任危机', '绝地反击', '最终决战', '尘埃落定'];
      const episodes = Array.from({ length: Math.min(totalEpisodes, 30) }, (_, i) => {
        const ep = i + 1;
        return {
          episodeNumber: ep,
          title: ep <= 10 ? titles[i] : `第${ep}集`,
          synopsis: `第${ep}集：故事继续发展，角色面对新的挑战和抉择。`,
          growthTheme: '成长与蜕变',
          keyMoments: [`关键场景${ep}A`, `关键场景${ep}B`],
        };
      });
      return c.json({ success: true, episodes, fallback: true });
    }

    const prompt = `你是一位专业的漫剧编剧。请根据以下信息，为漫剧创作${totalEpisodes}集的详细大纲。

漫剧标题：${seriesTitle}
剧集简介：${seriesDescription}
${genre ? `��型：${genre}` : ''}
${theme ? `主题：${theme}` : ''}
${targetAudience ? `目标受众：${targetAudience}` : ''}

【最重要的规则】你的所有创作内容必须100%围绕上面给出的漫剧标题和简介来展开！
- 禁止编造与标题和简介无关的故事（如快递员、时空穿越等与用户主题无关的内容）
- 角色名、职业、背景必须与用户提供的标题/简介/类型保持一致
- 每一集的剧情都必须是用户给定主题的自然延伸

请严格按以��JSON格式回复（不要包含markdown标记），返回一个数组：
[{"episodeNumber":1,"title":"集标题","synopsis":"50-80字的集内容简介","growthTheme":"本集的成长主题","keyMoments":["关键场景1","关键场景2"]}]

要求：
1. 每集标题简洁有��，必须与漫剧主题相关
2. 故事线有递进和转折，前期建立世界观，中期发展冲突，后期走向高潮和结局
3. 所有角色、事件、场景必须紧扣用户给定的标题「${seriesTitle}」
4. 如果用户提供了具体简介，每集剧情必须是该简介故事的具体展开`;

    // v6.0.19: callAI 多模型路由（heavy tier — 分集详情生成）
    const aiResult = await callAI({
      messages: [{ role: 'user', content: prompt }],
      tier: 'heavy',
      temperature: 0.8,
      max_tokens: 6000,
      timeout: 120000,
    });
    const content = aiResult.content;

    let episodes: any[] = [];
    try {
      const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(cleaned);
      episodes = Array.isArray(parsed) ? parsed : (parsed.episodes || []);
    } catch {
      console.warn('[AI] generate-episodes: JSON parse failed, using fallback');
      episodes = Array.from({ length: Math.min(totalEpisodes, 10) }, (_, i) => ({
        episodeNumber: i + 1, title: `第${i + 1}集`, synopsis: `第${i + 1}集内容`, growthTheme: '成长', keyMoments: [],
      }));
    }

    if (episodes.length === 0) {
      return c.json({ success: false, error: 'AI未返回有效剧集内容' }, 500);
    }

    episodes = episodes.map((ep: any, idx: number) => ({
      episodeNumber: ep.episodeNumber || ep.episode_number || idx + 1,
      title: ep.title || `第${idx + 1}集`,
      synopsis: ep.synopsis || ep.description || '',
      growthTheme: ep.growthTheme || ep.growth_theme || '',
      keyMoments: ep.keyMoments || ep.key_moments || [],
    }));

    return c.json({ success: true, episodes });
  } catch (error: any) {
    console.error('[AI] generate-episodes error:', truncateErrorMsg(error));
    if (error.name === 'AbortError') return c.json({ success: false, error: 'AI生成超时，请重试' }, 504);
    return c.json({ success: false, error: error.message }, 500);
  }
});

app.post(`${PREFIX}/ai/generate-story-enhanced`, async (c) => {
  try {
    const body = await c.req.json();
    if (!ALIYUN_BAILIAN_API_KEY) {
      const fallback: Record<string, string[]> = {
        anime: ['在樱花飘落的校园里，一位拥有神秘力量的少女遇见了来自异世界的守护者，一场关于命运与友情的冒险即将开始。', '魔法学院新学期开学，转学生小雨发现自己的室友竟然是传说中的天才魔法师。'],
        comic: ['超级英雄白天是普通上班族张明，夜晚化身守护城市的暗影侠客，在两种身份间艰难平衡。', '侦探林雪拥有读心术却遇到第一个读不懂的人，这背后隐藏着惊天秘密。'],
        cyberpunk: ['2077年霓虹都市中，黑客少女���芯发现了巨型公司隐藏的黑暗真相，她必须在24小时内逃离追捕。'],
        fantasy: ['古老魔法森林深处，年轻精灵阿尔发现了失落已久的龙之石，一场史诗般的冒险即将开始。'],
        realistic: ['退役运动员重返训练场，为了最后一次证明自己，他克服伤痛和质疑，向梦想发起冲击。'],
      };
      const stories = fallback[body.style] || fallback.anime;
      return c.json({ success: true, story: stories[Math.floor(Math.random() * stories.length)], isFallback: true });
    }
    const { existingText, style, duration } = body;
    const prompt = `你是一位专业的漫画编剧。请创作一段${style || '动漫'}风格的短剧故���。

${existingText ? `用户创意参考：${existingText}\n请基于用户提供的创意深入展开，保持原有世界观和角色设定。` : '请自由创作一个新颖独特的故事，避免俗套的快递员、穿越时空等常见桥段。'}

要求：
1. 故事要有明确的主角名字（不要用泛称）、具体场景和戏剧冲突
2. 时长约${duration || 5}秒的视频场景描述
3. 描述要具体生动，包含视觉画面元素（人物动作、表情、环境细节）
4. 直接给出故事描述，不要包含任何格式标记`;
    // v6.0.19: callAI 多模型路由（medium tier — 故事创作）
    const aiResult = await callAI({
      messages: [{ role: 'user', content: prompt }],
      tier: 'medium',
      temperature: 0.8,
      timeout: 60000,
    });
    const story = aiResult.content;
    if (!story) return c.json({ success: false, message: 'AI未返回有效内容' }, 500);
    return c.json({ success: true, story });
  } catch (error: any) {
    console.error('[AI] Story error:', truncateErrorMsg(error));
    return c.json({ success: false, message: error.message }, 500);
  }
});

app.post(`${PREFIX}/ai/text-to-image`, async (c) => {
  try {
    if (!VOLCENGINE_API_KEY) return c.json({ success: false, message: 'VOLCENGINE_API_KEY未配置' }, 500);
    const { prompt } = await c.req.json();
    if (!prompt) return c.json({ success: false, message: '提示词不能为空' }, 400);
    const resp = await fetchWithTimeout('https://ark.cn-beijing.volces.com/api/v3/images/generations', {
      method: 'POST', headers: { 'Authorization': `Bearer ${VOLCENGINE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'doubao-seedream-3-0-t2i-250415', prompt, size: '1024x1024' }),
    }, 60000);
    if (!resp.ok) return c.json({ success: false, message: `图片生成失败: ${resp.status}` }, resp.status);
    const result = await resp.json();
    const imageUrl = result.data?.[0]?.url || '';
    if (!imageUrl) return c.json({ success: false, message: '未获��到图片' }, 500);
    return c.json({ success: true, imageUrl });
  } catch (error: any) { console.error('[POST /ai/text-to-image] Error:', error); return c.json({ success: false, message: error.message }, 500); }
});

app.post(`${PREFIX}/ai/aliyun/text-to-image-sync`, async (c) => {
  try {
    if (!ALIYUN_BAILIAN_API_KEY) return c.json({ success: false, message: 'ALIYUN_BAILIAN_API_KEY未配置' }, 500);
    const { prompt, size = '1024*1024', style = '<auto>' } = await c.req.json();
    if (!prompt) return c.json({ success: false, message: '提示词不能为空' }, 400);
    const resp = await fetchWithTimeout(DASHSCOPE_IMAGE_URL, {
      method: 'POST', headers: { 'Authorization': `Bearer ${ALIYUN_BAILIAN_API_KEY}`, 'Content-Type': 'application/json', 'X-DashScope-Async': 'enable' },
      body: JSON.stringify({ model: 'wanx-v1', input: { prompt }, parameters: { size, style, n: 1 } }),
    }, 60000);
    if (!resp.ok) return c.json({ success: false, message: `通义图片生成失败: ${resp.status}` }, resp.status);
    const result = await resp.json();
    const aiTaskId = result.output?.task_id;
    if (!aiTaskId) return c.json({ success: false, message: '未获取到任务ID' }, 500);
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const pr = await fetch(`${DASHSCOPE_TASKS_BASE_URL}/${aiTaskId}`, { headers: { 'Authorization': `Bearer ${ALIYUN_BAILIAN_API_KEY}` } });
      if (pr.ok) {
        const pd = await pr.json();
        if (pd.output?.task_status === 'SUCCEEDED') { const iu = pd.output?.results?.[0]?.url || ''; if (iu) return c.json({ success: true, imageUrl: iu }); }
        if (pd.output?.task_status === 'FAILED') return c.json({ success: false, message: '图片生成失败' }, 500);
      }
    }
    return c.json({ success: false, message: '图片生成超时' }, 504);
  } catch (error: any) { console.error('[POST /ai/aliyun/text-to-image-sync] Error:', error); return c.json({ success: false, message: error.message }, 500); }
});

app.post(`${PREFIX}/ai/polish-image-prompt`, async (c) => {
  try {
    if (!VOLCENGINE_API_KEY && !ALIYUN_BAILIAN_API_KEY) return c.json({ success: false, message: 'AI服务未配置' }, 500);
    const { prompt } = await c.req.json();
    if (!prompt) return c.json({ success: false, message: '提示词不能为空' }, 400);
    // v6.0.19: callAI 多模型路由（light tier — 提示词润色）
    const aiResult = await callAI({
      messages: [
        { role: 'system', content: '你是AI图片提示词优化师。将以下提示词优化为详细英文描述，适合AI图片生成。只输出英文提示词。' },
        { role: 'user', content: prompt },
      ],
      tier: 'light',
      temperature: 0.7,
      timeout: 30000,
    });
    return c.json({ success: true, polishedPrompt: aiResult.content || prompt });
  } catch (error: any) { console.error('[POST /ai/polish-image-prompt] Error:', error); return c.json({ success: false, message: error.message }, 500); }
});

// ==================== 社区漫剧系列列表 ====================

app.get(`${PREFIX}/community/series`, async (c) => {
  // v6.0.8-refactor: batch query optimization — 6 fixed queries instead of N*6
  try {
    const page = Math.max(parseInt(c.req.query('page') || '1') || 1, 1);
    const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '20') || 20, 1), 100);
    const sort = c.req.query('sort') || 'latest';
    const search = c.req.query('search') || '';
    const userPhone = c.req.query('userPhone') || '';
    const since = c.req.query('since') || '';
    // v6.0.34: Over-fetch 3x to compensate for completedEpisodes post-filter
    // Each page scans a non-overlapping DB window of size limit*3, then takes first `limit` after filtering
    const OVERFETCH_RATIO = 3;
    const dbOffset = (page - 1) * limit * OVERFETCH_RATIO;
    const dbFetchLimit = limit * OVERFETCH_RATIO;

    // v6.0.23: select specific fields — drop story_outline (large JSONB) from community list
    // v6.0.83: re-add coherence_check for aspectRatio extraction (paged ≤20 items, overhead minimal)
    let query = supabase
      .from('series')
      .select('id, title, description, genre, style, status, cover_image_url, total_episodes, user_phone, created_at, updated_at, coherence_check', { count: 'exact' })
      .in('status', ['completed', 'published', 'in-progress']);

    // v6.0.70: 排除用户设为私有的作品（coherence_check->>'isPublic' = 'false' 排除）
    // 三种情况视为公开：coherence_check 为 NULL、isPublic 键不存在、isPublic != false
    query = query.or('coherence_check.is.null,coherence_check->>isPublic.is.null,coherence_check->>isPublic.neq.false');

    if (since) {
      query = query.gt('created_at', since);
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    if (sort === 'popular') {
      // v6.0.27: series表无views列，popular暂按created_at降序（后续可改为likes count排序）
      query = query.order('created_at', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    if (!since) {
      query = query.range(dbOffset, dbOffset + dbFetchLimit - 1);
    }

    const { data: seriesList, error, count } = await queryWithRetry(
      () => query,
      'getCommunitySeries'
    );

    if (error) {
      console.error('[Community] Series list error:', truncateErrorMsg(error));
      return c.json({ success: false, error: error.message, data: [], total: 0 }, 500);
    }

    if (!seriesList || seriesList.length === 0) {
      return c.json({ success: true, data: [], total: 0, page, limit, hasMore: false });
    }

    // v6.0.8-refactor: batch query optimization (6 fixed queries instead of N*6)
    const seriesIds = seriesList.map((s: any) => s.id);
    const uniqueUserPhones = [...new Set(seriesList.map((s: any) => s.user_phone).filter(Boolean))] as string[];

    // 1. 批量获取所有系列的剧集
    const { data: allEpisodesBatch, error: batchEpErr } = await supabase
      .from('series_episodes')
      .select('series_id, id, episode_number, title, synopsis, status, total_duration, thumbnail_url, merged_video_url')
      .in('series_id', seriesIds)
      .order('episode_number', { ascending: true });
    if (batchEpErr) console.warn('[Community] Batch episodes query error:', truncateErrorMsg(batchEpErr));
    const episodesMap = new Map<string, any[]>();
    for (const ep of (allEpisodesBatch || [])) {
      const list = episodesMap.get(ep.series_id) || [];
      list.push(ep);
      episodesMap.set(ep.series_id, list);
    }

    // v6.0.37: 批量获取封面回退——分镜image_url/thumbnail_url → video_tasks缩略图
    const coverFallbackMap = new Map<string, string>();
    const seriesNeedingCover = seriesList.filter((s: any) => !s.cover_image_url);
    if (seriesNeedingCover.length > 0) {
      const needCoverIds = seriesNeedingCover.map((s: any) => s.id);
      // Step 1: storyboards 的 image_url
      const { data: sbImages } = await supabase
        .from('series_storyboards')
        .select('series_id, image_url')
        .in('series_id', needCoverIds)
        .not('image_url', 'is', null)
        .order('episode_number', { ascending: true })
        .order('scene_number', { ascending: true });
      for (const sb of (sbImages || [])) {
        const imgUrl = sb.image_url;
        if (imgUrl && !coverFallbackMap.has(sb.series_id)) {
          coverFallbackMap.set(sb.series_id, imgUrl);
        }
      }
      // Step 2: video_tasks 缩略图（最可靠的来源——volcengine自动生成）
      const stillNeedCover = needCoverIds.filter((id: string) => !coverFallbackMap.has(id));
      if (stillNeedCover.length > 0) {
        const { data: taskThumbs } = await supabase
          .from('video_tasks')
          .select('generation_metadata, thumbnail')
          .eq('status', 'completed')
          .not('thumbnail', 'is', null)
          .filter('generation_metadata->>type', 'eq', 'storyboard_video')
          .order('created_at', { ascending: true })
          .limit(200);
        for (const t of (taskThumbs || [])) {
          const sid = t.generation_metadata?.seriesId;
          if (sid && stillNeedCover.includes(sid) && t.thumbnail && !coverFallbackMap.has(sid)) {
            coverFallbackMap.set(sid, t.thumbnail);
          }
        }
      }
    }

    // 2-3. 批量获取每个系列的点赞数和评论数（head:true count聚合，不传输行数据）
    // v6.0.29: 替代原先fetch-all-rows-then-count-in-JS方案，消除热门系列数千行likes/comments的网络传输
    const likesCountMap = new Map<string, number>();
    const commentsCountMap = new Map<string, number>();
    const [likeCountResults, commentCountResults] = await Promise.all([
      Promise.all(seriesIds.map((id: string) =>
        supabase.from('likes').select('*', { count: 'exact', head: true }).eq('work_id', id)
      )),
      Promise.all(seriesIds.map((id: string) =>
        supabase.from('comments').select('*', { count: 'exact', head: true }).eq('work_id', id)
      )),
    ]);
    seriesIds.forEach((id: string, i: number) => {
      likesCountMap.set(id, likeCountResults[i].count || 0);
      commentsCountMap.set(id, commentCountResults[i].count || 0);
    });

    // 4. 批量获取当前用户的点赞状态
    const userLikesSet = new Set<string>();
    if (userPhone) {
      const { data: userLikesData } = await supabase
        .from('likes').select('work_id').in('work_id', seriesIds).eq('user_phone', userPhone);
      for (const like of (userLikesData || [])) userLikesSet.add(like.work_id);
    }

    // 5. 批量获取当前用户的续看进度
    const viewHistoryMap = new Map<string, any>();
    if (userPhone) {
      // v6.0.24: 仅需续看进度字段
      const { data: viewHistories } = await supabase
        .from('viewing_history').select('series_id, last_episode, progress').in('series_id', seriesIds).eq('user_phone', userPhone);
      for (const vh of (viewHistories || [])) viewHistoryMap.set(vh.series_id, vh);
    }

    // 6. 批量获取创建用户昵称
    const userNicknameMap = new Map<string, string>();
    if (uniqueUserPhones.length > 0) {
      const { data: usersData } = await supabase
        .from('users').select('phone, nickname').in('phone', uniqueUserPhones);
      for (const u of (usersData || [])) userNicknameMap.set(u.phone, u.nickname || '');
    }

    // 组装结果（纯内存操作、零DB调用）
    const enrichedSeries = seriesList.map((series: any) => {
      try {
        const episodes = episodesMap.get(series.id) || [];
        const episodeList = episodes.map((ep: any) => ({
          id: ep.id,
          episodeNumber: ep.episode_number,
          title: ep.title || `第${ep.episode_number}集`,
          synopsis: ep.synopsis || '',
          thumbnail: ep.thumbnail_url || '',
          videoUrl: ep.merged_video_url || '',
          mergedVideoUrl: ep.merged_video_url || '',
          totalDuration: ep.total_duration || 0,
          // v6.0.16: 有合并视频URL则强制completed，修复"实际已完成却显示生成中"
          status: (ep.merged_video_url) ? 'completed' : (ep.status || 'draft'),
          storyboardCount: 0,
          completedStoryboardCount: 0,
        }));
        // 有视频URL或状态为completed的都算已完成
        const completedEpisodes = episodeList.filter((ep: any) => ep.status === 'completed' || ep.videoUrl).length;
        const viewHistory = viewHistoryMap.get(series.id);
        const continueWatching = viewHistory ? {
          episodeNumber: viewHistory.last_episode || 1,
          lastPosition: viewHistory.progress || 0,
          duration: 0,
          completed: false,
        } : undefined;

        // batch-optimized: all lookups from Maps
        // (likes/comments/isLiked/continueWatching/userNickname all pre-fetched)
        return {
          id: series.id,
          type: 'series',
          user_phone: series.user_phone || '',
          user_nickname: userNicknameMap.get(series.user_phone) || '',
          title: series.title || '未命名系列',
          description: series.description || '',
          genre: series.genre || '',
          style: series.style || 'anime',
          // v6.0.19: 封面回退链 cover_image_url → 首集缩略图 → 首个分镜图片
          coverImage: series.cover_image_url
            || (episodeList.length > 0 && episodeList[0].thumbnail ? episodeList[0].thumbnail : '')
            || coverFallbackMap.get(series.id)
            || '',
          totalEpisodes: series.total_episodes || episodeList.length,
          completedEpisodes,
          episodes: episodeList,
          likes: likesCountMap.get(series.id) || 0,
          views: 0, // v6.0.27: series表无views列，暂用0
          shares: 0, // shares表不存在，暂用0
          comments: commentsCountMap.get(series.id) || 0,
          isLiked: userLikesSet.has(series.id),
          continueWatching,
          aspectRatio: series.coherence_check?.aspectRatio || undefined, // v6.0.83
          created_at: series.created_at,
          updated_at: series.updated_at,
        };
      } catch (enrichErr: any) {
        console.warn(`[Community] Enrich series ${series.id} failed:`, truncateErrorMsg(enrichErr));
        return {
          id: series.id,
          type: 'series',
          user_phone: series.user_phone || '',
          title: series.title || '未命名系列',
          description: series.description || '',
          genre: series.genre || '',
          style: series.style || 'anime',
          // v6.0.19: 即使 enrich 失败也使用封面回退
          // v6.0.43: Unicode fix — original L4816 comment had corrupted bytes, correct text: "即使 enrich 失败也使用封面回退"
          coverImage: series.cover_image_url || coverFallbackMap.get(series.id) || '',
          totalEpisodes: series.total_episodes || 0,
          completedEpisodes: 0,
          episodes: [],
          likes: 0, views: 0, shares: 0, comments: 0,
          isLiked: false,
          created_at: series.created_at,
          updated_at: series.updated_at,
        };
      }
    });

    // v6.0.34: 发现页仅展示至少完成完整1集的漫剧系列
    // 过滤条件：completedEpisodes >= 1（有merged_video_url或status=completed的剧集）
    // Over-fetch补偿：从3x窗口中过滤后取前limit条，确保分页填满
    const allFiltered = enrichedSeries.filter((s: any) => s.completedEpisodes >= 1);
    const pageData = since ? allFiltered : allFiltered.slice(0, limit);
    // hasMore: 如果过滤后仍有超过limit条（说明DB窗口还有余量）或DB本身还有更多数据
    const dbHasMore = (seriesList.length >= dbFetchLimit);
    const hasMore = since ? false : (allFiltered.length > limit || dbHasMore);
    return c.json({
      success: true,
      data: pageData,
      total: count || 0,
      page,
      limit,
      hasMore,
    });
  } catch (error: any) {
    console.error('[Community] Series error:', truncateErrorMsg(error));
    return c.json({ success: false, error: error.message, data: [], total: 0 }, 500);
  }
});

// 社区系列详情
app.get(`${PREFIX}/community/series/:id`, async (c) => {
  try {
    const seriesId = c.req.param('id');
    const userPhone = c.req.query('userPhone') || '';

    // v6.0.26: 移��likes_count/shares_count/comments_count（series表无此列），改为并行count查询
    const { data: series, error } = await queryWithRetry(
      () => supabase.from('series').select('id, user_phone, title, description, genre, style, cover_image_url, total_episodes, created_at, updated_at, coherence_check').eq('id', seriesId).maybeSingle(),
      'getSeriesDetail'
    );
    if (error) return c.json({ success: false, error: error.message }, 500);
    if (!series) return c.json({ success: false, error: '漫剧系列不存在' }, 404);

    // v6.0.70: 私有作品仅作者本人可查看
    const isPublic = series.coherence_check?.isPublic !== false;
    if (!isPublic && series.user_phone !== userPhone) {
      return c.json({ success: false, error: '该作品为私有，仅作者可查看' }, 403);
    }

    // v6.0.26: 并行获取剧集、分镜、点赞状态、昵称、点赞数、评论数（6个独立查询并行���
    const [episodesRes, storyboardsRes, likeStatusRes, nicknameRes, likesCountRes, commentsCountRes] = await Promise.all([
      // v6.0.24: episodes仅需播放器展示字段
      supabase.from('series_episodes').select('id, episode_number, title, synopsis, thumbnail_url, merged_video_url, total_duration, status').eq('series_id', seriesId).order('episode_number', { ascending: true }),
      // v6.0.24: storyboards仅需播放列表构建字段
      supabase.from('series_storyboards').select('episode_number, scene_number, video_url, duration, description').eq('series_id', seriesId).order('episode_number', { ascending: true }).order('scene_number', { ascending: true }),
      userPhone
        ? supabase.from('likes').select('id').eq('work_id', seriesId).eq('user_phone', userPhone).maybeSingle()
        : Promise.resolve({ data: null }),
      series.user_phone
        ? supabase.from('users').select('nickname').eq('phone', series.user_phone).maybeSingle()
        : Promise.resolve({ data: null }),
      // v6.0.26: 从likes/comments表实时count（series表无反规范化计数列）
      supabase.from('likes').select('id', { count: 'exact', head: true }).eq('work_id', seriesId),
      supabase.from('comments').select('id', { count: 'exact', head: true }).eq('work_id', seriesId),
    ]);

    const episodes = episodesRes.data;
    const storyboards = storyboardsRes.data;
    const isLiked = !!likeStatusRes.data;
    const userNickname = nicknameRes.data?.nickname || '';
    const detailLikesCount = likesCountRes.count || 0;
    const detailCommentsCount = commentsCountRes.count || 0;

    // 将分镜关联到剧集 ��� v5.4.1: 自动从分镜构建播放列表
    // v6.0.89: O(N×M)→O(N+M) 优化——用Map索引替代逐集filter
    const sbMap2 = new Map<number, any[]>();
    for (const sb of (storyboards || [])) {
      const epNum = Number(sb.episode_number);
      if (!sbMap2.has(epNum)) sbMap2.set(epNum, []);
      sbMap2.get(epNum)!.push(sb);
    }
    const enrichedEpisodes = (episodes || []).map((ep: any) => {
      const epStoryboards = sbMap2.get(Number(ep.episode_number)) || [];
      const completedSb = epStoryboards.filter((sb: any) => sb.video_url);

      let videoUrl = ep.merged_video_url || '';
      if (!videoUrl && completedSb.length > 0) {
        const playlistVideos = completedSb
          .sort((a: any, b: any) => a.scene_number - b.scene_number)
          .map((sb: any) => ({
            url: sb.video_url,
            duration: sb.duration || 5,
            title: sb.description || `场景${sb.scene_number}`,
            sceneNumber: sb.scene_number,
          }));
        const totalDuration = playlistVideos.reduce((sum: number, v: any) => sum + v.duration, 0);
        videoUrl = JSON.stringify({
          type: 'playlist',
          version: '1.0',
          episodeId: ep.id,
          totalVideos: playlistVideos.length,
          totalDuration,
          videos: playlistVideos,
          createdAt: new Date().toISOString(),
        });
        console.log(`[Community] Auto-built playlist for ep${ep.episode_number}: ${playlistVideos.length} videos, ${totalDuration}s total`);
      }

      return {
        id: ep.id,
        episodeNumber: ep.episode_number,
        title: ep.title || `第${ep.episode_number}集`,
        synopsis: ep.synopsis || '',
        thumbnail: ep.thumbnail_url || '',
        videoUrl,
        mergedVideoUrl: videoUrl,
        totalDuration: ep.total_duration || 0,
        status: ep.status || 'draft',
        storyboardCount: epStoryboards.length,
        completedStoryboardCount: completedSb.length,
      };
    });

    const completedEpisodes = enrichedEpisodes.filter((ep: any) => ep.status === 'completed' || ep.videoUrl).length;

    // v6.0.26: likes/comments 从 likes/comments 表实时count（series表无反规范化计数列）
    // isLiked、userNickname、detailLikesCount、detailCommentsCount 已在上方 Promise.all 中并行获取

    return c.json({
      success: true,
      data: {
        id: series.id,
        type: 'series',
        user_phone: series.user_phone || '',
        user_nickname: userNickname,
        title: series.title || '未命名系列',
        description: series.description || '',
        genre: series.genre || '',
        style: series.style || 'anime',
        coverImage: series.cover_image_url || '',
        totalEpisodes: series.total_episodes || enrichedEpisodes.length,
        completedEpisodes,
        episodes: enrichedEpisodes,
        likes: detailLikesCount,
        views: 0, // v6.0.27: series表无views列，暂用0
        shares: 0, // series表无shares_count列，与社区列表对齐
        comments: detailCommentsCount,
        isLiked,
        aspectRatio: series.coherence_check?.aspectRatio || undefined, // v6.0.83
        created_at: series.created_at,
        updated_at: series.updated_at,
      },
    });
  } catch (error: any) {
    console.error('[Community] Series detail error:', truncateErrorMsg(error));
    return c.json({ success: false, error: error.message }, 500);
  }
});

// v6.0.17: 相似作品推荐
app.get(`${PREFIX}/community/series/:id/similar`, async (c) => {
  try {
    const seriesId = c.req.param('id');
    const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '6') || 6, 1), 20);

    // 先获取当前系列的 genre 和 style
    const { data: current, error: curErr } = await supabase
      .from('series')
      .select('genre, style')
      .eq('id', seriesId)
      .maybeSingle();

    if (curErr || !current) {
      return c.json({ success: true, data: [] });
    }

    // 按 genre 匹配 → style 匹配 → 最新，排除自身，只取已完成的
    // v6.0.26: 移除likes_count（series表无此列），改��created_at排序+批量likes count
    const { data: similar, error: simErr } = await supabase
      .from('series')
      .select('id, title, description, genre, style, cover_image_url, created_at, total_episodes, user_phone')
      .in('status', ['completed', 'published', 'in-progress'])
      .neq('id', seriesId)
      .or(`genre.eq.${current.genre},style.eq.${current.style}`)
      // v6.0.70: 排除私有作品
      .or('coherence_check.is.null,coherence_check->>isPublic.is.null,coherence_check->>isPublic.neq.false')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (simErr) {
      console.error('[Community] Similar series query error:', truncateErrorMsg(simErr));
      return c.json({ success: true, data: [] });
    }

    // v6.0.29: 批量获取点赞数（head:true count聚合）+ 用户昵称（并行）
    const similarIds = (similar || []).map((s: any) => s.id);
    const phones = [...new Set((similar || []).map((s: any) => s.user_phone).filter(Boolean))] as string[];
    const similarLikesMap = new Map<string, number>();
    const nicknameMap = new Map<string, string>();

    const [simLikeCountResults, simUsersRes] = await Promise.all([
      similarIds.length > 0
        ? Promise.all(similarIds.map((id: string) =>
            supabase.from('likes').select('*', { count: 'exact', head: true }).eq('work_id', id)
          ))
        : Promise.resolve([]),
      phones.length > 0
        ? supabase.from('users').select('phone, nickname').in('phone', phones)
        : Promise.resolve({ data: [] }),
    ]);
    similarIds.forEach((id: string, i: number) => {
      similarLikesMap.set(id, (simLikeCountResults as any[])[i]?.count || 0);
    });
    for (const u of (simUsersRes.data || [])) {
      nicknameMap.set(u.phone, u.nickname || '');
    }

    const result = (similar || []).map((s: any) => ({
      id: s.id,
      title: s.title || '未命名',
      description: (s.description || '').substring(0, 80),
      genre: s.genre || '',
      style: s.style || '',
      coverImage: s.cover_image_url || '',
      likes: similarLikesMap.get(s.id) || 0,
      totalEpisodes: s.total_episodes || 0,
      userNickname: nicknameMap.get(s.user_phone) || '',
    }));

    return c.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[Community] Similar series error:', error?.message);
    return c.json({ success: true, data: [] });
  }
});

// ------------------------------------------------------------------
//  [N] 管理维护 — 补全路由 / 诊断修复 / 去重清理
// ------------------------------------------------------------------

// ==================== 其他补全路由 ====================

app.get(`${PREFIX}/viewing-history`, async (c) => {
  try {
    const userPhone = c.req.query('userPhone');
    const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '20') || 20, 1), 100);
    if (!userPhone) return c.json({ success: true, data: [] });
    // v6.0.24: 精简字段
    const { data, error } = await supabase.from('viewing_history').select('series_id, last_episode, progress, updated_at').eq('user_phone', userPhone).order('updated_at', { ascending: false }).limit(limit);
    if (error) return c.json({ success: false, error: error.message }, 500);
    return c.json({ success: true, data: toCamelCase(data || []) });
  } catch (error: any) { console.error('[GET /viewing-history] Error:', error); return c.json({ success: false, error: error.message }, 500); }
});

app.post(`${PREFIX}/series/storyboards/:storyboardId/generate-video`, async (c) => {
  try {
    const storyboardId = c.req.param('storyboardId');
    const body = await c.req.json();
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const prompt = body.prompt || body.description || '';
    const { data: task, error } = await supabase.from('video_tasks').insert({
      task_id: taskId, user_phone: body.userPhone || 'system', prompt,
      title: body.title || prompt.substring(0, 100) || `分镜视频-${storyboardId}`,
      style: body.style || 'comic',
      status: 'pending',
      generation_metadata: {
        storyboardId, type: 'storyboard_video', seriesId: body.seriesId,
      },
    }).select().single();
    if (error) {
      console.error(`[Video] storyboard generate-video insert error:`, error.message);
      return c.json({ success: false, error: error.message }, 500);
    }
    return c.json({ success: true, data: toCamelCase(task) });
  } catch (error: any) { console.error('[POST /series/storyboards/:storyboardId/generate-video] Error:', error); return c.json({ success: false, error: error.message }, 500); }
});

// ==================== 数据诊断修复路由 ====================

// 修复单个漫剧的episodes（诊断工具使用）
app.post(`${PREFIX}/series/:id/fix-episodes`, async (c) => {
  try {
    const seriesId = c.req.param('id');
    // v6.0.23: select specific fields instead of *
    const { data: series, error: seriesErr } = await supabase
      .from('series').select('id, title, total_episodes, status').eq('id', seriesId).maybeSingle();
    if (seriesErr || !series) {
      return c.json({ success: false, error: seriesErr?.message || '漫剧不存在' }, 404);
    }

    const totalEpisodes = Math.min(Math.max(parseInt(series.total_episodes) || 3, 1), 50);
    console.log(`[Fix] fix-episodes: series=${seriesId}, title=${series.title}, totalEpisodes=${totalEpisodes}`);

    // 检查已有episodes
    const { count: existingCount } = await supabase
      .from('series_episodes').select('id', { count: 'exact', head: true }).eq('series_id', seriesId);

    if (existingCount && existingCount >= totalEpisodes) {
      return c.json({ success: true, message: '剧集数据已完整，无需修复', count: existingCount });
    }

    // 使用模板生成episodes
    const titles = ['命运的开端','初次交锋','暗流涌动','转折点','真相初现','并肩作战','信任危机','绝地反击','最终决战','尘埃落定'];
    const synopses = ['主角登场，日常中遭遇意外事���。','面对第一个挑战，遇到重要配角。','暗中势力浮现，事情复杂化。','关键信息揭露，信念受动摇。','真相渐清晰，新危机酝酿。','并肩作战，友情升华。','信任考验，独自面对困境。','绝境中找到新力量。','终极对决，命运揭晓。','尘埃落定，完成成长。'];

    // 先删除旧数据
    await supabase.from('series_episodes').delete().eq('series_id', seriesId);

    const episodeRows = Array.from({ length: Math.min(totalEpisodes, 30) }, (_, i) => ({
      series_id: seriesId, episode_number: i + 1,
      title: i < 10 ? titles[i] : `第${i + 1}集`,
      synopsis: i < 10 ? synopses[i] : `故事持续发展，情节逐步深入。`,
      growth_theme: '成长与蜕变', key_moment: '', status: 'draft',
    }));

    const { data: inserted, error: insertErr } = await supabase
      .from('series_episodes').upsert(episodeRows, { onConflict: 'series_id,episode_number' }).select();

    if (insertErr) {
      console.error('[Fix] fix-episodes: DB error:', insertErr.message);
      return c.json({ success: false, error: insertErr.message }, 500);
    }

    await supabase.from('series').update({ status: 'in-progress' }).eq('id', seriesId);

    console.log(`[Fix] fix-episodes: Created ${inserted?.length || 0} episodes for ${series.title}`);
    return c.json({ success: true, data: { count: inserted?.length || 0 }, message: `已生成 ${inserted?.length || 0} 集` });
  } catch (error: any) {
    console.error('[Fix] fix-episodes error:', truncateErrorMsg(error));
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ==================== 数据清理与去重（v5.6.3） ====================

// GET /admin/data-health — 数据健康诊断（不修改数据）
app.get(`${PREFIX}/admin/data-health`, async (c) => {
  try {
    const report: any = { duplicateEpisodes: [], mergedVideoUrlFormats: {}, orphanedEpisodes: [], timestamp: new Date().toISOString() };

    // 1. 检查 series_episodes 重复（相同 series_id + episode_number 出现多行）
    const { data: allEpisodes, error: epErr } = await supabase
      .from('series_episodes')
      .select('id, series_id, episode_number, title, status, total_duration, merged_video_url, created_at, updated_at')
      .order('series_id', { ascending: true })
      .order('episode_number', { ascending: true })
      .order('updated_at', { ascending: false });

    if (epErr) return c.json({ success: false, error: `查询episodes失败: ${epErr.message}` }, 500);

    // 按 (series_id, episode_number) 分组
    const groupMap = new Map<string, any[]>();
    for (const ep of (allEpisodes || [])) {
      const key = `${ep.series_id}__${ep.episode_number}`;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(ep);
    }

    let totalEpisodes = 0, duplicateGroups = 0, duplicateRows = 0;
    const mergedUrlFormats: Record<string, number> = { 'null': 0, 'inline_json': 0, 'oss_url': 0, 'other': 0 };

    for (const [key, episodes] of groupMap) {
      totalEpisodes += episodes.length;
      if (episodes.length > 1) {
        duplicateGroups++;
        duplicateRows += episodes.length - 1; // 多出来的
        report.duplicateEpisodes.push({
          key,
          count: episodes.length,
          episodes: episodes.map((ep: any) => ({
            id: ep.id,
            title: ep.title,
            status: ep.status,
            totalDuration: ep.total_duration,
            hasMergedVideo: !!ep.merged_video_url,
            updatedAt: ep.updated_at,
          })),
        });
      }

      // 统计 merged_video_url 格式
      for (const ep of episodes) {
        if (!ep.merged_video_url) {
          mergedUrlFormats['null']++;
        } else if (typeof ep.merged_video_url === 'string' && ep.merged_video_url.trim().startsWith('{')) {
          mergedUrlFormats['inline_json']++;
        } else if (typeof ep.merged_video_url === 'string' && ep.merged_video_url.startsWith('http')) {
          mergedUrlFormats['oss_url']++;
        } else {
          mergedUrlFormats['other']++;
        }
      }
    }

    report.mergedVideoUrlFormats = mergedUrlFormats;

    // 2. 检查孤儿 episodes（series_id 对应的 series 不存在）
    const seriesIds = [...new Set((allEpisodes || []).map((ep: any) => ep.series_id))];
    if (seriesIds.length > 0) {
      const { data: existingSeries } = await supabase
        .from('series').select('id').in('id', seriesIds);
      const existingSeriesIds = new Set((existingSeries || []).map((s: any) => s.id));
      const orphanedSeriesIds = seriesIds.filter(id => !existingSeriesIds.has(id));
      if (orphanedSeriesIds.length > 0) {
        const orphanedCount = (allEpisodes || []).filter((ep: any) => orphanedSeriesIds.includes(ep.series_id)).length;
        report.orphanedEpisodes = orphanedSeriesIds.map(sid => ({
          seriesId: sid,
          count: (allEpisodes || []).filter((ep: any) => ep.series_id === sid).length,
        }));
        report.orphanedEpisodeCount = orphanedCount;
      }
    }

    // 3. 检查 series_storyboards 重复
    const { data: allSb, error: sbErr } = await supabase
      .from('series_storyboards')
      .select('id, series_id, episode_number, scene_number')
      .order('series_id').order('episode_number').order('scene_number');
    
    let sbDuplicateGroups = 0, sbDuplicateRows = 0;
    if (!sbErr && allSb) {
      const sbGroupMap = new Map<string, number>();
      for (const sb of allSb) {
        const key = `${sb.series_id}__${sb.episode_number}__${sb.scene_number}`;
        sbGroupMap.set(key, (sbGroupMap.get(key) || 0) + 1);
      }
      for (const [, count] of sbGroupMap) {
        if (count > 1) { sbDuplicateGroups++; sbDuplicateRows += count - 1; }
      }
    }

    report.summary = {
      totalEpisodes,
      uniqueEpisodeSlots: groupMap.size,
      duplicateGroups,
      duplicateRows,
      sbTotalRows: allSb?.length || 0,
      sbDuplicateGroups,
      sbDuplicateRows,
      orphanedSeriesCount: report.orphanedEpisodes?.length || 0,
      orphanedEpisodeCount: report.orphanedEpisodeCount || 0,
    };

    console.log(`[Admin] data-health: ${totalEpisodes} episodes, ${duplicateGroups} duplicate groups (${duplicateRows} extra rows), ${sbDuplicateGroups} sb dup groups`);
    return c.json({ success: true, data: report });
  } catch (error: any) {
    console.error('[Admin] data-health error:', truncateErrorMsg(error));
    return c.json({ success: false, error: error.message }, 500);
  }
});

// POST /admin/cleanup-duplicates — 清理重复数据 + 统一 merged_video_url 格式
app.post(`${PREFIX}/admin/cleanup-duplicates`, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false; // 默认 dry run，不实际删除
    const fixMergedUrls = body.fixMergedUrls !== false; // ��认修复 merged_video_url
    const cleanOrphans = body.cleanOrphans === true; // 默认不清理孤儿数据

    console.log(`[Admin] cleanup-duplicates: dryRun=${dryRun}, fixMergedUrls=${fixMergedUrls}, cleanOrphans=${cleanOrphans}`);

    const actions: any[] = [];
    let deletedEpisodes = 0, deletedStoryboards = 0, fixedMergedUrls = 0, deletedOrphans = 0;

    // ===== 1. 清理重复 episodes =====
    const { data: allEpisodes, error: epErr } = await supabase
      .from('series_episodes')
      .select('id, series_id, episode_number, title, status, total_duration, merged_video_url, created_at, updated_at')
      .order('series_id').order('episode_number').order('updated_at', { ascending: false });

    if (epErr) return c.json({ success: false, error: `查询失败: ${epErr.message}` }, 500);

    // 按 (series_id, episode_number) 分组
    const groupMap = new Map<string, any[]>();
    for (const ep of (allEpisodes || [])) {
      const key = `${ep.series_id}__${ep.episode_number}`;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(ep);
    }

    for (const [key, episodes] of groupMap) {
      if (episodes.length <= 1) continue;

      // 选择最佳保留项的评分函数
      const scoreFn = (ep: any) => {
        let score = 0;
        if (ep.status === 'completed') score += 100;
        if (ep.status === 'draft' && ep.total_duration > 0) score += 50;
        if (ep.merged_video_url) score += 30;
        if (ep.total_duration > 0) score += 20;
        if (ep.title && ep.title.length > 5) score += 10;
        // 更新时间越新越好
        score += new Date(ep.updated_at || ep.created_at || 0).getTime() / 1e12;
        return score;
      };

      // 按得分排序，第一个保留，其余删除
      const sorted = [...episodes].sort((a, b) => scoreFn(b) - scoreFn(a));
      const keep = sorted[0];
      const toDelete = sorted.slice(1);
      const deleteIds = toDelete.map((ep: any) => ep.id);

      actions.push({
        type: 'deduplicate_episodes',
        key,
        keepId: keep.id,
        keepTitle: keep.title,
        keepStatus: keep.status,
        deleteCount: deleteIds.length,
        deleteIds,
      });

      if (!dryRun && deleteIds.length > 0) {
        // 先删除关联的 storyboards（如果有 episode_id 外键的话）
        // series_storyboards 用 series_id + episode_number 关联，不受影响
        const { error: delErr } = await supabase
          .from('series_episodes').delete().in('id', deleteIds);
        if (delErr) {
          console.warn(`[Admin] cleanup: failed to delete episodes for ${key}:`, delErr.message);
        } else {
          deletedEpisodes += deleteIds.length;
        }
      }
    }

    // ===== 2. 清理重复 storyboards =====
    const { data: allSb } = await supabase
      .from('series_storyboards')
      .select('id, series_id, episode_number, scene_number, video_url, image_url, status, updated_at')
      .order('series_id').order('episode_number').order('scene_number').order('updated_at', { ascending: false });

    if (allSb) {
      const sbGroupMap = new Map<string, any[]>();
      for (const sb of allSb) {
        const key = `${sb.series_id}__${sb.episode_number}__${sb.scene_number}`;
        if (!sbGroupMap.has(key)) sbGroupMap.set(key, []);
        sbGroupMap.get(key)!.push(sb);
      }

      for (const [key, sbs] of sbGroupMap) {
        if (sbs.length <= 1) continue;

        const sbScoreFn = (sb: any) => {
          let score = 0;
          if (sb.video_url) score += 100;
          if (sb.image_url) score += 50;
          if (sb.status === 'completed') score += 30;
          score += new Date(sb.updated_at || 0).getTime() / 1e12;
          return score;
        };

        const sorted = [...sbs].sort((a, b) => sbScoreFn(b) - sbScoreFn(a));
        const keep = sorted[0];
        const toDelete = sorted.slice(1);
        const deleteIds = toDelete.map((sb: any) => sb.id);

        actions.push({
          type: 'deduplicate_storyboards',
          key,
          keepId: keep.id,
          deleteCount: deleteIds.length,
        });

        if (!dryRun && deleteIds.length > 0) {
          const { error: delErr } = await supabase
            .from('series_storyboards').delete().in('id', deleteIds);
          if (delErr) {
            console.warn(`[Admin] cleanup: failed to delete storyboards for ${key}:`, delErr.message);
          } else {
            deletedStoryboards += deleteIds.length;
          }
        }
      }
    }

    // ===== 3. 统一 merged_video_url 格式 =====
    if (fixMergedUrls && !dryRun) {
      // 对于有 inline JSON 的 merged_video_url，尝试上传到 OSS 并替换为 URL
      const { data: inlineEps } = await supabase
        .from('series_episodes')
        .select('id, series_id, episode_number, merged_video_url')
        .not('merged_video_url', 'is', null);

      if (inlineEps && isOSSConfigured()) {
        for (const ep of inlineEps) {
          if (!ep.merged_video_url || typeof ep.merged_video_url !== 'string') continue;
          const trimmed = ep.merged_video_url.trim();
          if (!trimmed.startsWith('{')) continue; // 只处理 inline JSON

          try {
            // 验证是有效的播放列表 JSON
            const parsed = JSON.parse(trimmed);
            if (!parsed.videos || !Array.isArray(parsed.videos)) continue;

            // 上传到 OSS
            const objectKey = `playlists/${ep.series_id}/ep${ep.episode_number}-playlist.json`;
            const ossUrl = await uploadToOSS(
              objectKey,
              new TextEncoder().encode(trimmed).buffer,
              'application/json'
            );

            // 更新数据库
            await supabase.from('series_episodes')
              .update({ merged_video_url: ossUrl, updated_at: new Date().toISOString() })
              .eq('id', ep.id);

            fixedMergedUrls++;
            actions.push({
              type: 'normalize_merged_url',
              episodeId: ep.id,
              from: 'inline_json',
              to: 'oss_url',
              ossUrl: ossUrl.substring(0, 80) + '...',
            });
          } catch (e: any) {
            console.warn(`[Admin] cleanup: failed to normalize merged_video_url for ${ep.id}:`, e.message);
          }
        }
      }
    }

    // ===== 4. 清理孤儿数据 =====
    if (cleanOrphans && !dryRun) {
      const seriesIds = [...new Set((allEpisodes || []).map((ep: any) => ep.series_id))];
      if (seriesIds.length > 0) {
        const { data: existingSeries } = await supabase.from('series').select('id').in('id', seriesIds);
        const existingIds = new Set((existingSeries || []).map((s: any) => s.id));
        const orphanIds = seriesIds.filter(id => !existingIds.has(id));

        for (const orphanSeriesId of orphanIds) {
          // 删除孤儿 storyboards
          await supabase.from('series_storyboards').delete().eq('series_id', orphanSeriesId);
          // 删除孤儿 episodes
          const { data: deleted } = await supabase
            .from('series_episodes').delete().eq('series_id', orphanSeriesId).select('id');
          deletedOrphans += deleted?.length || 0;
          actions.push({ type: 'delete_orphan', seriesId: orphanSeriesId, deletedCount: deleted?.length || 0 });
        }
      }
    }

    const summary = {
      dryRun,
      deletedEpisodes: dryRun ? 0 : deletedEpisodes,
      deletedStoryboards: dryRun ? 0 : deletedStoryboards,
      fixedMergedUrls: dryRun ? 0 : fixedMergedUrls,
      deletedOrphans: dryRun ? 0 : deletedOrphans,
      wouldDeleteEpisodes: actions.filter(a => a.type === 'deduplicate_episodes').reduce((s, a) => s + a.deleteCount, 0),
      wouldDeleteStoryboards: actions.filter(a => a.type === 'deduplicate_storyboards').reduce((s, a) => s + a.deleteCount, 0),
      totalActions: actions.length,
    };

    console.log(`[Admin] cleanup-duplicates done:`, JSON.stringify(summary));
    return c.json({ success: true, data: { summary, actions } });
  } catch (error: any) {
    console.error('[Admin] cleanup-duplicates error:', truncateErrorMsg(error));
    return c.json({ success: false, error: error.message }, 500);
  }
});

// POST /admin/rebuild-merged-urls — 重建所有有视频的剧集的 merged_video_url
app.post(`${PREFIX}/admin/rebuild-merged-urls`, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const seriesId = body.seriesId; // 可选：只处理指定 series
    const forceRebuild = body.forceRebuild === true; // 是否覆盖已有的 merged_video_url

    let query = supabase.from('series_episodes')
      .select('id, series_id, episode_number, title, merged_video_url, status');
    if (seriesId) query = query.eq('series_id', seriesId);
    if (!forceRebuild) query = query.is('merged_video_url', null);

    const { data: episodes, error: epErr } = await query.order('series_id').order('episode_number');
    if (epErr) return c.json({ success: false, error: epErr.message }, 500);

    // v6.0.23: 批量预取所有分镜，消除N+1查询
    const uniqueSeriesIds = [...new Set((episodes || []).map((ep: any) => ep.series_id))];
    let allRawSb: any[] = [];
    if (uniqueSeriesIds.length > 0) {
      const { data: sbData } = await supabase
        .from('series_storyboards').select('series_id, episode_number, scene_number, video_url, duration, description, image_url')
        .in('series_id', uniqueSeriesIds)
        .not('video_url', 'is', null)
        .order('scene_number', { ascending: true });
      allRawSb = sbData || [];
    }
    const rebuildSbMap = new Map<string, any[]>();
    for (const sb of allRawSb) {
      const key = `${sb.series_id}:${sb.episode_number}`;
      if (!rebuildSbMap.has(key)) rebuildSbMap.set(key, []);
      rebuildSbMap.get(key)!.push(sb);
    }

    let rebuilt = 0, skipped = 0, failed = 0;
    const results: any[] = [];

    for (const ep of (episodes || [])) {
      try {
        // v6.0.23: 从批量预取结果中获取，替代逐集查询
        const rawStoryboards = rebuildSbMap.get(`${ep.series_id}:${ep.episode_number}`) || [];

        const storyboards = rawStoryboards.filter((sb: any) => {
          const url = (sb.video_url || '').trim();
          return url.length > 0 && url.startsWith('http');
        });

        if (storyboards.length === 0) {
          skipped++;
          continue;
        }

        const videos = storyboards.map((sb: any) => ({
          sceneNumber: sb.scene_number,
          url: sb.video_url.trim(),
          duration: sb.duration || 10,
          title: sb.description || `场景${sb.scene_number}`,
          thumbnail: sb.image_url || '',
        }));

        const playlist = {
          type: 'playlist', version: '1.0',
          episodeId: ep.id, episodeNumber: ep.episode_number,
          title: ep.title || `第${ep.episode_number}集`,
          totalVideos: videos.length,
          totalDuration: videos.reduce((sum: number, v: any) => sum + (v.duration || 10), 0),
          videos, createdAt: new Date().toISOString(),
        };
        const playlistJson = JSON.stringify(playlist);

        // 尝试上传到 OSS
        let mergedVideoUrl = playlistJson;
        if (isOSSConfigured()) {
          try {
            const objectKey = `playlists/${ep.series_id}/ep${ep.episode_number}-playlist.json`;
            mergedVideoUrl = await uploadToOSS(objectKey, new TextEncoder().encode(playlistJson).buffer, 'application/json');
          } catch (ossErr: any) { console.warn(`[MergeVideos] OSS upload failed for ep${ep.episode_number}, using inline JSON:`, ossErr?.message); }
        }

        await supabase.from('series_episodes')
          .update({
            merged_video_url: mergedVideoUrl,
            total_duration: playlist.totalDuration,
            status: 'completed',
            updated_at: new Date().toISOString(),
          }).eq('id', ep.id);

        rebuilt++;
        results.push({ episodeId: ep.id, episodeNumber: ep.episode_number, videoCount: videos.length, format: mergedVideoUrl.startsWith('http') ? 'oss' : 'inline' });
      } catch (e: any) {
        failed++;
        console.warn(`[Admin] rebuild-merged-urls: ep ${ep.id} failed:`, e.message);
      }
    }

    console.log(`[Admin] rebuild-merged-urls: rebuilt=${rebuilt}, skipped=${skipped}, failed=${failed}`);
    return c.json({ success: true, data: { rebuilt, skipped, failed, total: episodes?.length || 0, results } });
  } catch (error: any) {
    console.error('[Admin] rebuild-merged-urls error:', truncateErrorMsg(error));
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ==================== v6.0.16: 图片上传（参考图等） ====================

app.post(`${PREFIX}/upload-image`, async (c) => {
  try {
    // v6.0.16+: 基本鉴权——要求用户标识
    const userPhone = c.req.header('x-user-phone');
    if (!userPhone) {
      return c.json({ success: false, error: '请先登录后上传图片' }, 401);
    }

    // v6.0.16+: 频率限制（使用通用限流器）
    const rateCheck = rateLimiters.upload.check(userPhone);
    if (!rateCheck.allowed) {
      return c.json({ success: false, error: `上传过于频繁，请${rateCheck.retryAfter}秒后重试` }, 429);
    }

    const ct = c.req.header('content-type') || '';
    if (!ct.includes('multipart/form-data') && !ct.includes('multipart')) {
      return c.json({ success: false, error: '请使用 multipart/form-data 格式上传' }, 400);
    }
    const formData = await c.req.formData();
    const file = formData.get('file') as File;
    const purpose = (formData.get('purpose') as string) || 'general';
    if (!file || !(file instanceof File)) {
      return c.json({ success: false, error: '未找到上传文件' }, 400);
    }
    if (file.size > 10 * 1024 * 1024) {
      return c.json({ success: false, error: '文件大小不能超过10MB' }, 400);
    }
    if (!file.type.startsWith('image/')) {
      return c.json({ success: false, error: '仅支持图片文件' }, 400);
    }

    if (!isOSSConfigured()) {
      return c.json({ success: false, error: 'OSS存储未配置' }, 500);
    }
    const ext = file.name.split('.').pop() || 'png';
    const objectKey = `uploads/${purpose}/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
    const arrayBuf = await file.arrayBuffer();
    const ossUrl = await uploadToOSS(objectKey, arrayBuf, file.type);
    console.log(`[Upload] Image uploaded to OSS: ${ossUrl} (${(file.size / 1024).toFixed(1)}KB)`);

    return c.json({ success: true, data: { url: ossUrl, objectKey, size: file.size } });
  } catch (error: any) {
    console.error('[Upload] Image upload error:', error.message);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ==================== OSS URL 签名（公开桶直接返回原URL） ====================
// v5.5.0: 响应格式必须与前端期望严格匹配

// 单URL签名 — 前端期望 result.data.signedUrl
app.post(`${PREFIX}/oss/sign-url`, async (c) => {
  try {
    const { url } = await c.req.json();
    console.log(`[OSS] sign-url: ${(url || '').substring(0, 80)}...`);
    return c.json({ success: true, data: { signedUrl: url || '' } });
  } catch (error: any) {
    console.error('[OSS] sign-url error:', error.message);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// 批量URL签名 — 前端期望 result.data.results[].{ success, originalUrl, signedUrl }
app.post(`${PREFIX}/oss/sign-urls`, async (c) => {
  try {
    const { urls } = await c.req.json();
    const results = (urls || []).map((url: string) => ({
      success: true,
      originalUrl: url,
      signedUrl: url, // 公开桶直接返回原URL
    }));
    console.log(`[OSS] sign-urls: ${results.length} URLs processed`);
    return c.json({ success: true, data: { results } });
  } catch (error: any) {
    console.error('[OSS] sign-urls error:', error.message);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// v6.0.14: 后端代理获取 JSON — 绕过 OSS CORS 限制
// 前端 PlaylistVideoPlayer 在直接 fetch 失败时回退到此路由
app.post(`${PREFIX}/oss/fetch-json`, async (c) => {
  try {
    const { url } = await c.req.json();
    if (!url || typeof url !== 'string') {
      return c.json({ success: false, error: 'URL is required' }, 400);
    }
    console.log(`[OSS] fetch-json proxy: ${url.substring(0, 100)}...`);
    const resp = await fetchWithTimeout(url, {}, 15000);
    if (!resp.ok) {
      throw new Error(`Upstream HTTP ${resp.status}`);
    }
    const data = await resp.json();
    return c.json({ success: true, data });
  } catch (error: any) {
    console.error('[OSS] fetch-json error:', error.message);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ==================== v6.0.3: 系列视频任务状态查询 ====================

// 查询指定系列所有分镜的视频任务状态 — 前端批量生成前调用，避免重复创建
app.get(`${PREFIX}/series/:seriesId/video-task-status`, async (c) => {
  try {
    const seriesId = c.req.param('seriesId');
    if (!seriesId) return c.json({ error: '缺少 seriesId' }, 400);

    // 1. 从 video_tasks 查询该系列所有相关任务（按 storyboardId 分组，每组取最新）
    const { data: tasks, error: taskErr } = await supabase.from('video_tasks')
      .select('task_id, status, video_url, volcengine_task_id, thumbnail, created_at, generation_metadata')
      .contains('generation_metadata', { seriesId })
      .order('created_at', { ascending: false })
      .limit(200);

    if (taskErr) {
      console.error('[VideoTaskStatus] Query error:', taskErr.message);
      return c.json({ error: taskErr.message }, 500);
    }

    // 2. 从 series_storyboards 查询已有 video_url 的分镜（可能由其他路径写入）
    const { data: storyboards } = await supabase.from('series_storyboards')
      .select('id, episode_number, scene_number, video_url, status, video_task_id')
      .eq('series_id', seriesId)
      .order('episode_number', { ascending: true })
      .order('scene_number', { ascending: true });

    // 3. 合并：对每个分镜，选出最佳任务状态
    // 以 storyboardId 为 key，优先级：completed > processing > pending > failed
    const STATUS_PRIORITY: Record<string, number> = {
      completed: 4, succeeded: 4, success: 4,
      processing: 3, submitted: 3,
      pending: 2,
      failed: 1, error: 1,
    };

    const taskByStoryboard = new Map<string, any>();
    for (const task of (tasks || [])) {
      const sbId = task.generation_metadata?.storyboardId;
      if (!sbId) continue;

      const existing = taskByStoryboard.get(sbId);
      const taskPriority = STATUS_PRIORITY[task.status] || 0;
      const existingPriority = existing ? (STATUS_PRIORITY[existing.status] || 0) : -1;

      if (taskPriority > existingPriority) {
        taskByStoryboard.set(sbId, {
          taskId: task.task_id,
          volcTaskId: task.volcengine_task_id,
          status: task.status,
          videoUrl: task.video_url || '',
          thumbnail: task.thumbnail || '',
          episodeNumber: task.generation_metadata?.episodeNumber,
          sceneNumber: task.generation_metadata?.storyboardNumber || task.generation_metadata?.sceneNumber,
          createdAt: task.created_at,
        });
      }
    }

    // 4. 补充来自 series_storyboards 的 video_url
    for (const sb of (storyboards || [])) {
      const existing = taskByStoryboard.get(sb.id);
      if (sb.video_url && (!existing || !existing.videoUrl)) {
        taskByStoryboard.set(sb.id, {
          ...(existing || {}),
          taskId: existing?.taskId || sb.video_task_id || '',
          status: 'completed',
          videoUrl: sb.video_url,
          episodeNumber: sb.episode_number,
          sceneNumber: sb.scene_number,
          source: 'storyboard_table',
        });
      }
    }

    const result = Object.fromEntries(taskByStoryboard);
    console.log(`[VideoTaskStatus] Series ${seriesId}: ${Object.keys(result).length} storyboards with tasks`);

    return c.json({
      success: true,
      seriesId,
      storyboardTasks: result,
      totalStoryboards: storyboards?.length || 0,
      tasksFound: Object.keys(result).length,
    });
  } catch (error: any) {
    console.error('[VideoTaskStatus] Error:', truncateErrorMsg(error));
    return c.json({ error: error.message }, 500);
  }
});

// ==================== 404处理 ====================

app.notFound((c) => c.json({ error: "404 Not Found", path: c.req.path, version: APP_VERSION }, 404));

// 启动日志 - 如果这行打印说明模块加载成功
console.log(`[App] ${APP_VERSION} initialized — VOLCENGINE=${!!VOLCENGINE_API_KEY}, AI=${!!ALIYUN_BAILIAN_API_KEY}, OSS=${isOSSConfigured() ? 'configured' : 'NOT_CONFIGURED'}, SUPABASE=${_SUPABASE_URL ? 'ok' : 'MISSING'}`);

export default app;