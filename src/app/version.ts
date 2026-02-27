/**
 * 应用版本信息
 *
 * v6.0.132 - 2026-02-27
 * - 修复: [关键] OSS URL超时无自愈——video-proxy DB fallback仅对TOS URL生效，OSS URL超时直接失败
 *   根因: canFallback = isTosUrl && hasContext，当视频已转存到OSS后URL是aliyuncs.com
 *         OSS从境外Edge Function下载大文件可能超过30s timeout，此时canFallback=false无法DB回退
 *         bulk-refresh对OSS URL盲目passthrough，不验证可达性
 *   修复1: handleVideoProxy upstream timeout 30s→60s（大视频跨区下载需更长时间）
 *   修复2: canFallback去掉isTosUrl限制——所有URL均可尝试DB fallback
 *   修复3: tryDbFallback对timeout场景允许重试同URL（超时可能是瞬态网络问题，非签名过期）
 *   修复4: bulk-refresh OSS URL从passthrough改为HEAD验证+DB fallback，不可达标记oss-unreachable
 *   修复5: 客户端proxy timeout 45s→75s + direct timeout 30s→60s + irrecoverable含oss-unreachable
 *
 * v6.0.131 - 2026-02-27
 * - 优化: [关键] volcengine/status OSS转存从fire-and-forget改为await+12s超时
 *   根因: 回调完成时fire-and-forget转存，后续立即访问仍拿到TOS URL，客户端合并时大概率403
 *   修复: Promise.race 12秒超时等待，成功则直接返回OSS URL；超时则返回原始URL后台继续
 * - 增强: transfer-completed-to-oss端点升级
 *   支持seriesId查询参数过滤、limit从20提升到50、转存前HEAD检查跳过已过期TOS URL
 * - 增强: 前端StoryboardEditor合并错误UI——过期场景显示重新生成视频按钮
 *   合并失败时解析错误消息中的过期场景编号，显示橙色警告面板
 *   含逐场景"重新生成视频"和"全部重新生成"按钮，handleRegenerateVideo增加skipConfirm参数
 *
 * v6.0.130 - 2026-02-27
 * - 修复: [关键] video-proxy timeout未触发DB fallback——TOS URL超时时也查DB获取OSS替代URL
 *   根因: handleVideoProxy的timeout catch块直接返回504错误，完全跳过DB fallback逻辑
 *         TOS签名URL过期后有时不是立即403，而是连接超时(30s)，此时DB中可能已有OSS URL
 *   修复: 提取tryDbFallback()共用helper，403和timeout两个分支均调用
 * - 修复: IRRECOVERABLE_SOURCES过于激进——error/api-error等瞬态源不应跳过proxy重试
 *   根因: v6.0.129将error/api-error/no-task-id/not-completed/no-url全标为irrecoverable
 *         这些源多为bulk-refresh时的瞬态网络错误，不代表video-proxy也会失败
 *         video-proxy v6.0.130现在timeout也触发DB fallback，有望恢复这些场景
 *   修复: 仅'expired-irrecoverable'跳过proxy，其余源正常重试
 * - 优化: video_tasks查询JSONB过滤——不再全表扫描completed任务
 *   根因: video-proxy和bulk-refresh-urls均查询ALL completed video_tasks再代码过滤
 *         任务量大时返回上千行，浪费DB带宽和Edge Function内存
 *   修复: 添加filter('generation_metadata->>seriesId', 'eq', seriesId)在DB层过滤
 *
 * v6.0.129 - 2026-02-27
 * - 修复: [关键] TOS签名URL过期403——video-proxy DB fallback + bulk-refresh优化 + 客户端智能回退
 *   根因: Volcengine TOS签名URL过期后，重查API返回同一个缓存URL(不重签)，视频无法下载
 *         fire-and-forget OSS转存有时在Edge Function终止前未完成，DB无OSS备份
 *         bulk-refresh-urls的sync OSS transfer尝试下载过期URL→必定403→浪费120s timeout
 *   修复1 (video-proxy DB fallback): 代理上游返回403时，利用POST body中的
 *         seriesId/episodeNumber/sceneNumber查询series_storyboards和video_tasks表
 *         若DB中已有OSS URL(后台转存可能已完成)，直接代理OSS URL返回
 *         即使bulk-refresh-urls失败/超时，video-proxy仍可自动恢复
 *   修复2 (bulk-refresh skip futile transfer): TOS签名URL的签名嵌在query string中
 *         HEAD 403 = GET也403，跳过sync OSS transfer(避免120s无意义等待)
 *         直接标记expired-irrecoverable，前端可立即跳过+提示用户重新生成
 *   修复3 (客户端元数据传递): ClientVideoMerger POST /video-proxy body新增
 *         seriesId/episodeNumber/sceneNumber字段，启用video-proxy的DB fallback
 *
 * v6.0.125 - 2026-02-26
 * - 修复: [关键] clientMergeEpisode — Proxy upstream 403 / 场景下载全部失败
 *   根因: storyboard.videoUrl 中存储的是 OSS 签名URL（含OSSAccessKeyId/Expires/Signature）
 *         签名URL有有效期限制（通常1小时或更短），视频生成完成后用户合并时签名可能已过期
 *         过期的签名URL经由video-proxy转发到OSS时，OSS直接返回403 AccessDenied
 *         即使重试3次(1.5s/3s/4.5s退避)也会持续403——签名本身无效，重试无意义
 *   修复: 下载循环开始前，批量调用 POST /oss/sign-urls 刷新全部 OSS URL（expiresIn=7200s=2h）
 *         freshUrlMap: Map<originalUrl, freshSignedUrl>缓存新签名
 *         proxy下载+direct下载两条路径均改用 effectiveUrl（新签名 OR 原URL降级）
 *         非OSS URL（火山引擎CDN等）不在过滤范围，不受影响
 *         预签名请求失败时降级为原URL（warn日志+继续），不中断合并流程
 *
 * v6.0.124 - 2026-02-26
 * - 修复: useSeries轮询并发限制从2提升至5
 *   根因: ids.slice(0,2)导致超过2部并发生成的漫剧无法获得状态轮询更新
 *         第3+部漫剧在生成完成后不会自动刷新UI状态，用户需手动刷新
 *   修复: seriesToPoll改为ids.slice(0,5)，最多同时轮询5部并发生成的漫剧
 * - 增强: SeriesCard卡住任务自动重试倒计时
 *   根因: 当generate-full-ai因Edge Function超时被杀死时，series.status永久停在
 *         'generating'，用户必须手动发现并点击"重试"——操作路径过长
 *   改进: isStuck=true时(超过10分钟无更新)自动启动60秒倒计时
 *     - SVG圆形进度条直观显示倒计时进度（琥珀色）
 *     - 显示"已超过X分钟未更新"精确用时
 *     - 显示"Xs后自动重试"带[取消][立即重试]按钮
 *     - 倒计时归零自动调用onRetry(forceRetry:true)，无需用户干预
 *     - 用户取消后显示手动[重试]按钮，不再自动触发
 *     - isStuck变回false时（重试成功后series状态更新）自动清除倒计时
 *
 * v6.0.123 - 2026-02-26
 * - 维护: 入口文件VERSION字符串同步——index.tsx + make-server-fc31472c/index.ts 残留 "v6.0.77"
 *   根因: v6.0.77之后两处入口文件的 const VERSION 从未随版本升级同步，日志显示版本号
 *         比实际代码落后45个版本，难以从日志判断实际部署的app.tsx版本
 *   修复: 两处入口文件 VERSION 统一更新至当前版本号，随后版本将持续三处同步
 * - 清理: 移除App.tsx开发诊断日志（DIAG console.log模块预检块）
 *   根因: v6.0.113引入的25条 Promise.all([import(...)]) 模块预检日志属于临时调试手段
 *         motion/react动态导入失败已在v6.0.113修复，诊断块已完成使命但遗留在生产代码中
 *   影响: 每次页面加载触发25个额外import()调用+25条console日志，增加启动耗时和控制台噪声
 *   修复: 删除 DIAGNOSTIC 块（约30行），保留正常的lazy import和ErrorBoundary机制
 *
 * v6.0.122 - 2026-02-26
 * - 修复: [关键] "send was called before connect" — Deno TCP层断连错误静默处理
 *   根因: Deno HTTP栈在以下场景抛出该错误:
 *     1. 客户端在TCP握手完成前断开连接（load balancer健康检查竞态）
 *     2. 客户端在服务端发送响应前关闭连接（用户中途取消请求/超时）
 *   症状: Hono onError捕获该错误后调用c.json()发送500，但连接已关闭，触发同样错误——递归
 *   修复1: app.onError检测5种断连错误特征字符串，命中时返回空Response(200)替代c.json(500)
 *          特征: 'send was called before connect' / 'connection closed' / 'Broken pipe' /
 *                'broken pipe' / 'Connection reset by peer'
 *   修复2: index.tsx + make-server-fc31472c/index.ts 的 Deno.serve 包装app.fetch为:
 *          app.fetch(req).catch(err => { if断连错误 return new Response('', {status:200}) })
 *          双层防御：Hono层(onError) + Deno.serve层(fetch catch)全覆盖
 *
 * v6.0.121 - 2026-02-26
 * - 修复: [关键] 合并分镜不跳过分镜——包容所有分辨率段，确保完整合并
 *   1. mp4-concat.ts concatMP4: 移除分辨率多数派过滤(v6.0.108引入)，改为仅记录警告并包含所有段
 *      现代H.264/H.265解码器可处理流内SPS分辨率变更，合并视频将包含全部分镜
 *   2. ClientVideoMerger.tsx clientMergeEpisode: 移除分辨率预过滤(v6.0.109-111引入)
 *      excludedScenes/majorityResolution字段保留但始终为空，保持调用方接口兼容
 *   3. 若下载失败(所有重试耗尽)则抛出错误而非静默跳过，用户可看到明确失败原因
 *   4. StoryboardEditor.tsx: 移除分辨率不匹配自动修复流程(auto-fix loop)，简化合并路径
 *      合并直接从clientMergeEpisode读取blobUrl+sizeMB+warnings，不再处理excludedScenes
 * - 修复: vite.config.ts framer-motion alias改用直接依赖路径
 *   原路径: path.resolve(__dirname, 'node_modules/.pnpm/framer-motion@12.34.3_.../...')
 *   新路径: path.resolve('./node_modules/framer-motion')
 *   framer-motion已在package.json中声明为直接依赖，pnpm会在node_modules根级创建symlink
 *   新路径更鲁棒：不受pnpm virtual store路径变化影响，跨安装环境一致
 *
 * v6.0.120 - 2026-02-25
 * - 增强: StyleAnchorPanel无锚定态场景选择 + 分集分组 + 批量生成后锚定建议
 *   1. 无锚定图时: 除上传按钮外，新增"从已生成场景选择"入口（有场景时显示）
 *   2. 场景选择器分集分组: 按E1/E2/...分组展示缩略图，多集时更易定位
 *   3. 批量生成完成后: 若无锚定图且有已完成场景，toast提示设置锚定
 *
 * v6.0.119 - 2026-02-25
 * - 增强: SeriesEditor风格锚定图管理面板
 *   1. StyleAnchorPanel: 展示当前锚定图/来源/时间/升级历史
 *   2. 手动更换: 上传新图或从已生成场景缩略图中选择
 *   3. 场景选择器: 展开后显示所有分集中已生成的场景缩略图网格
 *   4. 后端PUT合并: styleAnchorImageUrl安全合并到coherence_check JSONB
 *
 * v6.0.118 - 2026-02-24
 * - 增强: [关键] 全自动i2v风格链——零手动操作实现全系列视觉一致性
 *   1. 参考图→E1S1首帧注入: generate-full-ai完成后自动将referenceImageUrl写入E1S1.image_url
 *      效果: E1S2+生成视频时prev-scene查询直接命中(无需走style anchor回退路径)
 *      完整链路: referenceImageUrl→E1S1→E1S2→...→E{n}S{m}，风格从首帧逐场景传递
 *   2. storyboard.image_url自动升级: volcengine/status回调中同步thumbnail→storyboard.image_url
 *      效果: (a) UI展示真实生成缩略图 (b) 后续场景的prev-scene i2v引用自动升级为生成画面
 *   3. 两阶段anchor锚定: user-upload初始锚→首个生成场景thumbnail自动替换
 *      阶段1: 创建时referenceImageUrl设为styleAnchorImageUrl(立即可用)
 *      阶段2: 首个视频完成→真实Seedance输出自动替换user-upload锚
 *      保留styleAnchorUpgradedFrom='user-upload'追踪升级历史
 *      已有生成场景锚→不再覆盖(防止后续场景抢占)
 *
 * v6.0.117 - 2026-02-24
 * - 增强: 参考图→风格锚定——创建时上传的参考图同时设为styleAnchorImageUrl
 * - 移除: 确定性seed参数——Seedance API不支持/忽略seed参数
 *
 * v6.0.116 - 2026-02-24
 * - 增强: [关键] 风格一致性三重锁定——彻底解决跨场景画风漂移
 *   1. 风格锚定图: 首个完成的视频场景的thumbnail自动保存到coherence_check.styleAnchorImageUrl
 *      后续场景无前序图片(scene1 ep1、或前序场景未生成)时，回退使用style anchor作为i2v参考
 *      查找优先级: coherence_check.styleAnchorImageUrl → 系列中首个有image_url的分镜
 *      volcengine/status完成回调: 自动检测+保存anchor(仅首次，不覆盖)
 *   3. 首帧提示注入: 即使当前场景已使用前序场景图片作为i2v(保证时序连贯)
 *      prompt中仍注入「全系列视觉基准帧」提示，引用style anchor场景号
 *      防止"电话游戏效应"——每场景只参考上一场景，风格步漂移远离原始风格
 *
 * v6.0.115 - 2026-02-24
 * - 修复: [关键] 重试按钮永远不生效——幂等性守卫静默BLOCK所有重试请求
 *   根因: retrySeries流程先调用POST /series/:id/generate(更新updated_at为now)
 *         然后调用POST /series/:id/generate-full-ai
 *         generate-full-ai检查: status='generating' && elapsedMs < 10min → BLOCK
 *         由于第一步刚刚设置updated_at=now，elapsedMs≈0 → 永远被BLOCK
 *         返回 { alreadyGenerating: true } 但前端不检查此标志，显示"重新开始"成功
 *         实际上后端什么都没做，任务永远卡在generating状态
 *   修复: 前端retrySeries传递 forceRetry:true 到generate-full-ai请求体
 *         后端forceRetry=true时跳过幂等性检查，允许重新生成
 * - 修复: 分镜生成retry使用未修复prompt(sbPrompt而非sbPromptFixed)
 *   根因: v6.0.112引入的sbPromptFixed(Unicode乱码修复版)仅在首次AI调用时使用
 *         retry路径仍引用原始sbPrompt(含U+FFFD乱码)，导致retry分镜质量下降
 *   修复: retry AI call的content从sbPrompt改为sbPromptFixed
 * - 增强: 分镜文本生成风格一致性——三处改进减跨批次画风漂移
 *   1. visualStyleGuide截断从500→1000字符（500字切断角色外貌卡+色彩方案关键参数）
 *   2. 始终注入baseStylePrompt风格DNA（即使有visualStyleGuide也补充，确保跨批次基因一致）
 *   3. 上述两项使每批次分镜prompt收到的风格信息从~500字提升至~1200字，参数完整度100%
 *
 * v6.0.114 - 2026-02-24
 * - 修复: [关键] video-proxy下载Failed to fetch——GET query string超长+Edge Function过载
 *   根因: OSS签名视频URL(300-500+字符)经encodeURIComponent后追加到GET query string
 *         总URL长度可超过浏览器/CDN/Edge Function网关限制，导致fetch()抛TypeError: Failed to fetch
 *         同时AI生成期间Edge Function高负载，代理请求被拒概率增大
 *   修复1: 服务端新增POST /video-proxy handler——URL通过请求体传递，彻底消除URL长度限制
 *          GET handler保留向后兼容，POST/GET共用handleVideoProxy()内部函数
 *   修复2: 客户端ClientVideoMerger改用POST方法调用video-proxy
 *          headers添加Content-Type: application/json，body传递{url: rawUrl}
 *   修复3: 重试次数从3次(proxyRetries=2)提升至4次(proxyRetries=3)
 *          退避策略优化: 2s/4s → 1.5s/3s/4.5s/6s渐进退避，应对Edge Function冷启动/过载
 *   版本: 三处同步 app.tsx头部注释 + constants.ts + version.ts
 *
 * v6.0.113 - 2026-02-24
 * - 修复: [关键] 前端动态导入失败——framer-motion缺失导致所有motion/react组件无法加载
 *   根因: motion包的motion/react子路径(dist/es/react.mjs)实际内容为`export * from 'framer-motion'`
 *         framer-motion虽是motion的dependencies但pnpm严格模式不将其提升到root node_modules
 *         Vite无法解析framer-motion → 所有20个使用motion/react的前端组件动态导入失败
 *         (Failed to fetch dynamically imported module: .../LoginDialog.tsx 等)
 *   修复: vite.config.ts新增resolve.alias将framer-motion直接指向pnpm virtual store中的实际包路径
 *         (.pnpm/framer-motion@12.34.3_.../node_modules/framer-motion)
 *         同时通过install_package将framer-motion@^12.34.3加为直接依赖(package.json显式声明)
 *   范围: 全部28个motion/react导入点恢复正常(motion、AnimatePresence、m等所有API均可用)
 *
 * v6.0.112 - 2026-02-24
 * - 修复: [关键] Unicode U+FFFD乱码彻底清除——11处无法直接字节匹配的残留损坏字节
 *   根因: 部分乱码字节序列（约11处）因实际字节与字符串表示不匹配，导致
 *         edit_tool/fast_apply_tool均无法直接定位替换；前次修复仅处理了18处可匹配字节
 *   修复策略: 覆盖修正法（不删除原损坏行，改为在清洁锚点插入运时修正代码）
 *     1. sbPrompt2 (generate-storyboards-ai): 插入 .replace(/regex/) 修正剧集标题/出场角色
 *     2. extraCtx描述写法指南 (generate-storyboards-ai): extraCtx[last] 替换为正确内容
 *     3. tpls[2].desc (fallback场景): 覆盖为'关键对话，推动剧情'
 *     4. charPromptLines (角色生成prompt): charPromptLinesFixed 修正纤细/健壮描述
 *     5. epGenPromptLines (剧本生成prompt): epGenPromptFixed 修正情节反转描述
 *     6. characterRows fallback: 直接赋值修正故事的主人公描述
 *     7. sbPrompt (批次分镜生成): sbPromptFixed 修正情感基调/前景背景层次
 *     8. syn fallback: synFixed = '故事展开' 替代损坏的回退值
 *   影响: 所有AI提示词现已100%无乱码，角色外貌/场景描述/剧本大纲生成质量提升
 *
 * v6.0.111 - 2026-02-22
 * - 修复: [关键] 分辨率不一致自动检测+重新生成——合并时少数派分镜自动 forceRegenerate 后重新合并
 *   根因: 火山引擎 Seedance 模型有时不遵守 width/height 参数，输出与请求分辨率不同的视频
 *         （如请求 9:16 720×1280 但输出 16:9 1280×720），这是 AI 模型固有行为
 *   v6.0.108~110: 仅排除异分辨率段+警告，用户需手动重新生成
 *   v6.0.111 修复: 合并时检测到分辨率不匹配 → 自动 forceRegenerate 少数派分镜（4个）→ 重新合并
 *   三处修复:
 *     1. ClientMergeResult 新增 excludedScenes/majorityResolution 结构化字段
 *     2. clientMergeEpisode 新增 preferredResolution 选项（与服务端 mp4concat.ts v6.0.93 对齐）
 *        — 之前客户端仅用多数派投票，当旧/错误分辨率视频数量多时可能选错分辨率基准
 *        — 现在优先使用系列 coherence_check.aspectRatio → ASPECT_TO_RESOLUTION 映射
 *     3. StoryboardEditor 自动合并流程: 检测 excludedScenes → 逐个 forceRegenerate → 重新合并
 *        — hasAttemptedAutoFix ref 防止无限循环（仅尝试一次）
 *        — MAX_AUTO_REGEN_SCENES=4 限制自动重生成数量（超出仍走排除+警告路径）
 *     4. useEpisodeActions.handleMergeVideos 传递 preferredResolution 到 clientMergeEpisode
 *   新增: utils/index.ts 导出 ASPECT_TO_RESOLUTION 映射（客户端+服务端统一）
 *
 * v6.0.110 - 2026-02-22
 * - 修复: [关键] 客户端视频下载三重故障
 *   1. 下载策略反转: proxy-first → direct-fallback
 *      原因: 直接 fetch OSS URL 在浏览器中因 CORS 必定失败（TypeError: Failed to fetch），
 *            每个段都浪费一次无意义的直接下载尝试才回退到代理
 *      修复: 代理优先（Supabase Edge Function 代理无 CORS 问题），直接下载仅作兜底
 *   2. 超时防挂: 客户端 + 服务端双重 AbortController 超时
 *      原因: Scene 8 的 OSS 源 URL 已失效/超时，proxy 无限等待导致 Edge Function 挂起，
 *            最终被平台杀死，客户端收到裸 "Failed to fetch"（无超时控制）
 *      修复: 服务端 video-proxy 上游 fetch 加 30s AbortSignal.timeout + 504 响应；
 *            客户端 fetchWithTimeout 封装：代理 45s / 直接 30s 超时，指数退避重试(2s→4s)
 *   3. 场景号追踪: SegmentMeta 贯穿全链路（下载→预过滤→合并→报告）
 *      原因: v6.0.109 分辨率排除只报告段索引 [2,3,4]，用户无法知道对应哪些场景
 *      修复: 段数组改为 SegmentMeta[]（含 sceneNumber），排除报告精确到场景号，
 *            clientMergeEpisode 返回 warnings:string[] 供 toast 显示
 *
 * v6.0.109 - 2026-02-22
 * - 修复: [关键] 批量合并分辨率多数派漂移导致合并失败
 *   原因: concatMP4 内部的分辨率过滤是 per-call 的，batch concat 每批独立过滤
 *         batch1: majority=1280x720 → 排除720x1280段 → intermediate=1280x720
 *         batch2: intermediate(1280x720) 变少数派 → 被排除 → 前面的合并结果丢失
 *   修复: clientMergeEpisode 下载完所有段后，进入 batch concat 之前，
 *         先用 getVideoResolution() 统一检测全部段的分辨率，
 *         按多数派投票预过滤，排除异分辨率段，确保后续 batch 间分辨率一致
 *   新增: mp4-concat.ts 导出 getVideoResolution(buf) 轻量 MP4 分辨率读取函数
 *
 * v6.0.108 - 2026-02-22
 * - 修复: ClientVideoMerger 客户端合并下载 HTTP 401 — 三级下载策略
 *   原因: fetch(/video-proxy) 无 Authorization 头被 Supabase 网关拒绝
 *   策略 1: 直接下载 OSS 公开桶 URL（绕过代理，无需 Supabase 网关认证）
 *   策略 2: 代理下载 /video-proxy + Authorization + apikey 双头（绕过 CORS）
 *   策略 3: 两种方式均失败则跳过该分镜，继续合并其余视频
 * - 修复: MP4 concat 分辨率不一致导致合并崩溃 — 改为宽容模式
 *   原因: 部分分镜视频分辨率不一致(如1280x720 vs 720x1280)，concatMP4 严格模式直接 throw
 *   修复: 多数派分辨率投票 → 排除不匹配的分镜段 → 继续合并其余一致分辨率的段
 *   ConcatResult 新增 excludedSegments 字段供调用方感知被排除的段数
 *
 * v6.0.107 - 2026-02-22
 * - 重建: useEpisodeActions.ts 完整重建（fast_apply_tool 截断修复）
 *   handleMergeVideos 新增 skippedEpisodes 自动本地合并逻辑（v6.0.107）：
 *     merge-all-videos 返回 skippedEpisodes:number[] 时逐集调用 clientMergeEpisode
 *     本地合并成功 → 自动触发浏览器 <a download> 下载集视频 MP4
 *     失败 → 计入 totalFailed 并记录 console.error（不中断其他集）
 *   handleSmartGenerate 保留 v6.0.92 七阶段定时器进度反馈(5s/18s/40s/80s/140s/210s/270s)
 *   handleAddEpisode / handleRepairSingleEpisode / handleSyncThumbnails 全量恢复
 *
 * v6.0.106 - 2026-02-22
 * - 增强: merge-all-videos 路由 OOM 防御——per-episode >6 分镜跳过服务端合并
 *   与 merge-videos 统一策略: 每集分镜数 >6 或预估 >60MB 直接 skip + 记录到 skippedEpisodes
 *   响应新增 skippedEpisodes:number[] + useClientMerge:boolean 供前端按需本地合并
 * - 清理: 移除 4 个死依赖——@ffmpeg/ffmpeg、@ffmpeg/util、@tailwindcss/vite、tw-animate-css
 *   @ffmpeg/* (~31MB WASM): v6.0.105 已替换为纯 TS MP4 concat零代码引用
 *   @tailwindcss/vite: vite.config.ts 未使用（v6.0.89 已标记）
 *   tw-animate-css: 项目全部动画走 motion/react，animate-in/fade-in 等 class 零使用
 *
 * v6.0.105 - 2026-02-22
 * - 修复: [关键] Edge Function OOM (HTTP 546 WORKER_LIMIT) 多层防御
 *   后端 merge-videos:
 *     分镜数 >6 或预估 >60MB 时提前返回 useClientMerge:true（不下载不合并，零内存消耗）
 *     HTTP 200 + success:false + useClientMerge:true 信号，前端三重检测确保不丢失
 *   前端 StoryboardEditor auto-merge 智能路由:
 *     >6 镜 → 直接跳过服务端，走纯 TS 本地合并（避免无谓的服务端请求+超时等待）
 *     ≤6 分 → 仍优先服务器合并，失败/useClientMerge 信号 → 自动回退本地
 *   video.ts mergeEpisodeVideos:
 *     三重 useClientMerge 检测（顶层属性 / data子属性 / 错误字符串关键词）
 *     HTTP 546/WORKER_LIMIT 错误自动标记 useClientMerge
 *   核心替换: FFmpeg.wasm → 纯 TypeScript MP4 concat 引擎 (mp4-concat.ts ~500行)
 *     根因: FFmpeg.wasm 在跨域 iframe (Figma preview) 中 Worker 被 SecurityError 阻断
 *     ClientVideoMerger.tsx 现在主线程直接 MP4 解析/拼接，无需 Worker 和 WASM
 *     零外部依赖，无需 CDN 加载 31MB WASM，兼容所有浏览器环境
 *
 * v6.0.104 - 2026-02-22
 * - 修复: [关键] 端卡住检测崩溃——函数/状同名冲突(isGenerationStale)导致TypeError
 *   SeriesEditor.tsx:
 *     顶层函数isGenerationStale重命名为checkGenerationStale（消除与useState状态变量的命名冲突）
 *     此前: const [isGenerationStale, setIsGenerationStale] = useState(false) 遮蔽了同名函数
 *           调用isGenerationStale(localSeries, 8)时实际调用boolean(...)→TypeError崩溃
 *   卡住检测升级——双信号追踪(generationProgress + updatedAt)：
 *     新增lastUpdatedAtRef追踪updatedAt变化（后端heartbeat更新updated_at也视为活跃信号）
 *     任一信号变化→重置stalePollCount（此前仅追踪generationProgress，heartbeat更新被忽视）
 *     阈值从18次(90s)提升至36次(180s)——AI单次调用可达90s，原阈值导致正常生成被误判
 * - 修复: [关键] 后端心跳机制增强——每批次+重试+对话润色三处注入heartbeat
 *   app.tsx generate-full-ai:
 *     心跳位置从「首次AI调用前」→「每批次循环开始时」(覆盖5+批次的长时间运行)
 *     新增: retry AI call前的心跳(retry也可达90s)
 *     新增: 对话AI润色前的心跳
 *     删除: 旧的单点心跳(已被批次级心跳覆盖)
 *   根因: 原心跳仅在首次AI调用前触发一次，10集剧(5批次×~180s)后续批次无心跳
 *         前端updatedAt检测在中后期批次时误判为超时（距首次心跳已过8+分钟）
 *
 * v6.0.103 - 2026-02-22
 * - 修复: [关键] 画面风格一致性增强——全量注入视觉风格指南+风格DNA锚点
 *   后端 volcengine/generate:
 *     视觉风格指南从60字片段→全段注入(色彩200字+构图200字+环境200字+角色外貌卡400字)
 *     styleLock增强——注入色彩方案+光影规范具体参数(此前仅有风分类描述)
 *     新增「风格DNA」锚点——STYLE_PROMPTS全文注入，确保每个分镜收到完全相同的风格基因
 *     contextParts标题改为「全系列视觉风格指南——所有分镜必须100%遵守」（提升AI注意力权重）
 *   根因: 此前每个分镜仅收到~180字碎片化风格信息(3段×60字)
 *         不同分镜的色调/光影/质感/渲染手法参数不一致导致画风漂移
 *         修复后每个分镜收到~1200字完整风格规范，视觉参数完全对齐
 * - 修复: [关键] 生成卡住前端自愈——SeriesEditor智能检测+一键重试
 *   SeriesEditor.tsx:
 *     新增 isGenerationStale() 检测函数（updatedAt > 8分钟视为卡住）
 *     轮询追踪 lastProgressRef + stalePollCountRef（连续18次/90秒无进度变化→标记卡住）
 *     GeneratingBanner 新增 isStale 模式：琥珀色警告横幅+「可能已超时」文案+重试按钮
 *     状态恢复后(status!='generating')自动清除卡住标记
 *   根因: Edge Function长任务(>150s)可能被运行时杀死，catch块无法执行
 *         series.status永久停在'generating'，端无限轮询无法自愈
 *
 * v6.0.102 - 2026-02-22
 * - 功能: 管理员付款推送通知系统
 *   后端:
 *     新增 GET /admin/pending-count 轻量端点（仅返回 pending 数量，供轮询用）
 *     每次请求只读取最近50条记录，DB 读取量约为 /admin/payments 的 1/2
 *   前端 useAdminPaymentPoller hook:
 *     管理员登录后每 60s 轮询 /admin/pending-count
 *     首次拉取建立基线（不推送），后续数量增加才触发通知
 *     基线持久化到 localStorage（key: admin_pay_baseline_<phone>），刷新不重复提醒
 *     新付款到达时:
 *       1. OS 系统通知（需 Notification 权限 granted）— 含 requireInteraction，停留至用户交互
 *          通知点击 → window.focus() + 自动打开 AdminPanel 到付款记录 tab
 *       2. In-app Toast（带"立即查看"按钮，无论权限状态均触发）
 *     权限状态持续同步（10s 检查一次，捕获用户在系统设置修改的情况）
 *   Header.tsx:
 *     新增 pendingPaymentCount prop → 管理按钮右上角红色角（数量 > 99 显示 99+）
 *     角标带 animate-pulse 脉冲动画，视觉突出
 *   AdminPanel.tsx:
 *     新增 defaultTab prop（通知点击时直接跳付款记录 tab）
 *     新增 onRequestNotifPermission / notifPermission prop
 *     顶部提示条: 权限非 granted 时显示琥珀色横幅 + "开启通知" 按钮
 *     设置 tab 新增"付款到达通知"区块（状态/开启/拒绝说明）
 *   App.tsx:
 *     集成 useAdminPaymentPoller，adminPanelDefaultTab 状态控制打开 tab
 *     onAdminClick 重置 defaultTab='users'；通知回调设 defaultTab='payments'
 *
 * v6.0.101 - 2026-02-22
 * - 功能: 视频合并无感化 — 自动合并 + 智能下载钮
 *   核心逻辑 (StoryboardEditor.tsx):
 *     allVideosReady = 所有分镜都有 videoUrl 且无 generating 状态
 *     allVideosReady → 自动触发合并（用 autoMergeTriggered ref 防重复）
 *       1. 先尝试服务器合并 (mergeEpisodeVideos)
 *       2. 服务器失败 → 自动回退到浏览器端 FFmpeg 本地合并 (clientMergeEpisode)
 *     自动合并进度条: 紫色细条，非侵入式，在生成进度条下方显示
 *     完成状态条: 绿色，带"下载"快捷按钮
 *   智能下载按钮 (替代手动"合并分视频"按钮):
 *     idle/未全部生成 → 灰色禁用（显示 completedCount/total）
 *     merging         → "合并中 X%" 紫色按钮（点击排队，合并完毕自动触发下载）
 *     done + blobUrl  → 绿色"下载分集视频"（点击直接下载本地 blob）
 *     done + serverUrl→ 绿色"下载分集视频"（点击 fetch→blob→下载）
 *     error           → 橙色"重试合并"（重置 autoMergeStatus→idle 重触效果）
 *   pendingDownload 机制: 用户在合并中途点击下载 → 设 pendingDownload=true
 *                        合并完成后 useEffect 自动调用 handleDownloadEpisode
 *   isMountedRef: 防止组件卸载后 setState 报警告
 *   ClientVideoMerger.tsx: 提取 clientMergeEpisode 为独立导出函数（StoryboardEditor 使用）
 *                          UI 组件改名备注为"备用本地合并"，收纳在可折叠面板中
 *   StoryboardVideoMerger.tsx: 移除 ClientVideoMerger 引用（不再作为用户可见的独立入口）
 *
 * v6.0.100 - 2026-02-22
 * - 修复: 管理员账号(18565821136)在管理员面板用户列表中显示"今日: 0/5免费"
 *   根因: /admin/users 未区分管理员与普通用户，返回的 freeLimit 与普通用户相同
 *   修复方案:
 *     后端: users mapping 中检测 ADMIN_PHONE → isAdmin=true, freeLimit=-1（-1表示无限制）
 *     前端AdminPanel: UserRecord 新增 isAdmin 字段
 *            用列表行: isAdmin → 显示"管理员 · 无限配额"（琥珀色圆点 + 文字）
 *            展开编辑面板: isAdmin → 显示"⚡ 管理员账号无需配置配额，默认享有无限生成权限"提示
 *                        → 隐藏"保存"按钮（无意义的配额修改）
 *            "编辑配额设置"按钮: isAdmin → 改为"查看账号信息"
 *   既有保障（已正确）:
 *     GET /user/video-quota/:phone → isAdmin=true 时返回 freeLimit:999, totalRemaining:999
 *     视频生成检查/扣减均已 userPhone !== ADMIN_PHONE 跳过
 *     ProfilePanel 的 QuotaCard → isAdmin=true 时显示"管理员账号 · 无限配额"
 *
 * v6.0.99 - 2026-02-22
 * - 功能: 客户端本地视频合并（ClientVideoMerger + 服务器 /video-proxy 代理路由）
 *         根本解决"服务器计算资源不（视频文件过大）"问题
 *
 *   架构：「服务器仅做轻量 HTTP 代（零 FFmpeg）」+「浏览器端 FFmpeg.wasm 本地拼接」
 *
 *   GET /make-server-fc31472c/video-proxy?url=<encoded>
 *         - 纯字节流转发，无任何视频处理，彻底不消耗服务器 CPU/内存
 *         - 解决 OSS/Volcengine CDN 的 CORS 限制
 *         - 安全：仅允许 HTTPS URL
 *
 *   ClientVideoMerger.tsx（series/ClientVideoMerger.tsx）
 *         - 阶段1: 从 CDN (jsdelivr) 加载 @ffmpeg/core WASM (~31MB，次后浏览器缓存)
 *         - 阶段2: 通过 /video-proxy 逐一下载各分镜视频到 WASM 虚拟文件系统
 *         - 阶段3: ffmpeg -f concat -c copy（流复制，不重新编码，快速无损）
 *         - 阶段4: 生成 Blob URL，自动触发浏览器下载 MP4
 *         - 可折叠 UI：平时收起，展开后显示三阶段进度条（分格子视频下载进度）
 *
 *   StoryboardVideoMerger.tsx：服务器合并 + 本地合并并列展示
 *         - 原"合并分镜视频"按钮（服务器 ffmpeg）保持不变
 *         - 新增"本地合并下载"可折叠卡片（ClientVideoMerger）
 *         - 当服务器合并失败时，本地合并成为明确的备选方案
 *
 * v6.0.98 - 2026-02-22
 * - 功能: ProfilePanel 配额卡片（QuotaCard 组件）
 *         - profile/index.tsx: 新增 QuotaCard 组件——进度条/今日用量/剩余次数/颜色状态(绿→橙→红)
 *         - 普通用户: 今日已用 X/N 个免费 · 剩余M次 · 「购买更多」按钮
 *         - 管理员: amber色卡片「管理员账号 · 无限配额」+ 「管理控制台」入口（移动端可见）
 *         - 配额用尽: 卡片变红 + 全宽「今日配额已用完 · 点击购买配额继续创作」按钮
 * - 功能: useVideoQuota hook（hooks/useVideoQuota.ts）
 *         - 获取 GET /user/video-quota/:phone，返回 VideoQuotaInfo
 *         - ProfilePanel + StoryboardEditor 两处复用
 * - 功能: StoryboardEditor 配额徽章
 *         - 「一键生成视频」按钮旁显示「今日剩余 N 次」(< 3次橙色, 0次红色, 充足灰色)
 *         - 仅批量未生成场景存在时显示（减少干扰）
 * - 修复: ProfilePanel 补充 toast import（toast.error 无导入的旧 bug）
 * - 修复: App.tsx 向 ProfilePanel 传递 onOpenPayment/onOpenAdmin callbacks
 *         - 移动端用户通过「我的」→ ProfilePanel QuotaCard 管理控制台按钮进入 AdminPanel
 *
 * v6.0.97 - 2026-02-22
 * - 集成: PaymentDialog + AdminPanel挂载到App.tsx（此前组件已存在但未集成到主应用）
 *         - App.tsx: lazy import两组件 + useEffect订阅onQuotaExceeded全局事件
 *         - utils/events.ts: 新建QuotaExceededInfo事件总线（onQuotaExceeded/emitQuotaExceeded）
 *         - 配额超限触发链路：volcengine/generate→createVideoTask(429解析)→emitQuotaExceeded→PaymentDialog弹出
 *         - 批量生成（hooks.ts）配额超限时立即中止并弹出PaymentDialog
 *         - Header.tsx: 新增onAdminClick prop，管理员账号显示「管理」按钮（Shield图标）
 *         - AdminPanel: 新增「设置」标签页用于管理员配置微信收款码URL
 * - 修复: Header.tsx去除Settings图标（已无用），改用Shield+amber标识管理员入口
 * - 修复: Toaster位置从top-center→bottom-right（避免遮挡桌面端Header导航菜单）
 *
 * v6.0.96 - 2026-02-22
 * - 功能: 每日视频生成配额限制（非管理员账号每天最多5个免费，超出需付费5元/个）
 *         - 后端: volcengine/generate检查每日配额，超出返回429+quotaExceeded=true
 *         - 后端: kv_store存储 daily_video_count:{phone}:{date} / user_daily_limit:{phone} / user_paid_credits:{phone}
 *         - 前端: PaymentDialog.tsx——微信支付二维码+付款金额输入+付款记录提交
 *         - 前端: hooks.ts——detectQuotaExceeded→触发PaymentDialog
 * - 功能: 管理员面板（18565821136账专属）
 *         - AdminPanel.tsx——注册用户列表(手机号/昵称/注册时间/最近登录/今日配额)
 *         - 管理员可手动编辑用户每日免费额度和付费配额
 *         - 付款记录管理（查看/批准/拒绝）
 *         - 后端: GET /admin/users / PUT /admin/users/settings / GET/POST /admin/payments
 * - 修复: Toast通知位置——从top-center改为bottom-right，不再遮挡PC端导航菜单
 * - 功能: 新建剧默认集数3集（原10集）
 * - 修复: 视频合WORKER_LIMIT——>6段时改为链式批量concat，峰值内存降低60%+
 *         根因: Edge Function一次性加载N×10MB分段+输出副本，OOM/CPU超限
 *         修复: ≤6段直接合并；>6段链式分批（每批4段），释放已处理段辅助GC
 *         同时修复: mergeEpisodeVideos前端处理546 WORKER_LIMIT错误为友好提示
 *
 * v6.0.92 - 2026-02-22
 * - 修复: [关键·后端] 竖屏/方屏视频角色主体不在主画面问题
 *         根本原因: Seedance模型默认按16:9横屏构图习惯生成内容，当输出竖屏(720×1280)时
 *                   角色被放置在画面边缘/局部，主体不完整可见
 *         修复: volcengine/generate由新增ASPECT_FRAMING_DIRECTIVES映射(9:16/1:1/3:4/4:3/16:9)
 *               注入prompt最高优先（styleLock之后第一行）
 *         9:16竖屏指令: 垂直中轴居中+头顶在20%-35%区域+人脸高度≥画面20%+严禁左右偏移裁切
 *         所有比例均有对应的构图强制规范
 * - 修复: [关键·前端] AI生成分镜按钮无loading状态+数据提取Bug
 *         根因①: handleGenerateAIScript无isGeneratingAI状态，按钮无加载反馈
 *         根因②: result.data.storyboards||[]错误——generateStoryboards返回data为数组本身
 *                 导致每次AI生成分镜成功后0个分镜被添加到UI
 *         修复: 新增isGeneratingAI状态+按钮loading样式+数据提取改为Array.isArray(result.data)?result.data:result.data?.storyboards||[]
 * - 增强: 一键生成视频进度细粒度——batchProgress新增currentScene字段
 *         进度条实时显示"正在生成场景 X..."（原仅每个视频完成后更新计数，8+分钟无变化）
 *         添加次级indeterminate进度动画，给长时间轮询提供活跃感
 * - 增强: 智能生成进度分阶段动态反馈——handleSmartGenerate添加7阶段定时器
 *         原问题: generateFullAI仅在启动时调用一次onProgress，5分钟内进度文字不变
 *         修复: 5s/18s/40s/80s/140s/210s/270s七个阶段定时器提供程中文进度描述
 *         finally块清除所有定时器防止泄漏
 *
 * v6.0.91 - 2026-02-22
 * - 修复: [关键] generate-full-ai完成日志ReferenceError→status覆写为failed
 *         根因: v6.0.90将变量重命名 allSbRows→batchRows, dialogueFillStats→accumDialogueFillStats,
 *               dialogueAiEnhanced→accumDialogueAiEnhanced，但完成日志(L5066)仍使用旧名
 *         影响: 每次generate-full-ai成功完成后，series.status被错误覆写为'failed'而非'completed'
 *               (series内容和分镜均已正确写入DB，仅状态和前端反馈错误)
 *         修复: L5066 完成日志模板字符串改用 accumDialogueAiEnhanced/accumDialogueFillStats
 * - 维护: 路由索引行号全量校准——v6.0.63以来累积偏移已超过550行
 *         [A]~330 [B]~469 [C]~614 [D]~1197 [E]~1488 [F]~1775 [G]~1843 [H]~2370
 *         [I]~3353 [J]~3577 [K]~3976 [L]~5099 [M]~5297 [N]~5768 [O]~6296 [P]~6487
 * - 修正: v6.0.90内存优化注释标签——两处v6.0.89标签更正为v6.0.90
 *
 * v6.0.90 - 2026-02-22
 * - 修复: [关键] series_storyboardsgeneration_metadata列——移除全部SELECT/UPSERT中对该列的引用
 *         根因: v6.0.78新增该字段写入但从未创建DB列，导致每次分镜生成请求崩溃
 *         影响: generate-storyboards-ai、generate-full-ai、volcengine/generate三条路径
 * - 优化: generate-full-ai内存优化——allSbRows改为per-batch局部batchRows，处理后立即写DB释放
 *         原架构: 积累全集所有行→最后统一写DB（20集×8场景=160行常驻内存）
 *         新架构: 每批次2集行→对话填充→AI润色→写DB→释放（内存压力恒定）
 *
 * v6.0.89 - 2026-02-21
 * - 清理: 死文件删除——motion-shim.tsx/sonner-shim.tsx/icons.tsx(3个未导入的shim文件)
 * - 清理: 死依赖移除——@tailwindcss/vite(vite.config.ts未使用)
 * - 清理: tailwind.css/theme.css内容已合并至index.css(系统保护文件无法删除)
 * - Unicode修复完成: app.tsx全部137处U+FFFD乱码清零
 *
 * v6.0.88 - 2026-02-21
 * - 重构: hooks.ts拆分——useEpisodeActions提取为独立模块(360行)，hooks.ts降至480行
 * - 重构: version.ts精简——v6.0.0~v6.0.59历史changelog归档为摘要，607行→~170行
 * - 类型: volcengine.ts createVideoTask参数类型补充forceRegenerate字段
 * - 清理: 全量代码审计——未使用import清理、死代码移除、数据库查询优化
 *
 * v6.0.87 - 2026-02-21
 * - 修复: [关键] 分镜fallback必达——AI+retry失败时立即生成fallback分镜
 * - 修复: [关键] POST /series竞态——创建时预设status='generating'
 * - 功能: 分镜视频强制重新生成(forceRegenerate) + 合并视频分辨率自动修复
 * - 修复: 错误处理器stepName Unicode修复
 *
 * v6.0.86 - 2026-02-21
 * - 增强: AI对白智能润色——空dialogue场景模板保底+AI生成上下文对话
 * - 增强: 生成质量统计系统(genStats)
 *
 * v6.0.85 - 2026-02-21
 * - 增强: 分JSON解析增强——repairTruncatedStoryboardJSON+detectAndFillEmptyDialogues
 *
 * v6.0.84 - 2026-02-21
 * - 后端: generate-full-ai分镜AI timeout/max_tokens提升, 批次3集→2集
 * - 后端: sbAiFallback入口条件+重试逻辑修复, 角色描述丰富化
 * - 前端: 视频批量生成重试增强(3次/指数退避/网络容忍阈值8)
 *
 * v6.0.80~83 - 2026-02-21
 * - 画面比例全链路支持: SeriesEditor/EpisodeCard/EpisodePlayer/StoryboardVideoMerger/社区
 * - 共享getAspectCssValue()+ASPECT_RATIO_LABELS工具函数
 * - fetchWithRetry maxRetries=0修复
 *
 * v6.0.65~79 - 2026-02-17~20
 * - mp4concat真正拼接(FFmpeg→纯JS mp4-parser+mp4-builder)
 * - OSS自动转存+签名URL+回退链
 * - H265自动默认+降级, codec preference
 * - 批量视频生成去重+网络韧性+快速失败
 * - 合并诊断面板(failedScenes)+一键重试
 * - 前端模块合并优化(Rollup graph nodes减少)
 *
 * v6.0.60~64 - 2026-02-17
 * - 分镜衔接连贯性(跨集i2v/上下文/对话角色锁定)
 * - handleSmartGenerate批量分镜生成
 * - VideoHealthAlert+SeriesVideoHealthChecker组件
 * - shareUtils统一分享(三级降级)
 * - EpisodeCard prop drilling消除
 *
 * v6.0.0~59 - 2026-02-14~17
 * 里程碑: "一句话创作漫剧" AI-first创作体验
 * 核心: Tab结构(创作|作品|发现|我的), 沉浸式视频播放, 社区系统
 * 安全: 输入钳制/分页限制/白名单字段/频率限制
 * 清理: 27个死件删除, 21处catch补日志, constants归一, apiClient迁移收官
 * 修复: 任务去重/孤儿任务自愈/缓存失效/频URL恢复/PlaylistVideoPlayer双缓冲
 */

export const APP_VERSION = '6.0.132';
export const VERSION_DATE = '2026-02-27';
export const VERSION_DESCRIPTION = 'video-proxy三层修复: timeout增大+DB fallback扩展所有URL+bulk-refresh OSS验证';