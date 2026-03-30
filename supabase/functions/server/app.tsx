/**
 * Hono 服务器应用 - 模块化版本 (v6.0.163)
 * Full changelog: see git history
 *
 * 原因：Supabase Edge Function bundler 只打包入口点的静态导入链中的文件。
 * 子目录文件（database/、routes/、middleware/ 等）不被包含在部署包中。
 * 因此所有关键业务逻辑必须内联在此文件中。
 */
import { Hono } from "npm:hono@4.0.2";
import { cors } from "npm:hono@4.0.2/cors";
import { logger } from "npm:hono@4.0.2/logger";
import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import { concatMP4 } from "./mp4concat.ts";

// ==================== 模块化导入（v6.0.42: 重复基础设施代码清理完成） ====================
import {
  APP_VERSION, PREFIX, VOLCENGINE_API_KEY, ALIYUN_BAILIAN_API_KEY, SUPABASE_ANON_KEY,
  VOLCENGINE_BASE_URL, DOUBAO_CHAT_URL, DASHSCOPE_IMAGE_URL, DASHSCOPE_TASKS_BASE_URL,
  IMAGE_BUCKET, STYLE_PROMPTS, SEEDANCE_BASE_SUFFIX, SEEDANCE_I2V_EXTRA,
  PRODUCTION_TYPE_PROMPTS, PRO_SHOT_MAP,
  MAX_SERVER_MERGE_SEGMENTS, MAX_SERVER_MERGE_SIZE_MB, ESTIMATED_SEGMENT_SIZE_MB,
  getCreativeSeed,
} from "./constants.ts";
import {
  supabase, toCamelCase, toSnakeCase, truncateErrorMsg,
  isRetryableError, queryWithRetry, fetchWithTimeout,
  getErrorMessage, getErrorName, isResolutionMismatchError,
} from "./utils.ts";
import { callAI } from "./ai-service.ts";
import { isOSSConfigured, uploadToOSS, transferFileToOSS, generatePresignedPutUrl, generatePresignedGetUrl, generateVideoSnapshotUrl, ensureOSSCors, resetOSSCorsCache } from "./oss-service.ts";
import { rateLimiters } from "./rate-limiter.ts";
import { getCinematographyBlock, repairTruncatedStoryboardJSON, detectAndFillEmptyDialogues } from "./helpers.ts";
import { buildEpisodeOutlinePrompt, buildStoryboardPrompt, buildStyleGuidePrompt } from "./prompt-builders.ts";

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

// ==================== 内部类型定义 ====================
/** KV store 行——supabase.from('kv_store_fc31472c').select('value') 的返回类型 */
type KvRow = { value: string } | null;
/** handleVideoProxy 的上下文参数（所有字段可选），tryDbFallback 需要全部必填 */
type VideoProxyCtx = { seriesId: string; episodeNumber: number; sceneNumber: number };
/** 分镜视频片段（merge-videos 下载 + 合并流程使用） */
interface VideoSegment {
  sceneNumber: number;
  url: string;
  duration: number;
  title?: string;
  thumbnail?: string;
  presignedUrl?: string;
}

/** DB 行类型定义——消除 Supabase 查询回调中的 `: any` 注解 */
interface UserRow { id: string; phone: string; nickname: string; avatar_url?: string; created_at: string; updated_at?: string }
interface VideoTaskRow {
  id?: string; task_id: string; user_phone: string; prompt?: string; style?: string;
  duration?: number; status: string; volcengine_task_id?: string | null;
  video_url?: string | null; thumbnail?: string | null; series_id?: string | null;
  generation_metadata?: Record<string, unknown> | null;
  created_at: string; updated_at?: string;
}
interface StoryboardRow {
  id: string; series_id: string; episode_number: number; scene_number: number;
  description?: string; dialogue?: string; characters?: string[];
  location?: string; time_of_day?: string; camera_angle?: string;
  duration?: number; emotional_tone?: string;
  image_url?: string; video_url?: string; thumbnail_url?: string; status?: string;
  created_at?: string; updated_at?: string;
}
interface EpisodeRow {
  id: string; series_id: string; episode_number: number; title?: string;
  synopsis?: string; status?: string; growth_theme?: string; key_moment?: string;
  total_duration?: number; thumbnail_url?: string; merged_video_url?: string;
  created_at?: string; updated_at?: string;
  storyboards?: StoryboardRow[];
}
interface SeriesRow {
  id: string; user_phone: string; title: string; description?: string;
  genre?: string; style?: string; status?: string; cover_image_url?: string;
  total_episodes?: number; created_at?: string; updated_at?: string;
  coherence_check?: Record<string, unknown> | null; story_outline?: string;
  current_step?: number; total_steps?: number; generation_progress?: number;
  error?: string | null; theme?: string;
}
interface CharacterRow {
  id: string; series_id: string; name: string; role?: string;
  description?: string; appearance?: string; personality?: string;
  created_at?: string; updated_at?: string;
}
interface KvKeyValueRow { key: string; value: string }
interface CommentRow { id: string; work_id: string; user_phone: string; content: string; created_at: string }
/** Volcengine API 响应 */
interface VolcApiResponse {
  id?: string; task_id?: string; status?: string;
  content?: { video_url?: string; cover_url?: string };
  video_url?: string; thumbnail?: string;
  error?: { message?: string; code?: string };
  message?: string;
  data?: { id?: string };
}
/** bulk-refresh-urls 请求中的单个条目 */
interface BulkRefreshItem { sceneNumber: number; currentUrl: string }
/** bulk-refresh-urls 结果条目 */
interface BulkRefreshResult { sceneNumber: number; originalUrl: string; freshUrl: string; source: string; presignedGetUrl?: string }
/** Volcengine API 请求内容元素 */
interface VolcContentItem { type: string; text?: string; image_url?: { url: string } }
/** AI 解析的角色原始数据 */
interface AIParsedCharacter { name?: string; role?: string; description?: string; appearance?: string; personality?: string; relationships?: string }
/** 分镜邻居场景（用于连贯性上下文注入） */
interface NeighborScene { scene_number: number; description?: string; emotional_tone?: string; location?: string; camera_angle?: string; image_url?: string; dialogue?: string; time_of_day?: string }
/** Supabase Storage Bucket */
interface StorageBucket { name: string }
/** AI 生成的剧集大纲 */
interface EpisodeOutline {
  episodeNumber: number; title: string; synopsis: string;
  growthTheme?: string; keyMoments?: string[];
  cliffhanger?: string; previousEpisodeLink?: string;
  // AI 可能返回 snake_case 字段
  episode_number?: number; growth_theme?: string; key_moments?: string[]; description?: string;
}
/** AI 生成的分镜大纲 */
interface StoryboardOutline {
  sceneNumber: number; description: string; dialogue?: string;
  characters?: string[]; location?: string; timeOfDay?: string;
  cameraAngle?: string; emotionalTone?: string; duration?: number;
  scene_number?: number; time_of_day?: string; camera_angle?: string; emotional_tone?: string;
}
/** 管理员清理操作记录 */
interface AdminCleanupAction { type: string; seriesId?: string; episodeNumber?: number; sceneNumber?: number; deleted?: number; details?: string }
/** concatMP4 返回类型 */
import type { ConcatResult } from "./mp4concat.ts";

// ==================== v6.0.176: 多管理员认证系统 ====================
// 支持环境变量 ADMIN_PHONES（逗号分隔）+ KV 动态管理员列表
const ADMIN_LIST_KV_KEY = 'admin_phones_list';
const ADMIN_CACHE_TTL = 60_000; // 60s 缓存
let _adminCache: { phones: Set<string>; ts: number } = { phones: new Set(), ts: 0 };

/** 判断手机号是否为管理员（环境变量主管理员 + KV 动态管理员列表） */
async function isAdminPhone(phone: string): Promise<boolean> {
  if (!phone) return false;
  // 1. 环境变量主管理员（逗号分隔，首位为超级管理员）
  const envAdmins = (Deno.env.get('ADMIN_PHONES') || '').split(',').map(p => p.trim()).filter(Boolean);
  if (envAdmins.includes(phone)) return true;
  // 2. KV 动态管理员列表（带 60s 内存缓存）
  const now = Date.now();
  if (now - _adminCache.ts > ADMIN_CACHE_TTL) {
    try {
      const { data } = await supabase.from('kv_store_fc31472c').select('value').eq('key', ADMIN_LIST_KV_KEY).maybeSingle();
      const phones: string[] = data?.value ? JSON.parse(data.value) : [];
      _adminCache = { phones: new Set(phones), ts: now };
    } catch (err) {
      console.warn('[Admin] Failed to refresh admin cache:', err);
      // 出错时继续使用过期缓存
    }
  }
  return _adminCache.phones.has(phone);
}

/** 判断是否为超级管理员（仅环境变量中第一个） */
function isSuperAdmin(phone: string): boolean {
  const envAdmins = (Deno.env.get('ADMIN_PHONES') || '').split(',').map(p => p.trim()).filter(Boolean);
  return envAdmins.length > 0 && envAdmins[0] === phone;
}

/** 强制刷新管理员缓存 */
function invalidateAdminCache() {
  _adminCache.ts = 0;
}

// ==================== Hono App ====================

const app = new Hono();

// 安全绑定 console.log，避免某些运行时 this 上下文丢失
const logFn = (...args: unknown[]) => console.log(...args);
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
//  app.tsx 路由按业务域分区索引, 辅助 8000+ 行文���快速导航
//  (line numbers are approximate — search section headers to navigate)
// ======================================================================
//  [A] 系统基础       L~116   健康检查 / 版本 / 部署验证
//  [B] 用户管理       L~209   登录 / 资料查询 / 昵称更新
//  [C] 配额 & 管理员   L~336   视频配额 / 付款记录 / 管理员CRUD / 收款码
//  [D] 共��工具函数    L~527   Volcengine URL刷新 / 任务同步helpers
//  [E] 视频代理       L~598   字节流转发(GET/POST) / DB fallback / 批量刷新URL
//  [F] 漫��� CRUD     L~1031  列表 / AI生成标题&大纲 / 详情 / 创建 / 更新 / 删除
//  [G] 社区 & 互动    L~1641  社区作品 / 用户作品 / 点赞 / 评论
//  [H] 内容管理       L~1932  角色 / AI角色生成 / 剧集 / 分镜CRUD / 排序 / 润色
//  [I] 视频任务       L~2413  任务查询 / 浏览历史 / 数据库健康检查
//  [J] 视频管道       L~2523  分镜视频生成 / 合并视频 / AI创意生成
//  [K] 火山引擎       L~3233  视频提交 / 状态查询 / Debug / 批量操作
//  [L] 社区互动补全    L~4385  社区评论 / 点赞 / 分享补全路由
//  [M] OSS & 同步     L~4612  视频转存OSS / 批量同步状态 / 综合恢复
//  [N] 生成管道       L~4965  缩略图同步 / 进度查询 / AI剧集生成 / 全量生成
//  [O] AI 路由       L~6655  剧集大纲 / 故事增强 / 图片生成 / prompt润色
//  [P] 社区系统       L~6850  社区作品列表 / 详情 / 浏览数
//  [Q] ���理维护       L~7317  补全路由 / 诊断修复 / 去重清理
//  [R] 文件 & 签名    L~7840  图片上传 / OSS URL签名 / 视频任务状态
//  [S] 兜底          L~8047  404处理
// ======================================================================

// v6.0.140: 移除启动时自动CORS配置——AK通常无PutBucketCors权限，每次冷启动打印错误日志
// presigned GET URL已作为主下载路径，不依赖桶CORS配置
// 如需手动配置CORS，请调用 GET /oss/cors-status?force=true

// ==================== [A] 健康检查 ====================

const healthHandler = (c: { json: (data: unknown) => Response }) => c.json({
  status: "ok",
  timestamp: new Date().toISOString(),
  version: APP_VERSION,
  apiKeyConfigured: !!VOLCENGINE_API_KEY,
  aiConfigured: !!ALIYUN_BAILIAN_API_KEY,
  volcengineEndpoint: VOLCENGINE_BASE_URL,
});
// 只使用带前缀的路由，避免 Edge Function 路由冲突
app.get(`${PREFIX}/health`, healthHandler);

const testHandler = (c: { json: (data: unknown) => Response }) => c.json({ status: "ok", message: "Server is running", version: APP_VERSION });
app.get(`${PREFIX}/test`, testHandler);

// 部署验证 - 全面检查所有子系统
app.get(`${PREFIX}/deploy-verify`, async (c) => {
  const checks: Record<string, unknown> = {};
  const startTime = Date.now();

  // 1. 模块加载验证
  checks.modules = {
    hono: typeof Hono === 'function',
    cors: typeof cors === 'function',
    logger: typeof logger === 'function',
    supabaseClient: typeof createClient === 'function',
  };

  // 2. 环境��量检查（直接读取，仅用于诊断展示���
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
    VOLCENGINE_BASE_URL_OVERRIDE: !!Deno.env.get('VOLCENGINE_BASE_URL'),
    VOLCENGINE_CHAT_URL_OVERRIDE: !!Deno.env.get('VOLCENGINE_CHAT_URL'),
  };
  checks.endpoints = {
    volcengine: VOLCENGINE_BASE_URL,
    doubaoChat: DOUBAO_CHAT_URL,
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
  } catch (dbErr: unknown) {
    checks.database = { connected: false, error: getErrorMessage(dbErr) };
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

// ==================== [B] 用户管理 ====================

// 共享登录逻辑：查找或创建用户，返回 camelCase 用户对象
async function handleUserLogin(phone: string): Promise<{ user: Record<string, unknown> | null; error?: string }> {
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
  } catch (error: unknown) {
    console.error('[Users] Login error:', truncateErrorMsg(error));
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

// 获取用户资料 - /user/profile/:phone (reuses handleUserLogin find-or-create)
app.get(`${PREFIX}/user/profile/:phone`, async (c) => {
  try {
    const phone = c.req.param('phone');
    const result = await handleUserLogin(phone);
    if (result.error) return c.json({ error: result.error }, 500);
    return c.json({ success: true, user: result.user });
  } catch (error: unknown) {
    console.error('[Users] Profile error:', truncateErrorMsg(error));
    return c.json({ error: getErrorMessage(error) }, 500);
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
      const updates: Record<string, string> = {};
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
  } catch (error: unknown) {
    console.error('[Users] Profile update error:', truncateErrorMsg(error));
    return c.json({ error: getErrorMessage(error) }, 500);
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
  } catch (error: unknown) {
    console.error('[Users] Nickname update error:', truncateErrorMsg(error));
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

// ==================== [C] 视频配额 & 管理员 ====================

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
  const usedToday = parseInt((cD as KvRow)?.value || '0') || 0;
  const freeLimit = parseInt((lD as KvRow)?.value || '5') || 5;
  const paidCredits = parseInt((pD as KvRow)?.value || '0') || 0;
  const freeRemaining = Math.max(0, freeLimit - usedToday);
  return { usedToday, freeLimit, paidCredits, freeRemaining, totalRemaining: freeRemaining + paidCredits };
}

app.get(`${PREFIX}/user/video-quota/:phone`, async (c) => {
  try {
    const phone = c.req.param('phone');
    const phoneIsAdmin = await isAdminPhone(phone);
    if (phoneIsAdmin) return c.json({ success: true, data: { usedToday: 0, freeLimit: 999, paidCredits: 0, freeRemaining: 999, totalRemaining: 999, isAdmin: true } });
    const quota = await getUserQuota(phone);
    return c.json({ success: true, data: { ...quota, isAdmin: false } });
  } catch (err: unknown) { return c.json({ error: getErrorMessage(err) }, 500); }
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
    const idList: string[] = listData ? JSON.parse((listData as KvRow)?.value || '[]') : [];
    idList.unshift(id);
    await supabase.from('kv_store_fc31472c').upsert({ key: 'payment_records_index', value: JSON.stringify(idList.slice(0, 500)) }, { onConflict: 'key' });
    console.log(`[Payment] New record: id=${id} phone=${phone} amount=${amount} credits=${credits}`);
    return c.json({ success: true, id });
  } catch (err: unknown) { console.error('[Payment] Record error:', getErrorMessage(err)); return c.json({ error: getErrorMessage(err) }, 500); }
});

app.get(`${PREFIX}/admin/users`, async (c) => {
  try {
    const adminPhone = c.req.query('adminPhone');
    if (!adminPhone || !(await isAdminPhone(adminPhone))) return c.json({ error: '无权限' }, 403);
    const { data: usersData, error } = await supabase.from('users').select('id, phone, nickname, created_at, updated_at').order('created_at', { ascending: false }).limit(200);
    if (error) return c.json({ error: error.message }, 500);
    const today = new Date().toISOString().split('T')[0];
    const phones = (usersData || []).map((u: UserRow) => u.phone);
    const kvKeys = phones.flatMap((p: string) => [dailyCountKey(p, today), dailyLimitKey(p), paidCreditsKey(p)]);
    let kvMap: Record<string, string> = {};
    if (kvKeys.length > 0) {
      for (let i = 0; i < kvKeys.length; i += 50) {
        const { data: kvData } = await supabase.from('kv_store_fc31472c').select('key, value').in('key', kvKeys.slice(i, i + 50));
        (kvData || []).forEach((row: KvKeyValueRow) => { kvMap[row.key] = row.value; });
      }
    }
    // v6.0.176: 批量预取管理员集合，避免 .map() 中逐个 await
    const adminPhoneSet = new Set<string>();
    const _envAdmins = (Deno.env.get('ADMIN_PHONES') || '').split(',').map(p => p.trim()).filter(Boolean);
    _envAdmins.forEach(p => adminPhoneSet.add(p));
    _adminCache.phones.forEach(p => adminPhoneSet.add(p));
    const users = (usersData || []).map((u: UserRow) => {
      const isAdminUser = adminPhoneSet.has(u.phone);
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
  } catch (err: unknown) { console.error('[Admin] Users list error:', getErrorMessage(err)); return c.json({ error: getErrorMessage(err) }, 500); }
});

app.post(`${PREFIX}/admin/users/settings`, async (c) => {
  try {
    const { adminPhone, targetPhone, freeLimit, addCredits } = await c.req.json();
    if (!adminPhone || !(await isAdminPhone(adminPhone))) return c.json({ error: '无权限' }, 403);
    if (!targetPhone) return c.json({ error: '缺少目标用户手机号' }, 400);
    const ops: Promise<unknown>[] = [];
    if (freeLimit !== undefined) ops.push(supabase.from('kv_store_fc31472c').upsert({ key: dailyLimitKey(targetPhone), value: String(Math.max(0, parseInt(freeLimit) || 5)) }, { onConflict: 'key' }));
    if (addCredits && parseInt(addCredits) > 0) {
      const { data: cd } = await supabase.from('kv_store_fc31472c').select('value').eq('key', paidCreditsKey(targetPhone)).maybeSingle();
      const cur = parseInt((cd as KvRow)?.value || '0') || 0;
      ops.push(supabase.from('kv_store_fc31472c').upsert({ key: paidCreditsKey(targetPhone), value: String(cur + parseInt(addCredits)) }, { onConflict: 'key' }));
    }
    await Promise.all(ops);
    console.log(`[Admin] Updated quota for ${targetPhone}: freeLimit=${freeLimit}, addCredits=${addCredits}`);
    return c.json({ success: true });
  } catch (err: unknown) { console.error('[Admin] Settings error:', getErrorMessage(err)); return c.json({ error: getErrorMessage(err) }, 500); }
});

// v6.0.102: 轻量端点——仅返回待审核付款数量，供前端轮询通知用（不加载完整列表）
app.get(`${PREFIX}/admin/pending-count`, async (c) => {
  try {
    const adminPhone = c.req.query('adminPhone');
    if (!adminPhone || !(await isAdminPhone(adminPhone))) return c.json({ error: '无权限' }, 403);
    const { data: indexData } = await supabase.from('kv_store_fc31472c').select('value').eq('key', 'payment_records_index').maybeSingle();
    const idList: string[] = indexData ? JSON.parse((indexData as KvRow)?.value || '[]') : [];
    if (idList.length === 0) return c.json({ success: true, data: { pendingCount: 0 } });
    const keys = idList.slice(0, 50).map((id: string) => paymentRecordKey(id));
    const { data: kvData } = await supabase.from('kv_store_fc31472c').select('value').in('key', keys);
    const pendingCount = (kvData || []).filter((row: KvKeyValueRow) => {
      try { return JSON.parse(row.value)?.status === 'pending'; } catch { return false; }
    }).length;
    return c.json({ success: true, data: { pendingCount } });
  } catch (err: unknown) { console.error('[Admin] Pending count error:', getErrorMessage(err)); return c.json({ error: getErrorMessage(err) }, 500); }
});

app.get(`${PREFIX}/admin/payments`, async (c) => {
  try {
    const adminPhone = c.req.query('adminPhone');
    if (!adminPhone || !(await isAdminPhone(adminPhone))) return c.json({ error: '无权限' }, 403);
    const { data: indexData } = await supabase.from('kv_store_fc31472c').select('value').eq('key', 'payment_records_index').maybeSingle();
    const idList: string[] = indexData ? JSON.parse((indexData as KvRow)?.value || '[]') : [];
    if (idList.length === 0) return c.json({ success: true, data: { payments: [] } });
    const keys = idList.slice(0, 100).map((id: string) => paymentRecordKey(id));
    const { data: kvData } = await supabase.from('kv_store_fc31472c').select('key, value').in('key', keys);
    const payments = (kvData || []).map((row: KvKeyValueRow) => { try { return JSON.parse(row.value); } catch { return null; } }).filter(Boolean).sort((a: Record<string, string>, b: Record<string, string>) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return c.json({ success: true, data: { payments } });
  } catch (err: unknown) { console.error('[Admin] Payments list error:', getErrorMessage(err)); return c.json({ error: getErrorMessage(err) }, 500); }
});

app.post(`${PREFIX}/admin/payments/approve`, async (c) => {
  try {
    const { adminPhone, paymentId, targetPhone, credits } = await c.req.json();
    if (!adminPhone || !(await isAdminPhone(adminPhone))) return c.json({ error: '无权限' }, 403);
    // v6.0.175: parallelize independent reads, then parallelize writes
    const [{ data: rD }, { data: cd }] = await Promise.all([
      supabase.from('kv_store_fc31472c').select('value').eq('key', paymentRecordKey(paymentId)).maybeSingle(),
      supabase.from('kv_store_fc31472c').select('value').eq('key', paidCreditsKey(targetPhone)).maybeSingle(),
    ]);
    const writeOps: Promise<unknown>[] = [];
    if (rD?.value) {
      const rec = JSON.parse((rD as KvRow)!.value);
      rec.status = 'approved'; rec.approvedAt = new Date().toISOString();
      writeOps.push(supabase.from('kv_store_fc31472c').upsert({ key: paymentRecordKey(paymentId), value: JSON.stringify(rec) }, { onConflict: 'key' }));
    }
    const cur = parseInt((cd as KvRow)?.value || '0') || 0;
    writeOps.push(supabase.from('kv_store_fc31472c').upsert({ key: paidCreditsKey(targetPhone), value: String(cur + parseInt(credits)) }, { onConflict: 'key' }));
    await Promise.all(writeOps);
    console.log(`[Admin] Approved payment ${paymentId}: +${credits} credits to ${targetPhone}`);
    return c.json({ success: true });
  } catch (err: unknown) { console.error('[Admin] Approve error:', getErrorMessage(err)); return c.json({ error: getErrorMessage(err) }, 500); }
});

app.post(`${PREFIX}/admin/payments/reject`, async (c) => {
  try {
    const { adminPhone, paymentId } = await c.req.json();
    if (!adminPhone || !(await isAdminPhone(adminPhone))) return c.json({ error: '无权限' }, 403);
    const { data: rD } = await supabase.from('kv_store_fc31472c').select('value').eq('key', paymentRecordKey(paymentId)).maybeSingle();
    if (rD?.value) {
      const rec = JSON.parse((rD as KvRow)!.value);
      rec.status = 'rejected'; rec.rejectedAt = new Date().toISOString();
      await supabase.from('kv_store_fc31472c').upsert({ key: paymentRecordKey(paymentId), value: JSON.stringify(rec) }, { onConflict: 'key' });
    }
    return c.json({ success: true });
  } catch (err: unknown) { console.error('[Admin] Reject error:', getErrorMessage(err)); return c.json({ error: getErrorMessage(err) }, 500); }
});

app.get(`${PREFIX}/admin/wechat-qr`, async (c) => {
  try {
    const { data } = await supabase.from('kv_store_fc31472c').select('value').eq('key', 'wechat_qr_url').maybeSingle();
    return c.json({ success: true, data: { url: (data as KvRow)?.value || '' } });
  } catch { return c.json({ success: true, data: { url: '' } }); }
});

app.post(`${PREFIX}/admin/wechat-qr`, async (c) => {
  try {
    const { adminPhone, url } = await c.req.json();
    if (!adminPhone || !(await isAdminPhone(adminPhone))) return c.json({ error: '无权限' }, 403);
    if (!url || !url.startsWith('http')) return c.json({ error: 'URL格式不正确' }, 400);
    await supabase.from('kv_store_fc31472c').upsert({ key: 'wechat_qr_url', value: url }, { onConflict: 'key' });
    return c.json({ success: true });
  } catch (err: unknown) { return c.json({ error: getErrorMessage(err) }, 500); }
});

// ── v6.0.176: 管理员身份检查（供前端判断 isAdmin，不暴露管理员列表） ──
app.get(`${PREFIX}/admin/check/:phone`, async (c) => {
  try {
    const phone = c.req.param('phone');
    if (!phone) return c.json({ success: true, data: { isAdmin: false } });
    const admin = await isAdminPhone(phone);
    return c.json({ success: true, data: { isAdmin: admin, isSuperAdmin: admin && isSuperAdmin(phone) } });
  } catch (err: unknown) { return c.json({ error: getErrorMessage(err) }, 500); }
});

// ── v6.0.176: 管理员列表管理（仅超级管理员可操作） ──
app.get(`${PREFIX}/admin/admins`, async (c) => {
  try {
    const adminPhone = c.req.query('adminPhone');
    if (!adminPhone || !isSuperAdmin(adminPhone)) return c.json({ error: '仅超级管理员可查看管理员列表' }, 403);
    // 合并环境变量 + KV 动态列表
    const envAdmins = (Deno.env.get('ADMIN_PHONES') || '').split(',').map(p => p.trim()).filter(Boolean);
    const { data } = await supabase.from('kv_store_fc31472c').select('value').eq('key', ADMIN_LIST_KV_KEY).maybeSingle();
    const kvAdmins: string[] = data?.value ? JSON.parse(data.value) : [];
    const allAdmins = [...new Set([...envAdmins, ...kvAdmins])];
    return c.json({ success: true, data: { admins: allAdmins.map(p => ({ phone: p, source: envAdmins.includes(p) ? 'env' : 'dynamic', isSuperAdmin: envAdmins[0] === p })) } });
  } catch (err: unknown) { console.error('[Admin] List admins error:', getErrorMessage(err)); return c.json({ error: getErrorMessage(err) }, 500); }
});

app.post(`${PREFIX}/admin/admins/add`, async (c) => {
  try {
    const { adminPhone, targetPhone } = await c.req.json();
    if (!adminPhone || !isSuperAdmin(adminPhone)) return c.json({ error: '仅超级管理员可添加管理员' }, 403);
    if (!targetPhone || !/^1[3-9]\d{9}$/.test(targetPhone)) return c.json({ error: '目标手机号格式不正确' }, 400);
    // 检查是否已是管理员
    if (await isAdminPhone(targetPhone)) return c.json({ error: '该用户已是管理员' }, 400);
    // 添加到 KV 动态列表
    const { data } = await supabase.from('kv_store_fc31472c').select('value').eq('key', ADMIN_LIST_KV_KEY).maybeSingle();
    const kvAdmins: string[] = data?.value ? JSON.parse(data.value) : [];
    kvAdmins.push(targetPhone);
    await supabase.from('kv_store_fc31472c').upsert({ key: ADMIN_LIST_KV_KEY, value: JSON.stringify(kvAdmins) }, { onConflict: 'key' });
    invalidateAdminCache();
    console.log(`[Admin] Super admin ${adminPhone} added admin: ${targetPhone}`);
    return c.json({ success: true });
  } catch (err: unknown) { console.error('[Admin] Add admin error:', getErrorMessage(err)); return c.json({ error: getErrorMessage(err) }, 500); }
});

app.post(`${PREFIX}/admin/admins/remove`, async (c) => {
  try {
    const { adminPhone, targetPhone } = await c.req.json();
    if (!adminPhone || !isSuperAdmin(adminPhone)) return c.json({ error: '仅超级管理员可移除管理员' }, 403);
    if (!targetPhone) return c.json({ error: '缺少目标手机号' }, 400);
    // 不能移除环境���量中的管理员
    const envAdmins = (Deno.env.get('ADMIN_PHONES') || '').split(',').map(p => p.trim()).filter(Boolean);
    if (envAdmins.includes(targetPhone)) return c.json({ error: '环境变量配置的管理员不能通过此接口移除' }, 400);
    // 从 KV 列表移除
    const { data } = await supabase.from('kv_store_fc31472c').select('value').eq('key', ADMIN_LIST_KV_KEY).maybeSingle();
    const kvAdmins: string[] = data?.value ? JSON.parse(data.value) : [];
    const filtered = kvAdmins.filter(p => p !== targetPhone);
    await supabase.from('kv_store_fc31472c').upsert({ key: ADMIN_LIST_KV_KEY, value: JSON.stringify(filtered) }, { onConflict: 'key' });
    invalidateAdminCache();
    console.log(`[Admin] Super admin ${adminPhone} removed admin: ${targetPhone}`);
    return c.json({ success: true });
  } catch (err: unknown) { console.error('[Admin] Remove admin error:', getErrorMessage(err)); return c.json({ error: getErrorMessage(err) }, 500); }
});

// v6.0.160: Helper — 创建Volcengine URL刷新函数，用于transferFileToOSS的403���试
// 查询Volcengine API获取最新video_url（TOS签名URL会定期刷新）
function makeVolcRefreshFn(volcengineTaskId: string | null | undefined): (() => Promise<string | null>) | undefined {
  if (!volcengineTaskId || !VOLCENGINE_API_KEY) return undefined;
  return async () => {
    try {
      const resp = await fetchWithTimeout(`${VOLCENGINE_BASE_URL}/${volcengineTaskId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${VOLCENGINE_API_KEY}`, 'Content-Type': 'application/json' },
      }, 15000);
      if (!resp.ok) return null;
      const data = await resp.json();
      const status = data.status || data.data?.status || '';
      if (['succeeded', 'completed', 'success'].includes(status)) {
        const freshUrl = data.content?.video_url || data.data?.content?.video_url || '';
        if (freshUrl && freshUrl.startsWith('http')) {
          console.log(`[OSS] 🔄 Volcengine returned fresh URL for ${volcengineTaskId}`);
          return freshUrl;
        }
      }
      return null;
    } catch (e: unknown) {
      console.warn(`[OSS] Volcengine URL refresh query failed: ${getErrorMessage(e)}`);
      return null;
    }
  };
}

// ── Shared Volcengine task-sync helpers (used by sync-pending-tasks, recover-all-tasks) ──

/** Shared field selection for task queries — avoids duplicating long column lists */
const TASK_SYNC_FIELDS = 'task_id, volcengine_task_id, status, video_url, thumbnail, generation_metadata, series_id, created_at';

/** Query Volcengine API for task status; returns normalized result */
async function queryVolcengineStatus(volcId: string, timeout = 10000): Promise<{
  volcStatus: 'completed' | 'failed' | 'running';
  videoUrl: string;
  thumbnailUrl: string;
}> {
  const resp = await fetchWithTimeout(`${VOLCENGINE_BASE_URL}/${volcId}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${VOLCENGINE_API_KEY}`, 'Content-Type': 'application/json' },
  }, timeout);
  if (!resp.ok) {
    return { volcStatus: resp.status === 404 ? 'failed' : 'running', videoUrl: '', thumbnailUrl: '' };
  }
  const apiData = await resp.json();
  const rawStatus = apiData.status || 'unknown';
  if (['succeeded', 'completed', 'success'].includes(rawStatus)) {
    return {
      volcStatus: 'completed',
      videoUrl: apiData.content?.video_url || apiData.video_url || '',
      thumbnailUrl: apiData.content?.cover_url || apiData.thumbnail || '',
    };
  }
  if (['failed', 'error'].includes(rawStatus)) {
    return { volcStatus: 'failed', videoUrl: '', thumbnailUrl: '' };
  }
  return { volcStatus: 'running', videoUrl: '', thumbnailUrl: '' };
}

/** Mark task as failed in DB */
async function markTaskFailed(taskId: string) {
  await supabase.from('video_tasks').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('task_id', taskId);
}

/** Write back completed status to video_tasks + series_storyboards (if applicable) */
async function writeBackTaskCompletion(task: VideoTaskRow, videoUrl: string, thumbnailUrl?: string) {
  const upd: Record<string, string> = { status: 'completed', updated_at: new Date().toISOString() };
  if (videoUrl) upd.video_url = videoUrl;
  if (thumbnailUrl) upd.thumbnail = thumbnailUrl;
  await supabase.from('video_tasks').update(upd).eq('task_id', task.task_id);

  // Propagate to series_storyboards if this is a storyboard video task
  if (videoUrl && task.generation_metadata?.type === 'storyboard_video') {
    const meta = task.generation_metadata;
    const sn = meta.storyboardNumber || meta.sceneNumber;
    if (meta.seriesId && meta.episodeNumber && sn) {
      // v6.0.199: 防止旧任务覆盖新任务——只有最新任务才写回storyboard
      // 根因: 用户重新生成视频后，旧任务延迟��成会用旧视频覆盖新视频URL
      let isLatestForScene = true;
      try {
        const { data: recentTasks } = await supabase.from('video_tasks')
          .select('task_id, generation_metadata')
          .filter('generation_metadata->>seriesId', 'eq', meta.seriesId)
          .filter('generation_metadata->>episodeNumber', 'eq', String(meta.episodeNumber))
          .filter('generation_metadata->>type', 'eq', 'storyboard_video')
          .order('created_at', { ascending: false })
          .limit(10);
        if (recentTasks) {
          for (const t of recentTasks) {
            const tMeta = parseMeta(t.generation_metadata);
            const tSn = tMeta?.storyboardNumber || tMeta?.sceneNumber;
            if (tSn == sn) {
              // 按created_at desc排序，第一个匹配同场景的就是最新任务
              isLatestForScene = t.task_id === task.task_id;
              break;
            }
          }
        }
      } catch { /* non-blocking: default to isLatest=true */ }

      if (!isLatestForScene) {
        console.warn(`[WriteBack] ⚠️ Skipping storyboard update for scene ${sn}: newer task exists (current: ${task.task_id})`);
      } else {
        await supabase.from('series_storyboards').update({
          video_url: videoUrl, status: 'completed', updated_at: new Date().toISOString(),
        }).eq('series_id', meta.seriesId).eq('episode_number', meta.episodeNumber).eq('scene_number', sn);
        console.log(`[WriteBack] ✅ Scene ${sn} video_url updated from task ${task.task_id}`);
      }
    }
  }
}

/** Safely parse generation_metadata (may be string or object); returns null on failure */
function parseMeta(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

/** v6.0.197: Validate image dimensions via partial fetch (PNG/JPEG/WebP header).
 *  Volcengine requires min 300px on both width and height.
 *  Returns true if valid, false if too small. On error, returns true (let API decide). */
async function validateImageDimensions(url: string, minSize = 300): Promise<boolean> {
  try {
    const resp = await fetch(url, { headers: { Range: 'bytes=0-4095' }, signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return false;
    const buf = new Uint8Array(await resp.arrayBuffer());
    // PNG: width@16-19, height@20-23
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
      const w = (buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19];
      const h = (buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23];
      console.log(`[ImageValidation] PNG ${w}x${h} from ${url.substring(0, 60)}`);
      return w >= minSize && h >= minSize;
    }
    // JPEG: scan for SOF0/SOF2 marker
    if (buf[0] === 0xFF && buf[1] === 0xD8) {
      for (let i = 2; i < buf.length - 9; i++) {
        if (buf[i] === 0xFF && (buf[i + 1] === 0xC0 || buf[i + 1] === 0xC2)) {
          const h = (buf[i + 5] << 8) | buf[i + 6];
          const w = (buf[i + 7] << 8) | buf[i + 8];
          console.log(`[ImageValidation] JPEG ${w}x${h} from ${url.substring(0, 60)}`);
          return w >= minSize && h >= minSize;
        }
      }
    }
    // WebP VP8 lossy
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
        buf[12] === 0x56 && buf[13] === 0x50 && buf[14] === 0x38 && buf[15] === 0x20) {
      const w = ((buf[26] | (buf[27] << 8)) & 0x3FFF);
      const h = ((buf[28] | (buf[29] << 8)) & 0x3FFF);
      console.log(`[ImageValidation] WebP ${w}x${h} from ${url.substring(0, 60)}`);
      return w >= minSize && h >= minSize;
    }
    console.log(`[ImageValidation] Unknown format, allowing: ${url.substring(0, 60)}`);
    return true;
  } catch (e: unknown) {
    console.warn(`[ImageValidation] Check failed (allowing): ${getErrorMessage(e)}`);
    return true;
  }
}

// ==================== [E] 视���代理（轻量字节流转发，供客户端本地合并使用）====================
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
    // v6.0.135 Bug E fix: accept any non-TOS URL from DB as fallback (not just .aliyuncs.com)
    // Rationale: DB may have non-OSS CDN URLs or other stable URLs we can use
    // Still exclude TOS (volces.com/tos-cn) — those also expire like the original
    // v6.0.132: 允许DB URL与输入相同时也重试——超时可能是瞬态网络问题（不同于403签名过期）
    // 但仅对timeout场景重试同URL，403场景同URL确定无效
    // v6.0.136 Bug 2 fix: NEVER retry same URL on timeout — prevents double 60s cascade
    // Root cause: OSS times out (60s), tryDbFallback finds same OSS URL in DB,
    //   retries with another 60s timeout → total 120s server time > 75s client window → client AbortError
    // Fix: isSameUrl always takes false path → server returns 504 quickly after the first 60s OSS timeout
    //      Client receives 504 properly (within 75s), retries or falls through to direct download
    // v6.0.135 Bug E: accept any non-TOS URL from DB as fallback (not just .aliyuncs.com)
    const isSameUrl = ossUrl === videoUrl;
    const isTosCandidate = ossUrl ? (ossUrl.includes('volces.com') || ossUrl.includes('tos-cn')) : false;
    // Accept: non-TOS URL that is DIFFERENT from the failed URL
    const shouldTry = ossUrl && ossUrl.startsWith('http') && !isTosCandidate && !isSameUrl;
    if (shouldTry) {
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
  } catch (dbErr: unknown) {
    console.warn(`[VideoProxy] DB fallback error: ${getErrorMessage(dbErr)}`);
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
    // v6.0.194: OSS URLs need 120s (Chinese OSS from overseas Edge Function is very slow for large videos)
    // TOS URLs keep 60s since they're CDN-served and faster
    const isOssUpstream = videoUrl.includes('.aliyuncs.com');
    const upstreamTimeout = isOssUpstream ? 120_000 : 60_000;
    const upstream = await fetch(videoUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VideoProxy/1.0)' },
      signal: AbortSignal.timeout(upstreamTimeout),
    });
    if (!upstream.ok) {
      // v6.0.129+130: DB fallback — TOS URL返回403/401时，查DB获取OSS URL
      if ((upstream.status === 403 || upstream.status === 401) && canFallback) {
        const fallback = await tryDbFallback(videoUrl, context as VideoProxyCtx, `TOS ${upstream.status}`);
        if (fallback) return fallback;
      }
      return new Response(JSON.stringify({ error: `上游����回���误: ${upstream.status} ${upstream.statusText}`, detail: `upstream ${upstream.status}` }), {
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
  } catch (err: unknown) {
    const isTimeout = getErrorName(err) === 'TimeoutError' || getErrorName(err) === 'AbortError';
    const statusCode = isTimeout ? 504 : 502;
    const detail = isTimeout ? `Proxy upstream timeout (${upstreamTimeout / 1000}s)` : getErrorMessage(err);
    console.error(`[VideoProxy] ${isTimeout ? 'Timeout' : 'Fetch error'}:`, getErrorMessage(err), `| timeout=${upstreamTimeout / 1000}s | url:`, videoUrl.substring(0, 80));

    // v6.0.130: timeout/网络错误也尝试DB fallback——TOS URL超时通常意���着签名已过期
    // 之前只在 upstream 403 时才尝试，timeout 被完全跳过导���无法自愈
    if (canFallback) {
      const fallback = await tryDbFallback(videoUrl, context as VideoProxyCtx, `${isTimeout ? 'Timeout' : 'FetchError'}`);
      if (fallback) return fallback;
    }

    // v6.0.137: include ossUrl flag so client can skip futile proxy retries for OSS timeouts
    const isOssUrl = videoUrl.includes('.aliyuncs.com');
    return new Response(JSON.stringify({ error: '代理请求失败', detail, timeout: isTimeout, ossUrl: isOssUrl }), {
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
  } catch (err: unknown) {
    return c.json({ error: '请求体解析失败', detail: getErrorMessage(err) }, 400);
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
    const volcItems = items.filter((it: BulkRefreshItem) =>
      it.currentUrl && (it.currentUrl.includes('volces.com') || it.currentUrl.includes('tos-cn'))
    );
    const ossItems = items.filter((it: BulkRefreshItem) =>
      it.currentUrl && !it.currentUrl.includes('volces.com') && !it.currentUrl.includes('tos-cn')
    );

    // v6.0.194: HEAD timeout 15s→25s (Aliyun OSS from overseas Edge Function can take 20s+)
    // v6.0.132: OSS URL also HEAD-validated (was blind passthrough, but OSS URLs can timeout/be unreachable)
    // Concurrent HEAD checks; on failure, check DB (storyboards + video_tasks) for alternative URL
    for (let i = 0; i < ossItems.length; i += 4) {
      const batch = ossItems.slice(i, i + 4);
      const batchResults = await Promise.all(batch.map(async (it: BulkRefreshItem) => {
        try {
          const headResp = await fetchWithTimeout(it.currentUrl, { method: 'HEAD' }, 25000);
          if (headResp.ok || headResp.status === 304) {
            return { sceneNumber: it.sceneNumber, originalUrl: it.currentUrl, freshUrl: it.currentUrl, source: 'oss-validated' };
          }
          // OSS returned error (403/404/etc) — try DB for alternative URL
          console.warn(`[BulkRefresh] OSS HEAD ${headResp.status} for scene ${it.sceneNumber}, checking DB...`);
        } catch (headErr: unknown) {
          // Timeout or network error — try DB for alternative URL
          console.warn(`[BulkRefresh] OSS HEAD failed for scene ${it.sceneNumber}: ${getErrorMessage(headErr)}, checking DB...`);
        }
        // DB fallback: check storyboards AND video_tasks for alternative URL
        if (seriesId && episodeNumber) {
          const { data: sbRow } = await supabase.from('series_storyboards')
            .select('video_url').eq('series_id', seriesId).eq('episode_number', episodeNumber).eq('scene_number', it.sceneNumber).single();
          if (sbRow?.video_url && sbRow.video_url !== it.currentUrl && sbRow.video_url.startsWith('http')) {
            console.log(`[BulkRefresh] Scene ${it.sceneNumber}: DB storyboards has different URL, using it`);
            return { sceneNumber: it.sceneNumber, originalUrl: it.currentUrl, freshUrl: sbRow.video_url, source: 'oss-db-fallback' };
          }
          // v6.0.135 Bug D fix: also check video_tasks (might have OSS URL when storyboards doesn't)
          const { data: taskRows } = await supabase.from('video_tasks')
            .select('video_url, generation_metadata')
            .eq('status', 'completed')
            .filter('generation_metadata->>seriesId', 'eq', seriesId)
            .like('video_url', '%aliyuncs.com%');
          if (taskRows) {
            for (const t of taskRows) {
              const m = t.generation_metadata;
              if (m?.episodeNumber === episodeNumber &&
                  (m?.storyboardNumber === it.sceneNumber || m?.sceneNumber === it.sceneNumber) &&
                  t.video_url && t.video_url !== it.currentUrl) {
                console.log(`[BulkRefresh] Scene ${it.sceneNumber}: video_tasks has OSS URL, using it`);
                return { sceneNumber: it.sceneNumber, originalUrl: it.currentUrl, freshUrl: t.video_url, source: 'oss-task-fallback' };
              }
            }
          }
        }
        // No alternative — mark as unreachable so client gives 1 proxy attempt (not skip entirely)
        return { sceneNumber: it.sceneNumber, originalUrl: it.currentUrl, freshUrl: it.currentUrl, source: 'oss-unreachable' };
      }));
      results.push(...batchResults);
    }

    if (volcItems.length === 0) {
      // v6.0.138: also generate presigned GET URLs for OSS-only path
      if (isOSSConfigured()) {
        await Promise.all(results.map(async (r: BulkRefreshResult) => {
          if (r.freshUrl && r.freshUrl.includes('.aliyuncs.com')) {
            try {
              const urlObj = new URL(r.freshUrl);
              const objectKey = urlObj.pathname.startsWith('/') ? urlObj.pathname.slice(1) : urlObj.pathname;
              if (objectKey) {
                r.presignedGetUrl = await generatePresignedGetUrl(objectKey, 7200);
              }
            } catch (e: unknown) {
              console.warn(`[BulkRefresh] presignedGetUrl failed for scene ${r.sceneNumber}: ${getErrorMessage(e)}`);
            }
          }
        }));
      }
      return c.json({ success: true, data: { results } });
    }

    console.log(`[BulkRefresh] Processing ${volcItems.length} Volcengine TOS URLs for S${seriesId}/E${episodeNumber}`);

    // v6.0.128 步骤1: 查DB中series_storyboards的最新video_url
    // 客户端内存可能缓存旧的TOS URL，但DB可能已被后台OSS转存更新为aliyuncs.com
    const sceneNumbers = volcItems.map((it: BulkRefreshItem) => it.sceneNumber);
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
    const sceneTaskMap = new Map<number, VideoTaskRow>();
    if (taskRows) {
      for (const t of taskRows) {
        const meta = t.generation_metadata;
        if (meta?.episodeNumber === episodeNumber) {
          const scn = meta.storyboardNumber || meta.sceneNumber;
          if (scn) sceneTaskMap.set(scn, t);
        }
      }
    }

    // 步骤3: 逐场景解析最佳��用URL（并发限制=4）
    const CONCURRENCY = 4;
    for (let i = 0; i < volcItems.length; i += CONCURRENCY) {
      const batch = volcItems.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map(async (it: BulkRefreshItem) => {
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

        // ── 优先级3: DB中有非TOS URL（其他CDN等），直接返回 ──
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
            // v6.0.194: 15s→25s — consistent with OSS HEAD timeout; overseas Edge Function needs 15-25s
            const headResp = await fetchWithTimeout(volcUrl, { method: 'HEAD' }, 25000);
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
                  const tr = await transferFileToOSS(volcUrl, `videos/${task.task_id}.mp4`, 'video/mp4', makeVolcRefreshFn(task.volcengine_task_id));
                  if (tr.transferred) {
                    await supabase.from('video_tasks').update({ video_url: tr.url }).eq('task_id', task.task_id);
                    await supabase.from('series_storyboards').update({ video_url: tr.url })
                      .eq('series_id', seriesId).eq('episode_number', episodeNumber).eq('scene_number', scn);
                    console.log(`[BulkRefresh] ✅ Background OSS transfer done for scene ${scn}`);
                  }
                } catch (e: unknown) { console.warn(`[BulkRefresh] Background OSS transfer failed for scene ${scn}: ${getErrorMessage(e)}`); }
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
        } catch (err: unknown) {
          console.warn(`[BulkRefresh] Scene ${scn} refresh failed: ${getErrorMessage(err)}`);
          return { sceneNumber: scn, originalUrl: it.currentUrl, freshUrl: it.currentUrl, source: 'error' };
        }
      }));
      results.push(...batchResults);
    }

    // v6.0.138: 为所有OSS URL结果生成预签名GET URL（浏览器直��下载兜底，绕过CORS限制）
    // 当桶CORS配置缺失/失败时，presigned URL仍然可以正常跨域下载（OSS签名URL自带鉴权，不受CORS限制）
    if (isOSSConfigured()) {
      const ossEndpointPrefix = `${Deno.env.get('ALIYUN_OSS_BUCKET_NAME')}.`;
      await Promise.all(results.map(async (r: BulkRefreshResult) => {
        if (r.freshUrl && r.freshUrl.includes('.aliyuncs.com')) {
          try {
            // 从完整URL提取objectKey: https://bucket.region.aliyuncs.com/videos/xxx.mp4 → videos/xxx.mp4
            const urlObj = new URL(r.freshUrl);
            const objectKey = urlObj.pathname.startsWith('/') ? urlObj.pathname.slice(1) : urlObj.pathname;
            if (objectKey) {
              r.presignedGetUrl = await generatePresignedGetUrl(objectKey, 7200);
            }
          } catch (e: unknown) {
            console.warn(`[BulkRefresh] presignedGetUrl generation failed for scene ${r.sceneNumber}: ${getErrorMessage(e)}`);
          }
        }
      }));
    }

    const resolved = results.filter(r => r.freshUrl !== r.originalUrl).length;
    const sources = results.reduce((acc: Record<string, number>, r) => { acc[r.source] = (acc[r.source] || 0) + 1; return acc; }, {} as Record<string, number>);
    console.log(`[BulkRefresh] Done: ${resolved}/${volcItems.length} URLs resolved. Sources:`, JSON.stringify(sources));
    return c.json({ success: true, data: { results } });
  } catch (error: unknown) {
    console.error('[BulkRefresh] Error:', getErrorMessage(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

// ==================== [F] 作品列表 ====================

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
        const seriesIds = seriesList.map((s: SeriesRow) => s.id);
        const { data: epRows, error: epCountErr } = await supabase
          .from('series_episodes')
          .select('series_id')
          .in('series_id', seriesIds);
        if (!epCountErr && epRows) {
          for (const row of epRows) {
            episodeCountMap.set(row.series_id, (episodeCountMap.get(row.series_id) || 0) + 1);
          }
        }
      } catch (batchErr: unknown) {
        console.warn('[Series] Batch episode count failed (non-blocking):', getErrorMessage(batchErr));
      }
    }

    const seriesWithStats = seriesList.map((series: SeriesRow) => {
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
  } catch (error: unknown) {
    console.error('[Series] List error:', truncateErrorMsg(error));
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

// ==================== [F] AI生成作品基本信息（必须在 series/:id 之前注册） ====================

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

    // v6.0.19: 无任何AI key时使用fallback
    if (!VOLCENGINE_API_KEY && !ALIYUN_BAILIAN_API_KEY) {
      const fallbackTitles = [
        { title: '星辰之约', description: '在繁华都市的霓虹灯下，两个看似毫无交集的灵魂因一次意外相遇，从此开启了一段充满欢笑与泪水的旅程。他们将在彼此的世界中发现真正的自我。' },
        { title: '破晓之刃', description: '末世降临，文明崩塌。一位失去记忆的少年在��墟中醒来，手中握着一把散发微光的古剑。为了找回过去的真相，他踏上了穿越危险地带的冒险之旅。' },
        { title: '云端食堂', description: '退��大厨老张意外获得了一间悬浮在云端的神秘食堂。每道菜都��唤醒食客尘封的记忆。温暖治愈的美食故事，讲述人间烟火中的点滴��动。' },
        { title: '代码恋人', description: '天才女程序员在调试AI系统时，意外激活了一个拥有情感的虚拟人格。当虚拟与现实的界限开始模糊，一段跨越次元的爱情���然萌芽。' },
        { title: '龙族传承', description: '少年林枫在祖传玉佩中发现了通往修仙界的秘密。拜入仙门后，他发现自己竟是远古�����族的后裔，一场关乎三界存亡的大战即将来临。' },
      ];
      const pick = fallbackTitles[Math.floor(Math.random() * fallbackTitles.length)];
      return c.json({ success: true, data: pick, fallback: true });
    }

    const prompt = userInput
      ? `你是一位专业的影视编剧。用户提供了以下创意灵感：\n"${userInput}"\n\n请根据这个灵感，生成一个吸引人的作品标题和详细简介。\n\n要求：\n1. 标题：简洁有力，4-10个字\n2. 简介：100-200字，要有吸引力，交代核心设���、主要冲突和卖点\n\n请严格按以下JSON格式回复（不要包含markdown标记）：\n{"title":"标题","description":"简介"}`
      : `你是一位专业的影视编剧。请随机创作一个有趣的影视概念，可以是爱情、悬疑、奇幻、科幻、都市等任意题材。\n\n要求：\n1. 标题：简洁有力，4-10个字，有创意\n2. 简介：100-200字，要有吸引力，交代核心设定、����要冲突和卖点\n\n请严格按以下JSON格式回复（不要包含markdown标记）：\n{"title":"标题","description":"简介"}`;

    // v6.0.19: 多模型智能路由（medium tier — 简短生成任务）
    const aiResult = await callAI({
      messages: [{ role: 'user', content: prompt }],
      tier: 'medium',
      temperature: 0.9,
      timeout: 60000,
    });
    const content = aiResult.content;

    // 尝试解析JSON
    let parsed: { title?: string; description?: string } | null = null;
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
  } catch (error: unknown) {
    console.error('[AI] generate-basic-info error:', truncateErrorMsg(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

// ==================== [F] AI生成故事大纲（必须在 series/:id 之前注册） ====================

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
          if (epNum === 1) return `第1集 - 命运的开端\n主角登场，日常生活中遭遇意外事件，命运的齿轮开��转动。`;
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

    const prompt = `你是一位专业的影视编剧。请根据以下信息，创作一个详细的故事大纲。

作品标题：${title}
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
  } catch (error: unknown) {
    console.error('[AI] generate-outline error:', truncateErrorMsg(error));
    if (error instanceof Error && error.name === 'AbortError') {
      return c.json({ success: false, error: 'AI生成超时，请重试' }, 504);
    }
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

// ==================== [F] AI智能拆解用户内容（必须在 series/:id 之前注册） ====================

app.post(`${PREFIX}/series/ai-parse-content`, async (c) => {
  try {
    const body = await c.req.json();
    const { content } = body;
    // v6.0.188: 前端可传递已上传的参考素材图片URL，AI拆解时启用多模态视觉
    const referenceImageUrls: string[] = Array.isArray(body.referenceImageUrls)
      ? (body.referenceImageUrls as unknown[]).filter((u): u is string => typeof u === 'string' && u.startsWith('http')).slice(0, 5)
      : [];

    if (!content || typeof content !== 'string' || content.trim().length < 2) {
      return c.json({ success: false, error: '请输入要拆解的内容' }, 400);
    }

    const userPhone = c.req.header('X-User-Phone') || '';
    if (userPhone) {
      const rateCheck = rateLimiters.aiGenerate.check(userPhone);
      if (!rateCheck.allowed) {
        return c.json({ success: false, error: `请求过于频繁，请${rateCheck.retryAfter}秒后重试` }, 429);
      }
    }

    // 无AI key时使用规则引擎 fallback
    if (!VOLCENGINE_API_KEY && !ALIYUN_BAILIAN_API_KEY) {
      const trimmed = content.trim();
      const isPromo = /品牌|宣传|推广|产品|广告|营销|企业/.test(trimmed);
      const isAd = /广告|TVC|商业片/.test(trimmed);
      return c.json({
        success: true,
        fallback: true,
        data: {
          title: trimmed.substring(0, 20),
          description: trimmed.substring(0, 200),
          genre: 'drama',
          style: 'realistic',
          productionType: isPromo ? 'brand_promo' : isAd ? 'advertisement' : 'short_drama',
          episodeCount: isPromo || isAd ? 1 : 6,
          storyOutline: trimmed,
          promoTone: isPromo ? 'cinematic' : undefined,
        },
      });
    }

    const prompt = `你是一位世界一流的影视策划AI。用户提供了一段原始内容，请智能分析并拆解为完整的影视创作方案。

用户输入内容：
"""
${content.trim().substring(0, 8000)}
"""

请根据内容智能判断最合适的创作方案，严格按以下JSON格式回复（不要包含markdown标记）：
{
  "title": "作品标题（4-15字，简洁有力）",
  "description": "作品简介（100-300字，概括核心内容和亮点）",
  "genre": "题材类型（romance/suspense/comedy/action/fantasy/horror/scifi/drama 之一）",
  "style": "视觉风格（realistic/anime/cartoon/cyberpunk/chinese/fantasy/comic/noir/ghibli 之一）",
  "productionType": "作品类型（comic_drama/short_drama/micro_film/movie/tv_series/documentary/music_video/advertisement/brand_promo/product_promo 之一）",
  "episodeCount": 集数（数字，宣传片/广告1-3，短剧3-10，���视剧10-50）,
  "storyOutline": "详细的故事大纲或脚本方案（500-2000字，包含分集/分段���要）",
  "promoTone": "如果是宣传/广告类，选择调性（luxury/tech/warm/energetic/minimal/cinematic/documentary/playful），否则为null",
  "slogan": "如果是宣传/广告类，生成一句广告语，否则为null",
  "targetAudience": "目标受众描述（20-50字）",
  "sellingPoints": ["如果是产品/品牌类，提取3-5个核心卖点，否则为空数组"],
  "reasoning": "简要说明为什么选择这个类型和风格（50字内）"
}

关键判断规则：
- 如果内容涉及品牌/企业介绍 → brand_promo
- 如果内容涉及产品功能/发布 → product_promo  
- 如果内容涉及广告创意/商业推广 → advertisement
- 如果内容是故事/小说/剧本 → 根据长度选short_drama/tv_series/movie
- 如果内容是纪实/真实事件 → documentary
- 如果内容较短且像一个创意点子 → short_drama，��扩展为完整大纲
- style应根据内容调性选择最匹配的视觉风格`;

    // v6.0.194: 当用户上传了参考素材图片时，注入多模态视觉分析指令
    const multimodalPrompt = referenceImageUrls.length > 0
      ? `${prompt}\n\n【重要：用户已上传${referenceImageUrls.length}张参考素材图片】请仔细分析这些图片中的视觉元素（品牌logo、产品外观、场景风格、色彩调性、人物形象等），将其作为创作方案的核心视觉参考。公司logo/品牌形象应保持原样，其他素材内容可以扩展优化以更好展现理念和产品。请确保生成的故事大纲中各分镜/场景内容相互衔接但坚决不重复。`
      : prompt;

    const aiResult = await callAI({
      messages: [{ role: 'user', content: multimodalPrompt }],
      tier: 'heavy',
      temperature: 0.7,
      max_tokens: 4000,
      timeout: 120000,
      imageUrls: referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
    });
    const aiContent = aiResult.content;

    // 解析AI返回的JSON
    let parsed: Record<string, unknown> | null = null;
    try {
      const cleaned = aiContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // 尝试提取JSON块
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]); } catch { /* ignore */ }
      }
    }

    if (!parsed || !parsed.title) {
      console.warn('[AI] ai-parse-content: Failed to parse response, falling back');
      return c.json({
        success: true,
        fallback: true,
        data: {
          title: content.trim().substring(0, 20),
          description: content.trim().substring(0, 300),
          genre: 'drama',
          style: 'realistic',
          productionType: 'short_drama',
          episodeCount: 6,
          storyOutline: content.trim(),
        },
      });
    }

    // 校验和规范化字段
    const validProductionTypes = ['comic_drama','short_drama','micro_film','movie','tv_series','documentary','music_video','advertisement','brand_promo','product_promo'];
    const validStyles = ['realistic','anime','cartoon','cyberpunk','chinese','fantasy','comic','pixel','threed','oil_painting','watercolor','noir','steampunk','xianxia','ghibli','ukiyoe'];
    const validGenres = ['romance','suspense','comedy','action','fantasy','horror','scifi','drama'];

    const pt = validProductionTypes.includes(parsed.productionType as string) ? parsed.productionType : 'short_drama';
    const st = validStyles.includes(parsed.style as string) ? parsed.style : 'realistic';
    const gn = validGenres.includes(parsed.genre as string) ? parsed.genre : 'drama';
    const ep = typeof parsed.episodeCount === 'number' ? Math.max(1, Math.min(80, parsed.episodeCount)) : 6;

    return c.json({
      success: true,
      data: {
        title: String(parsed.title || '').substring(0, 50),
        description: String(parsed.description || '').substring(0, 500),
        genre: gn,
        style: st,
        productionType: pt,
        episodeCount: ep,
        storyOutline: String(parsed.storyOutline || content.trim()).substring(0, 10000),
        promoTone: parsed.promoTone || null,
        slogan: parsed.slogan || null,
        targetAudience: parsed.targetAudience ? String(parsed.targetAudience) : null,
        sellingPoints: Array.isArray(parsed.sellingPoints) ? parsed.sellingPoints.filter((p: unknown) => typeof p === 'string') : [],
        reasoning: parsed.reasoning ? String(parsed.reasoning) : null,
      },
    });
  } catch (error: unknown) {
    console.error('[AI] ai-parse-content error:', truncateErrorMsg(error));
    if (error instanceof Error && error.name === 'AbortError') {
      return c.json({ success: false, error: 'AI分析超时，请重试' }, 504);
    }
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

// ==================== [F] 作品详情 ====================

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
      return c.json({ error: '作品不存在', message: 'Series not found' }, 404);
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

    const { data: rawCharacters, error: charErr } = charResult;
    if (charErr) console.warn('[Series] Characters query failed:', truncateErrorMsg(charErr));
    // v6.0.176: 去重——按name去重，保留最新记录（created_at DESC已由order保证升序，取最后出现的）
    const characters = (() => {
      const raw = rawCharacters || [];
      if (raw.length <= 1) return raw;
      const seen = new Map<string, CharacterRow>();
      for (const ch of raw) {
        seen.set(ch.name, ch); // 后出现的覆盖先出现的（同名保留最新）
      }
      if (seen.size < raw.length) {
        console.warn(`[Series] Deduplicated characters: ${raw.length} → ${seen.size} (series ${seriesId})`);
        // 异步清理DB中的重复行（不阻塞响应）
        const keepIds = new Set(Array.from(seen.values()).map((ch: CharacterRow) => ch.id));
        const dupeIds = raw.filter((ch: CharacterRow) => !keepIds.has(ch.id)).map((ch: CharacterRow) => ch.id);
        if (dupeIds.length > 0) {
          supabase.from('series_characters').delete().in('id', dupeIds)
            .then(({ error: delErr }) => {
              if (delErr) console.warn('[Series] Failed to clean duplicate characters:', delErr.message);
              else console.log(`[Series] ✅ Cleaned ${dupeIds.length} duplicate character rows for series ${seriesId}`);
            });
        }
      }
      return Array.from(seen.values());
    })();
    const { data: episodes, error: epErr } = epResult;
    if (epErr) console.warn('[Series] Episodes query failed:', truncateErrorMsg(epErr));
    const { data: storyboards, error: sbErr } = sbResult;
    if (sbErr) console.error('[Series] Storyboards query FAILED (causes 0-storyboards bug):', truncateErrorMsg(sbErr));

    // 将分镜关联到剧集（始终附加 storyboards 数组，即使为空��
    let enrichedEpisodes = episodes || [];
    if (enrichedEpisodes.length > 0) {
      const sbList = storyboards || [];
      // v6.0.89: O(N×M)→O(N+M) 优化——用Map索引替代逐集filter
      const sbMap = new Map<number, StoryboardRow[]>();
      for (const sb of sbList) {
        const epNum = Number(sb.episode_number);
        if (!sbMap.has(epNum)) sbMap.set(epNum, []);
        sbMap.get(epNum)!.push(sb);
      }
      enrichedEpisodes = enrichedEpisodes.map((ep: EpisodeRow) => ({
        ...ep,
        storyboards: sbMap.get(Number(ep.episode_number)) || [],
      }));

      // v6.0.180: 智能修正 episode.status——如果有 merged_video_url 或所��分镜都有 video_url，自动标记为 completed
      const epIdsToFix: string[] = [];
      enrichedEpisodes = enrichedEpisodes.map((ep: EpisodeRow & { storyboards?: StoryboardRow[] }) => {
        if (ep.status === 'completed') return ep;
        const hasMergedVideo = !!(ep.merged_video_url && ep.merged_video_url.trim());
        const epSbs = ep.storyboards || [];
        const allSbHaveVideo = epSbs.length > 0 && epSbs.every((sb: StoryboardRow) => sb.video_url && sb.video_url.trim());
        if (hasMergedVideo || allSbHaveVideo) {
          epIdsToFix.push(ep.id);
          return { ...ep, status: 'completed' };
        }
        return ep;
      });
      // 异步持久化������（不阻塞响应）
      if (epIdsToFix.length > 0) {
        console.log(`[Series] Auto-correcting ${epIdsToFix.length} episode(s) status to 'completed' for series ${seriesId}`);
        supabase.from('series_episodes')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .in('id', epIdsToFix)
          .then(({ error: fixErr }) => {
            if (fixErr) console.warn('[Series] Failed to auto-correct episode statuses:', fixErr.message);
            else console.log(`[Series] ✅ Auto-corrected ${epIdsToFix.length} episode statuses to completed`);
          });
      }

      // 诊断日志
      const totalSb = sbList.length;
      const attachedSb = enrichedEpisodes.reduce((s: number, ep: EpisodeRow & { storyboards?: StoryboardRow[] }) => s + (ep.storyboards?.length || 0), 0);
      if (totalSb > 0 && attachedSb === 0) {
        console.error(`[Series] BUG: ${totalSb} storyboards fetched but 0 attached! ep_nums=[${enrichedEpisodes.map((e: EpisodeRow) => e.episode_number)}], sb_ep_nums=[${[...new Set(sbList.map((s: StoryboardRow) => s.episode_number))]}]`);
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
  } catch (error: unknown) {
    console.error('[Series] Detail error:', truncateErrorMsg(error));
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

// ==================== [F] 创建作品 ====================

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
        const genPrompt = `你是专业${_ptLabel}策划。用户的创意：\"${storyOutline}\"
根据这段描述生成：1.吸引人的${_ptLabel}标题（2-8字）2.精彩简介（50-100字，体现${_ptLabel}专业质感）3.类型（romance/suspense/comedy/action/fantasy/horror/scifi/drama��一）
严格按JSON格式回复（不要markdown标记）：{\"title\":\"标题\",\"description\":\"简介\",\"genre\":\"类型\"}`;
        void `你是专业${_ptLabel}策划。用户的创意："${storyOutline}"
根据这段描述生成：1.吸引人的${_ptLabel}标题（2-8字）2.精彩简介（50-100��，体现${_ptLabel}专业质感）3.类型（romance/suspense/comedy/action/fantasy/horror/scifi/drama之一）
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
      } catch (aiErr: unknown) {
        console.warn('[Series] AI auto-title failed:', getErrorMessage(aiErr));
      }
    }

    // 最终兜底��确保 title 不为空
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
    //           后续所有分镜���无前序图时使用此图作为i2v风格锚点，确保从第一帧就风格统一
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

    // v6.0.70: ���认发布到社区（isPublic: true），用户��后续���编辑器中关闭
    dbBody.coherence_check = {
      ...(dbBody.coherence_check || {}),
      isPublic: body.isPublic !== undefined ? body.isPublic : true,
    };
    delete dbBody.is_public;

    // v6.0.78: 视频分辨率存入coherence_check（保证同一剧所有分镜一致）
    if (body.resolution) {
      dbBody.coherence_check = {
        ...(dbBody.coherence_check || {}),
        resolution: body.resolution,
      };
    }
    delete dbBody.resolution;

    // v6.0.79: 视频比例存入coherence_check（同一���全部分镜保持一致比例）
    if (body.aspectRatio) {
      dbBody.coherence_check = {
        ...(dbBody.coherence_check || {}),
        aspectRatio: body.aspectRatio,
      };
    }
    delete dbBody.aspect_ratio;

    // v6.0.90: 品牌/产品宣传片专属字段存入coherence_check
    if (body.brandName || body.slogan || body.sellingPoints || body.promoTone || body.callToAction) {
      dbBody.coherence_check = {
        ...(dbBody.coherence_check || {}),
        brandName: body.brandName || undefined,
        slogan: body.slogan || undefined,
        sellingPoints: body.sellingPoints || undefined,
        promoTone: body.promoTone || undefined,
        callToAction: body.callToAction || undefined,
        targetAudience: body.targetAudience || undefined,
      };
    }
    delete dbBody.brand_name;
    delete dbBody.slogan;
    delete dbBody.selling_points;
    delete dbBody.promo_tone;
    delete dbBody.call_to_action;
    delete dbBody.target_audience;

    // v6.0.192: 用户上传的参考素材（图片+视频）存入coherence_check
    if (body.referenceAssets && Array.isArray(body.referenceAssets) && body.referenceAssets.length > 0) {
      dbBody.coherence_check = {
        ...(dbBody.coherence_check || {}),
        referenceAssets: body.referenceAssets,
      };
      console.log(`[Series] 📎 ${body.referenceAssets.length} reference assets stored (${body.referenceAssets.map((a: Record<string, string>) => `${a.type}:${a.tag || 'general'}`).join(', ')})`);
      // 如果素材中有图片且没有设置referenceImageUrl，使用第一张图片作为风格锚点
      if (!body.referenceImageUrl) {
        const firstImage = body.referenceAssets.find((a: Record<string, string>) => a.type === 'image');
        if (firstImage) {
          dbBody.coherence_check.referenceImageUrl = firstImage.url;
          dbBody.coherence_check.styleAnchorImageUrl = firstImage.url;
          dbBody.coherence_check.styleAnchorSetAt = new Date().toISOString();
          dbBody.coherence_check.styleAnchorScene = 'user-upload';
          console.log(`[Series] 🎨 Auto-set first image asset as style anchor: ${String(firstImage.url).substring(0, 60)}...`);
        }
      }
    }
    delete dbBody.reference_assets;

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
  } catch (error: unknown) {
    console.error('[Series] Create error:', truncateErrorMsg(error));
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

// ==================== [F] 更新作品 ====================

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
    const cleanBody: Record<string, unknown> = {};
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
  } catch (error: unknown) {
    console.error('[Series] Update error:', truncateErrorMsg(error));
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

// ==================== [F] 删除作品 ====================
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

    // 2-5. v6.0.175: parallelize all independent cascade deletes (was sequential waterfall)
    const [{ error: sbErr }, { error: epErr }, { error: charErr }, { error: likesErr }, { error: commentsErr }, { error: viewHistErr }] = await Promise.all([
      supabase.from('series_storyboards').delete().eq('series_id', seriesId),
      supabase.from('series_episodes').delete().eq('series_id', seriesId),
      supabase.from('series_characters').delete().eq('series_id', seriesId),
      supabase.from('likes').delete().eq('work_id', seriesId),
      supabase.from('comments').delete().eq('work_id', seriesId),
      supabase.from('viewing_history').delete().eq('series_id', seriesId),
    ]);
    if (sbErr) console.warn(`[Delete] Warning: delete storyboards failed: ${sbErr.message}`);
    if (epErr) console.warn(`[Delete] Warning: delete episodes failed: ${epErr.message}`);
    if (charErr) console.warn(`[Delete] Warning: delete characters failed: ${charErr.message}`);
    if (likesErr) console.warn(`[Delete] Warning: delete likes failed: ${likesErr.message}`);
    if (commentsErr) console.warn(`[Delete] Warning: delete comments failed: ${commentsErr.message}`);
    if (viewHistErr) console.warn(`[Delete] Warning: delete viewing_history failed: ${viewHistErr.message}`);

    // 6. 最后删除系列本身
    const { error } = await supabase.from('series').delete().eq('id', seriesId);
    if (error) return c.json({ error: error.message }, 500);

    console.log(`[Delete] ✅ Series ${seriesId} fully deleted (tasks cancelled: ${cancelledTasks?.length || 0})`);
    return c.json({ success: true, cancelledTasks: cancelledTasks?.length || 0 });
  } catch (error: unknown) {
    console.error(`[Delete] ❌ Error deleting series: ${getErrorMessage(error)}`);
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

// ------------------------------------------------------------------
//  [D] 社区 & 互动 — 社区作品 / 用户作品 / 点赞 / 评论 / 分享
// ------------------------------------------------------------------

// ==================== [G] 社区作品 ====================

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

    const phones = [...new Set(tasks.map((t: VideoTaskRow) => t.user_phone))];
    const taskIds = tasks.map((t: VideoTaskRow) => t.task_id);

    // v6.0.29: per-item head:true count queries — eliminates unbounded row transfer
    // (previously fetched up to 5000 likes rows and counted in JS, risking PostgREST 1000-row truncation)
    const [usersResult, ...likeCountResults] = await Promise.all([
      supabase.from('users').select('phone, nickname, avatar_url').in('phone', phones),
      ...taskIds.map((id: string) =>
        supabase.from('likes').select('*', { count: 'exact', head: true }).eq('work_id', id)
      ),
    ]);

    const usersMap = new Map((usersResult.data || []).map((u: UserRow) => [u.phone, u]));
    const likesMap = new Map<string, number>();
    taskIds.forEach((id: string, i: number) => {
      likesMap.set(id, likeCountResults[i].count || 0);
    });

    const works = tasks
      .filter((task: VideoTaskRow) => task.video_url && task.video_url.trim() !== '')
      .filter((task: VideoTaskRow) => {
        // v6.0.19: 过滤掉属于作品系列的分镜视频
        const meta = parseMeta(task.generation_metadata);
        return !meta?.seriesId;
      })
      .map((task: VideoTaskRow) => {
        const user = usersMap.get(task.user_phone);
        const metadata = parseMeta(task.generation_metadata);
        return {
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
          episodeNumber: metadata?.episodeNumber,
          storyboardNumber: metadata?.storyboardNumber,
        };
      });

    return c.json({ success: true, works, total: works.length, page, limit, hasMore: since ? false : works.length >= limit });
  } catch (error: unknown) {
    console.error('[Community] Works error:', truncateErrorMsg(error));
    return c.json({ success: false, error: getErrorMessage(error), works: [], total: 0 }, 500);
  }
});

// ==================== [G] 用户作品 ====================

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
    const taskIds = tasks.map((t: VideoTaskRow) => t.task_id);
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

    // v6.0.19: 过滤掉属于作品系列的分镜视频 + 修复thumbnail
    const works = tasks
      .filter((task: VideoTaskRow) => {
        const meta = parseMeta(task.generation_metadata);
        return !meta?.seriesId;
      })
      .map((task: VideoTaskRow) => ({
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
  } catch (error: unknown) {
    console.error('[Community] User works error:', truncateErrorMsg(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
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
  } catch (error: unknown) {
    console.error('[Community] Delete work error:', truncateErrorMsg(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

// ==================== [G] 互动功能 ====================

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
  } catch (error: unknown) {
    console.error('[POST /series/:id/like] Error:', getErrorMessage(error));
    return c.json({ error: getErrorMessage(error) }, 500);
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
    // v6.0.26: 移除comments_count反规范化更新（series表无此列），评论数���过comments表实时count
    return c.json({ success: true, data: toCamelCase(data) });
  } catch (error: unknown) {
    console.error('[POST /series/:id/comment] Error:', getErrorMessage(error));
    return c.json({ error: getErrorMessage(error) }, 500);
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
  } catch (error: unknown) {
    console.error('[GET /series/:id/comments] Error:', getErrorMessage(error));
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

// v6.0.26: shares_count列不存在于series表，改为无状态stub（与community/works/:workId/share���齐）
// series表没有shares_count列，无法持久化分享计数。前端以fire-and-forget方式调用，不依赖返回数据。
app.post(`${PREFIX}/series/:id/share`, async (c) => {
  return c.json({ success: true });
});

// ------------------------------------------------------------------
//  [E] 内容管理 — 角色 / AI角色 / 剧集 / 分镜 / 视频任务
// ------------------------------------------------------------------

// ==================== [H] 角色操作 ====================

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
  } catch (error: unknown) {
    console.error('[GET /series/:id/characters] Error:', getErrorMessage(error));
    return c.json({ error: getErrorMessage(error) }, 500);
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
  } catch (error: unknown) {
    console.error('[POST /series/:id/characters] Error:', getErrorMessage(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

// 更新角色
app.put(`${PREFIX}/series/:id/characters/:charId`, async (c) => {
  try {
    const charId = c.req.param('charId');
    const body = await c.req.json();
    const updates: Partial<CharacterRow> = {};
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
  } catch (error: unknown) {
    console.error('[PUT /series/:id/characters/:charId] Error:', getErrorMessage(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

// 删除角色
app.delete(`${PREFIX}/series/:id/characters/:charId`, async (c) => {
  try {
    const charId = c.req.param('charId');
    const { error } = await supabase.from('series_characters').delete().eq('id', charId);
    if (error) return c.json({ success: false, error: error.message }, 500);
    return c.json({ success: true });
  } catch (error: unknown) {
    console.error('[DELETE /series/:id/characters/:charId] Error:', getErrorMessage(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

// ==================== [H] AI智能生成角色 v5.4.1 ====================

app.post(`${PREFIX}/series/:id/ai-generate-characters`, async (c) => {
  try {
    const seriesId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));

    // v6.0.23: select specific fields — only need basic info for character generation prompt
    const { data: series, error: sErr } = await supabase.from('series').select('id, title, description, genre, theme, style, story_outline').eq('id', seriesId).maybeSingle();
    if (sErr || !series) return c.json({ success: false, error: '作品不存在' }, 404);

    let characterRows: Omit<CharacterRow, 'id' | 'created_at'>[] = [];

    if (VOLCENGINE_API_KEY || ALIYUN_BAILIAN_API_KEY) {
      // v6.0.177: removed unused charPrompt — superseded by charPromptFixed
      void `你是一位专业的影视编剧。请根据以下信息，为作品创作3-5个主要角色。\n\n作品标题：${series.title}\n剧集简介：${series.description || '��提供'}\n${series.genre ? `类型：${series.genre}` : ''}\n${series.theme ? `主题：${series.theme}` : ''}\n${series.story_outline ? `故事大纲：${(series.story_outline || '').substring(0, 500)}` : ''}\n\n请严格按以下JSON格式回复（不要包含markdown标记），返回一个数组：\n[{"name":"角色名","role":"protagonist|supporting|antagonist","description":"角色背景描述(30-50字)","appearance":"外貌特征(30-50字，包含年龄、发型、服装等)","personality":"性格特征(10-20字)"}]\n\n要求：\n1. 必须有1个protagonist（主角），1-2个supporting（配角），可选1个antagonist（反派）\n2. 角色之间要有关联和互动关系\n3. 外貌描述要具体，便于AI绘图\\n4. 【重要】角色的名字、职业、背景必须与作品标题「${series.title}��和简介匹配，禁止创作与主题无关的��色`;

      console.log(`[AI] ai-generate-characters: calling AI for series ${seriesId}`);
      // v6.0.84: 独立角色生成prompt同步升级——description 80-120字、personality 30-50字、新增relationships
      const charPromptFixed = `你是一位专业的影视编剧。请根据以下信息，为作品创作3-5个主要角色。\\n\\n作品标题：${series.title}\\n剧集简介：${series.description || '未提供'}\\n${series.genre ? `类型：${series.genre}` : ''}\\n${series.theme ? `主题：${series.theme}` : ''}\\n${series.story_outline ? `故事大纲：${(series.story_outline || '').substring(0, 500)}` : ''}\\n\\n请严格按以下JSON格式回复（不要包含markdown标记），返回一个数组：\\n[{\"name\":\"角色名\",\"role\":\"protagonist|supporting|antagonist\",\"description\":\"角色背景故事(80-120字,���职业/家庭背景/人生关键经历/核心动机/内心矛盾/性格成因)\",\"appearance\":\"外貌特征(50-80字,必须包含年龄、身高体型、发型发色、面部五官特征、标志性服装配饰)\",\"personality\":\"性格特征与说话风格(30-50字,含性格��签+说话习惯+口头禅+情绪表达方式)\",\"relationships\":\"与其他角色的关系(20-40字,如与XX是青梅竹马/暗恋XX/与XX有仇怨)\"}]\\n\\n要求：\\n1. 必须有1个protagonist（主角），1-2个supporting（配角），可选1个antagonist（反派）\\n2. 角色之间要有关联和互动关���\\n3. 外貌描述要具体，便于AI绘图\\n4. 【重要】角色的名字、职业、背景���须与作品标题「${series.title}」和简介匹配，禁止创作与主题无关的角���\\n5. 【外貌细节必填】appearance字段必须包含：具体年龄、五官特征(如瓜子脸/丹凤眼)、发型发色(如齐肩黑色长发)、身材体���(如身材修长172cm)、标志性服饰(如常穿白色连衣裙)，每个角色外貌描述至少40字\\n6. 【中国审美】人物面容精致优美、五官端正比例协调、气质自然大方，符合中国观众审美偏好\\n7. 【视觉区分度】不同角色的发型/发色/服饰风格/体型必须有明显区分，确保AI绘图时能清晰辨别不同角色`; // v6.0.177 — old charPromptFixed removed below
      /* v6.0.177: dead code removed */
      void 0; //你是一位专业的影视编剧。请根据以下信息，为作品创作3-5个主要角色。\n\n作品标题：${series.title}\n剧集简介：${series.description || '未提供'}\n${series.genre ? `类型：${series.genre}` : ''}\n${series.theme ? `主题：${series.theme}` : ''}\n${series.story_outline ? `故事大纲：${(series.story_outline || '').substring(0, 500)}` : ''}\n\n请严格按以下JSON格式回复（不要包含markdown标记），返回一个数组：\n[{"name":"角色名","role":"protagonist|supporting|antagonist","description":"角��背景故事(80-120字,含职业/家庭背景/人生关键经历/核心动机/内心矛盾/性格成因)","appearance":"外貌特征(50-80字,必须包含年龄、身高体型、发型发色、面部五官特征、标志性服装配饰)","personality":"性格特征与说话风格(30-50字,含性格标签+说话习惯+口头禅+情绪表达方式)","relationships":"与其���角色的关系(20-40字,如与XX是青梅竹马/暗恋XX/与XX有仇怨)"}]\n\n要求：\n1. 必须有1个protagonist（主角），1-2个supporting（配角），可选1个antagonist（反派）\n2. 角色之间要有关联和互动关系\n3. 外貌描述要具体，便于AI绘图\n4. 【重要】角色的名字、职业、背景必须与作品标题「${series.title}」和简介匹配，禁止创作与主题无关的角色\n5. 【外貌细节必填】appearance字段必须包含：具体年龄、五官特征(如瓜子脸/丹凤眼)、发型发色(如齐肩黑色长发)、身材体型(如身材修长172cm)、标志性服饰(如常穿白色连衣裙)，每个角色外貌描述至少40字\n6. 【中国审美】人物面容精致优美、五官端正比例协调、气质自然大方，符合中国观���审美偏好\n7. 【视觉区分度】不同角色的发型/发色/服饰风格/体型必须有明显区分，确保AI绘图时能清晰辨别不同角色`;
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
              characterRows = chars.map((ch: AIParsedCharacter) => ({
                series_id: seriesId,
                name: ch.name || '未命名角色',
                role: ['protagonist', 'supporting', 'antagonist', 'mentor', 'extra'].includes(ch.role) ? ch.role : 'supporting',
                description: `${ch.description || ''}${ch.relationships ? '。关系：' + ch.relationships : ''}`, // v6.0.84: 合并relationships
                appearance: ch.appearance || '',
                personality: ch.personality || '',
              }));
              console.log(`[AI] ai-generate-characters: parsed ${characterRows.length} characters`);
            } catch (parseErr: unknown) {
              console.warn(`[AI] ai-generate-characters: content JSON parse failed: ${getErrorMessage(parseErr)}, preview: ${content.substring(0, 200)}`);
            }
          }
        }
      } catch (aiErr: unknown) {
        console.warn('[AI] ai-generate-characters: AI call failed:', truncateErrorMsg(aiErr));
      }
    }

    if (characterRows.length === 0) {
      characterRows = [
        { series_id: seriesId, name: '主角', role: 'protagonist', description: '故事的主人公', appearance: '20岁左右，精神饱满，目光坚定', personality: '勇敢、坚韧、善良' },
        { series_id: seriesId, name: '挚友', role: 'supporting', description: '主角最信任的伙伴', appearance: '与主角同龄，性格开朗', personality: '忠诚、幽默、热心' },
        { series_id: seriesId, name: '导师', role: 'supporting', description: '引导主角成长的智者', appearance: '中年��，气质沉稳', personality: '睿智、严厉、关怀' },
      ];
    }

    await supabase.from('series_characters').delete().eq('series_id', seriesId);
    const { data: createdChars, error: charInsertErr } = await supabase.from('series_characters').insert(characterRows).select();
    if (charInsertErr) return c.json({ success: false, error: charInsertErr.message }, 500);

    console.log(`[AI] ai-generate-characters: ✅ Created ${createdChars?.length || 0} characters for series ${seriesId}`);
    return c.json({ success: true, data: toCamelCase(createdChars || []), count: createdChars?.length || 0 });
  } catch (error: unknown) {
    console.error('[AI] ai-generate-characters error:', truncateErrorMsg(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

// ==================== [H] 剧集操作 ====================

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
  } catch (error: unknown) {
    console.error('[GET /series/:id/episodes] Error:', getErrorMessage(error));
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

// ==================== [H] 分镜操作 ====================

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
  } catch (error: unknown) {
    console.error('[GET /series/:seriesId/episodes/:episodeId/storyboards] Error:', getErrorMessage(error));
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

// 🔥 v5.3.0: 更新单个分镜（前端生成视频后回写video_url/status）
app.patch(`${PREFIX}/series/:seriesId/storyboards/:sbId`, async (c) => {
  try {
    const sbId = c.req.param('sbId');
    const seriesId = c.req.param('seriesId');
    const body = await c.req.json();
    const updates: Partial<StoryboardRow> = { updated_at: new Date().toISOString() };
    if (body.videoUrl !== undefined) updates.video_url = body.videoUrl;
    if (body.thumbnailUrl !== undefined) updates.thumbnail_url = body.thumbnailUrl;
    if (body.status !== undefined) updates.status = body.status;
    if (body.imageUrl !== undefined) updates.image_url = body.imageUrl;
    // v6.0.167: 支持更新 scene_number（拖拽排序持久化）
    if (body.sceneNumber !== undefined) updates.scene_number = body.sceneNumber;
    // v6.0.169: 支持更新分镜内容字段（编辑对话框持久化）
    if (body.description !== undefined) updates.description = body.description;
    if (body.dialogue !== undefined) updates.dialogue = body.dialogue;
    if (body.characters !== undefined) updates.characters = body.characters;
    if (body.location !== undefined) updates.location = body.location;
    if (body.timeOfDay !== undefined) updates.time_of_day = body.timeOfDay;
    if (body.cameraAngle !== undefined) updates.camera_angle = body.cameraAngle;
    if (body.duration !== undefined) updates.duration = body.duration;
    if (body.emotionalTone !== undefined) updates.emotional_tone = body.emotionalTone;

    const { data, error } = await supabase.from('series_storyboards')
      .update(updates).eq('id', sbId).eq('series_id', seriesId).select().single();
    if (error) {
      // ���果id匹配失败，尝试用 series_id + episode_number + scene_number
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
  } catch (error: unknown) {
    console.error('[PATCH /series/:seriesId/storyboards/:sbId] Error:', getErrorMessage(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

// v6.0.200: 客户端上传尾帧（浏览器从video元素提取的最后一帧图片）
// 当OSS视频截帧不可用时，由客户端提取并上传，作为下一场景i2v参考
app.post(`${PREFIX}/video-tasks/:taskId/last-frame`, async (c) => {
  try {
    const taskId = c.req.param('taskId');
    const body = await c.req.json();
    const { lastFrameDataUrl } = body; // data:image/jpeg;base64,...
    if (!lastFrameDataUrl || !lastFrameDataUrl.startsWith('data:image/')) {
      return c.json({ success: false, error: '无效的图片数据' }, 400);
    }
    // 检查任务是否已有尾帧（存储在generation_metadata.lastFrameUrl中）
    const { data: task } = await supabase.from('video_tasks')
      .select('task_id, generation_metadata').eq('task_id', taskId).maybeSingle();
    const existingMeta = (task?.generation_metadata as Record<string, unknown>) || {};
    if (existingMeta.lastFrameUrl) {
      return c.json({ success: true, message: 'Last frame already exists', lastFrameUrl: existingMeta.lastFrameUrl });
    }
    // 解码 base64 并上传到 OSS
    const base64Data = lastFrameDataUrl.split(',')[1];
    const binary = Uint8Array.from(atob(base64Data), ch => ch.charCodeAt(0));
    let lastFrameUrl = '';
    if (isOSSConfigured()) {
      lastFrameUrl = await uploadToOSS(`last-frames/${taskId}.jpg`, binary.buffer, 'image/jpeg');
    } else {
      // 回退到 Supabase Storage
      const IMAGE_BUCKET_LF = 'make-fc31472c-images';
      const { data: buckets } = await supabase.storage.listBuckets();
      if (!buckets?.some((b: StorageBucket) => b.name === IMAGE_BUCKET_LF)) {
        await supabase.storage.createBucket(IMAGE_BUCKET_LF, { public: true });
      }
      const fileName = `last-frames/${taskId}.jpg`;
      const { data: ud } = await supabase.storage.from(IMAGE_BUCKET_LF).upload(fileName, binary, { contentType: 'image/jpeg', upsert: true });
      if (ud?.path) {
        const { data: urlD } = supabase.storage.from(IMAGE_BUCKET_LF).getPublicUrl(ud.path);
        lastFrameUrl = urlD?.publicUrl || '';
      }
    }
    if (lastFrameUrl) {
      await supabase.from('video_tasks').update({
        generation_metadata: { ...existingMeta, lastFrameUrl },
      }).eq('task_id', taskId);
      console.log(`[LastFrame] ✅ Client-uploaded last frame for task ${taskId}: ${lastFrameUrl.substring(0, 60)}...`);
      return c.json({ success: true, lastFrameUrl });
    }
    return c.json({ success: false, error: '上传失败' }, 500);
  } catch (error: unknown) {
    console.error('[POST /video-tasks/:taskId/last-frame] Error:', getErrorMessage(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

// v6.0.169: 创建单个分镜
app.post(`${PREFIX}/series/:seriesId/storyboards`, async (c) => {
  try {
    const seriesId = c.req.param('seriesId');
    const body = await c.req.json();
    const row: Omit<StoryboardRow, 'id' | 'created_at' | 'updated_at' | 'video_url' | 'thumbnail_url' | 'image_url'> = {
      series_id: seriesId,
      episode_number: body.episodeNumber,
      scene_number: body.sceneNumber || 1,
      description: body.description || '',
      dialogue: body.dialogue || '',
      characters: body.characters || [],
      location: body.location || '',
      time_of_day: body.timeOfDay || '',
      camera_angle: body.cameraAngle || '中景',
      duration: body.duration || 10,
      emotional_tone: body.emotionalTone || '',
      status: body.status || 'draft',
    };
    console.log(`[POST /storyboards] seriesId=${seriesId}, ep=${row.episode_number}, scene=${row.scene_number}`);
    const { data, error } = await supabase.from('series_storyboards')
      .insert(row).select().single();
    if (error) {
      console.error(`[POST /storyboards] Error:`, error.message);
      return c.json({ success: false, error: error.message }, 500);
    }
    return c.json({ success: true, data: toCamelCase(data) });
  } catch (error: unknown) {
    console.error('[POST /storyboards] Error:', getErrorMessage(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

// v6.0.167: 批量重排分镜 scene_number（拖拽排序持久化）
app.post(`${PREFIX}/series/:seriesId/reorder-storyboards`, async (c) => {
  try {
    const seriesId = c.req.param('seriesId');
    const body = await c.req.json();
    const items: Array<{ id: string; sceneNumber: number }> = body.items;
    if (!Array.isArray(items) || items.length === 0) {
      return c.json({ success: false, error: 'items array is required' }, 400);
    }
    console.log(`[POST /reorder-storyboards] seriesId=${seriesId}, ${items.length} items`);

    // 并行更新所有分镜的 scene_number
    const results = await Promise.allSettled(
      items.map(({ id, sceneNumber }) =>
        supabase.from('series_storyboards')
          .update({ scene_number: sceneNumber, updated_at: new Date().toISOString() })
          .eq('id', id)
          .eq('series_id', seriesId)
      )
    );
    const failCount = results.filter(r => r.status === 'rejected').length;
    if (failCount > 0) {
      console.warn(`[POST /reorder-storyboards] ${failCount}/${items.length} updates failed`);
    }
    return c.json({ success: true, updated: items.length - failCount, failed: failCount });
  } catch (error: unknown) {
    console.error('[POST /reorder-storyboards] Error:', getErrorMessage(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

// v6.0.168: 删除单个分镜
app.delete(`${PREFIX}/series/:seriesId/storyboards/:sbId`, async (c) => {
  try {
    const seriesId = c.req.param('seriesId');
    const sbId = c.req.param('sbId');
    console.log(`[DELETE /storyboards] seriesId=${seriesId}, sbId=${sbId}`);
    const { error } = await supabase.from('series_storyboards')
      .delete().eq('id', sbId).eq('series_id', seriesId);
    if (error) {
      console.error(`[DELETE /storyboards] Error:`, error.message);
      return c.json({ success: false, error: error.message }, 500);
    }
    return c.json({ success: true });
  } catch (error: unknown) {
    console.error('[DELETE /storyboards] Error:', getErrorMessage(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

// v6.0.168: 批量删除分镜
app.post(`${PREFIX}/series/:seriesId/delete-storyboards`, async (c) => {
  try {
    const seriesId = c.req.param('seriesId');
    const body = await c.req.json();
    const ids: string[] = body.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return c.json({ success: false, error: 'ids array is required' }, 400);
    }
    console.log(`[POST /delete-storyboards] seriesId=${seriesId}, ${ids.length} ids`);
    const { error } = await supabase.from('series_storyboards')
      .delete().in('id', ids).eq('series_id', seriesId);
    if (error) {
      console.error(`[POST /delete-storyboards] Error:`, error.message);
      return c.json({ success: false, error: error.message }, 500);
    }
    return c.json({ success: true, deleted: ids.length });
  } catch (error: unknown) {
    console.error('[POST /delete-storyboards] Error:', getErrorMessage(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

// v6.0.171: AI润色分镜描述——增强场景描述的文学性和视觉化表达
app.post(`${PREFIX}/series/:seriesId/storyboards/polish`, async (c) => {
  try {
    const seriesId = c.req.param('seriesId');
    const body = await c.req.json();
    const { description, dialogue, characters: charNames, location, timeOfDay, cameraAngle, seriesTitle, seriesStyle, mode } = body;

    if (!description || description.trim().length < 5) {
      return c.json({ success: false, error: '场景描述过短，至少需要5个字符' }, 400);
    }

    console.log(`[POST /storyboards/polish] seriesId=${seriesId}, mode=${mode || 'full'}, desc=${description.substring(0, 50)}...`);

    if (!VOLCENGINE_API_KEY && !ALIYUN_BAILIAN_API_KEY) {
      return c.json({ success: false, error: 'AI服务未配置' }, 503);
    }

    const ctxParts: string[] = [];
    if (seriesTitle) ctxParts.push(`作品标题：${seriesTitle}`);
    if (seriesStyle) ctxParts.push(`视觉风格：${seriesStyle}`);
    if (location) ctxParts.push(`场景位置：${location}`);
    if (timeOfDay) ctxParts.push(`时间段：${timeOfDay}`);
    if (cameraAngle) ctxParts.push(`镜头角度：${cameraAngle}`);
    if (charNames && charNames.length > 0) ctxParts.push(`出场角色：${charNames.join('、')}`);
    const contextBlock = ctxParts.length > 0 ? `\n【场景上下文】\n${ctxParts.join('\n')}\n` : '';

    const polishMode = mode || 'full'; // full | description_only | dialogue_only
    let prompt = '';

    if (polishMode === 'dialogue_only') {
      prompt = `你是一位专业的影视编剧，擅长写出富有感染力和���色辨识度的台词。

请对以下分镜对白进行润色升级，使其更��自然、富有表现力和角色个性。
${contextBlock}
【原始场景描述】
${description}

【原始对白】
${dialogue || '（无对白）'}

【润色要求】
1. 台词要简洁有力，符合口语习惯，避免书面化
2. 体现角色性格和当时情绪状态
3. 加入适当的语气词、停顿或潜台词暗示
4. 如果原始无对白，根据场景描述创作1-2句合适的台词
5. 输出纯台词文本（不要角色名前缀），40字以内

请直接输出润色后的对白，不要解释：`;
    } else {
      const needDialogue = polishMode === 'full' && dialogue;
      prompt = `你是一位专业的分镜脚本编剧和视觉叙事专家，擅长将粗糙的场景描述升级为电影级分镜脚本。

请对以下分镜描述进行深度润色，使其成为AI视频生成的理想输入——既有文学性又有精确的视觉指导。
${contextBlock}
【原始场景描述】
${description}
${needDialogue ? `\n【原始对白】\n${dialogue}` : ''}

【润色要求——场景描述】
1. 描述必须是「视觉化」的——读者能在脑海中准确「看到」画面
2. 包含关键视觉元素：光线/色彩基调、空间纵深、人物姿态/表情、环境细节
3. 使用电影语言：镜头运动暗示（如"镜头缓缓推进"）、景深描述、构图意识
4. 加入感官细节（风吹过发丝、雨滴落在窗台上等）增强沉浸感
5. 保持60-100字，简练但信息密集，禁止空泛描述
6. 保留原始描述的核心叙事和情感基调，增强而非改变
${needDialogue ? `
【润色要求——对白】
7. 台词简洁有力，体现角色性格和情绪
8. 加入语气词或潜台词暗示增加层次
9. 40字以内` : ''}

请严格��以下JSON格式回复（不要markdown标记）：
${needDialogue
  ? '{"description":"润色后的场景描述","dialogue":"润色后的对白"}'
  : '{"description":"润色后的场景描述"}'}`;
    }

    const aiResult = await callAI({
      messages: [{ role: 'user', content: prompt }],
      tier: 'light',
      temperature: 0.85,
      max_tokens: 500,
      timeout: 30000,
    });

    console.log(`[POST /storyboards/polish] AI(${aiResult.model}): ${aiResult.content.substring(0, 100)}...`);

    let polished: { description?: string; dialogue?: string } = {};

    if (polishMode === 'dialogue_only') {
      polished = { dialogue: aiResult.content.trim().replace(/^["「���]|["」』]$/g, '') };
    } else {
      const jsonMatch = aiResult.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          polished = JSON.parse(jsonMatch[0]);
        } catch {
          polished = { description: aiResult.content.trim() };
        }
      } else {
        polished = { description: aiResult.content.trim() };
      }
    }

    if (polished.description) {
      polished.description = polished.description.replace(/```[\s\S]*?```/g, '').trim();
      if (polished.description.length < 10) polished.description = undefined;
    }
    if (polished.dialogue) {
      polished.dialogue = polished.dialogue.replace(/```[\s\S]*?```/g, '').replace(/^["「『]|["」』]$/g, '').trim();
    }

    return c.json({ success: true, data: polished, model: aiResult.model });
  } catch (error: unknown) {
    console.error('[POST /storyboards/polish] Error:', getErrorMessage(error));
    return c.json({ success: false, error: getErrorMessage(error) || '润色失败' }, 500);
  }
});

// ==================== [I] 视频任务 ====================

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
  } catch (error: unknown) {
    console.error('[GET /video-tasks] Error:', getErrorMessage(error));
    return c.json({ error: getErrorMessage(error) }, 500);
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
  } catch (error: unknown) {
    console.error('[GET /video-tasks/:taskId] Error:', getErrorMessage(error));
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

// ==================== [I] 浏览历史 ====================

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
  } catch (error: unknown) {
    console.error('[POST /series/:id/viewing-history] Error:', getErrorMessage(error));
    return c.json({ error: getErrorMessage(error) }, 500);
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
  } catch (error: unknown) {
    console.error('[GET /series/:id/viewing-history] Error:', getErrorMessage(error));
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

// ==================== [I] 数据库健康检查 ====================

app.get(`${PREFIX}/db-health`, async (c) => {
  try {
    const start = Date.now();
    const { data, error } = await supabase.from('series').select('id').limit(1);
    const latency = Date.now() - start;
    if (error) return c.json({ status: 'error', error: error.message, latency }, 500);
    return c.json({ status: 'ok', latency, version: APP_VERSION });
  } catch (error: unknown) {
    console.error('[GET /db-health] Error:', getErrorMessage(error));
    return c.json({ status: 'error', error: getErrorMessage(error) }, 500);
  }
});

// db-health: 只使用带前缀的路由

// ------------------------------------------------------------------
//  [G] 视频管道 — 分镜视频生成 / 合并视频 / AI创意生成
// ------------------------------------------------------------------

// ==================== [J] 作品分镜视频生成（简化版） ====================

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
        title: body.title || prompt.substring(0, 100) || `E${episodeNumber}-场���${sceneNumber}`,
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
  } catch (error: unknown) {
    console.error('[Video] Generate error:', truncateErrorMsg(error));
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

// ==================== [J] 作品合并视频（虚拟播放列表方式） ====================

// 旧路由保留兼容
app.post(`${PREFIX}/series/:seriesId/episodes/:episodeId/merge`, async (c) => {
  try {
    const seriesId = c.req.param('seriesId');
    const episodeId = c.req.param('episodeId');
    // 从剧集获取 episode_number
    const { data: ep } = await supabase.from('series_episodes').select('episode_number').eq('id', episodeId).maybeSingle();
    if (!ep) return c.json({ success: false, error: '剧集不存在' }, 404);
    const { data: storyboards } = await supabase
      .from('series_storyboards').select('scene_number, video_url, duration, description, image_url').eq('series_id', seriesId).eq('episode_number', ep.episode_number).order('scene_number', { ascending: true });
    const videos = (storyboards || []).filter((sb: StoryboardRow) => {
      const url = (sb.video_url || '').trim();
      return url.length > 0 && url.startsWith('http');
    }).map((sb: StoryboardRow) => ({
      sceneNumber: sb.scene_number, url: sb.video_url.trim(), duration: sb.duration || 10,
      title: sb.description || `场景${sb.scene_number}`, thumbnail: sb.image_url || '',
    }));
    if (videos.length === 0) return c.json({ success: false, error: '没有已生成的分镜视频' }, 400);
    return c.json({ success: true, data: { videoUrls: videos.map((v: VideoSegment) => v.url), totalVideos: videos.length } });
  } catch (error: unknown) {
    console.error('[POST /series/:seriesId/episodes/:episodeId/merge] Error:', getErrorMessage(error));
    return c.json({ error: getErrorMessage(error) }, 500);
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

    // v6.0.199: 合并前交叉验证——确保每个分镜的video_url来自最新任务
    // 根因: 重新生成视频后，storyboard可能仍关联旧任务的视频（与当前分镜内容不匹配）
    const { data: latestTasks } = await supabase.from('video_tasks')
      .select('task_id, video_url, generation_metadata')
      .filter('generation_metadata->>seriesId', 'eq', episode.series_id)
      .filter('generation_metadata->>episodeNumber', 'eq', String(episode.episode_number))
      .filter('generation_metadata->>type', 'eq', 'storyboard_video')
      .eq('status', 'completed')
      .not('video_url', 'is', null)
      .order('created_at', { ascending: false });

    const latestVideoByScene = new Map<number, string>();
    if (latestTasks) {
      for (const t of latestTasks) {
        const tMeta = parseMeta(t.generation_metadata);
        const tSn = Number(tMeta?.storyboardNumber || tMeta?.sceneNumber);
        if (tSn && !latestVideoByScene.has(tSn) && t.video_url?.startsWith('http')) {
          latestVideoByScene.set(tSn, t.video_url);
        }
      }
    }

    let videoUrlCorrected = 0;
    const videos: VideoSegment[] = allStoryboards
      .filter((sb: StoryboardRow) => {
        const latestUrl = latestVideoByScene.get(sb.scene_number);
        const sbUrl = (sb.video_url || '').trim();
        return (latestUrl || sbUrl).length > 0 && (latestUrl || sbUrl).startsWith('http');
      })
      .map((sb: StoryboardRow) => {
        const latestUrl = latestVideoByScene.get(sb.scene_number);
        const sbUrl = (sb.video_url || '').trim();
        let finalUrl = sbUrl;
        if (latestUrl && latestUrl !== sbUrl) {
          finalUrl = latestUrl;
          videoUrlCorrected++;
          console.log(`[MergeVideos] 🔄 Scene ${sb.scene_number}: corrected to latest task video`);
          // 异步修正storyboard中的URL
          supabase.from('series_storyboards').update({ video_url: latestUrl, updated_at: new Date().toISOString() })
            .eq('series_id', episode.series_id).eq('episode_number', episode.episode_number).eq('scene_number', sb.scene_number)
            .then(() => {}).catch(() => {});
        }
        return {
          sceneNumber: sb.scene_number, url: finalUrl, duration: sb.duration || 10,
          title: sb.description || `场景${sb.scene_number}`, thumbnail: sb.image_url || '',
        };
      });

    if (videoUrlCorrected > 0) {
      console.log(`[MergeVideos] ⚠️ Corrected ${videoUrlCorrected} scene(s) to latest task video URLs`);
    }
    console.log(`[MergeVideos] 分镜统计: 总数=${allStoryboards.length}, 有视频=${videos.length}, 场景号=[${videos.map((v: VideoSegment) => v.sceneNumber).join(',')}]${videoUrlCorrected ? `, URL修正=${videoUrlCorrected}` : ''}`);

    if (videos.length === 0) {
      return c.json({ success: false, error: '该剧集没有已生成的分镜视频，请先生成分镜视频' }, 400);
    }

    if (videos.length < allStoryboards.length) {
      console.warn(`[MergeVideos] ⚠️ 仅 ${videos.length}/${allStoryboards.length} 个分镜有视频，缺失场景: [${allStoryboards.filter((sb: StoryboardRow) => !(sb.video_url || '').trim().startsWith('http')).map((sb: StoryboardRow) => sb.scene_number).join(',')}]`);
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

    const totalDuration = videos.reduce((sum: number, v: VideoSegment) => sum + (v.duration || 10), 0);
    let mergeMethod = 'mp4';
    let mergedSegments = 0;

    console.log(`[MergeVideos] 🎬 Downloading ${videos.length} segments for MP4 merge...`);

    // v6.0.182: Pre-download URL refresh — resolve expired TOS signed URLs before download
    // Root cause: previously retried same expired TOS URL 3 times (always 403), wasting 3×60s
    // Fix: check DB for OSS alternatives + generate presigned URLs for reliable server-side fetch
    for (const v of videos as VideoSegment[]) {
      const url = v.url;
      const isTos = url.includes('volces.com') || url.includes('tos-cn');

      if (isTos) {
        // TOS signed URL likely expired — look for OSS alternative in DB
        const { data: sbRow } = await supabase.from('series_storyboards')
          .select('video_url').eq('series_id', episode.series_id)
          .eq('episode_number', episode.episode_number).eq('scene_number', v.sceneNumber).maybeSingle();
        const dbUrl = (sbRow?.video_url || '').trim();
        if (dbUrl && dbUrl !== url && dbUrl.startsWith('http') && !dbUrl.includes('volces.com') && !dbUrl.includes('tos-cn')) {
          console.log(`[MergeVideos] 🔄 Scene ${v.sceneNumber}: refreshed TOS→DB URL (${dbUrl.includes('.aliyuncs.com') ? 'OSS' : 'other'})`);
          v.url = dbUrl;
        } else {
          // Fallback: check video_tasks for OSS URL
          const { data: taskRows } = await supabase.from('video_tasks')
            .select('video_url, generation_metadata').eq('status', 'completed')
            .filter('generation_metadata->>seriesId', 'eq', episode.series_id)
            .like('video_url', '%aliyuncs.com%');
          if (taskRows) {
            for (const t of taskRows) {
              const m = t.generation_metadata;
              if (m?.episodeNumber === episode.episode_number &&
                  (m?.storyboardNumber === v.sceneNumber || m?.sceneNumber === v.sceneNumber) && t.video_url) {
                console.log(`[MergeVideos] 🔄 Scene ${v.sceneNumber}: refreshed TOS→task OSS URL`);
                v.url = t.video_url;
                break;
              }
            }
          }
        }
      }

      // Generate presigned GET URL for OSS URLs (bypasses CORS/permission issues)
      if (v.url.includes('.aliyuncs.com') && isOSSConfigured()) {
        try {
          const urlObj = new URL(v.url);
          const objectKey = urlObj.pathname.startsWith('/') ? urlObj.pathname.slice(1) : urlObj.pathname;
          if (objectKey) v.presignedUrl = await generatePresignedGetUrl(objectKey, 7200);
        } catch (e: unknown) {
          console.warn(`[MergeVideos] presignedGetUrl failed for scene ${v.sceneNumber}: ${getErrorMessage(e)}`);
        }
      }
    }

    // v6.0.65: 顺序下载 + 重试 + validSceneNumbers追踪（修复skippedSegments→场景号映射缺失）
    // v6.0.182: Try presigned URL first, then original URL, then retry presigned
    const validSegments: Uint8Array[] = [];
    const validSceneNumbers: number[] = [];
    const failedScenes: number[] = [];
    for (let idx = 0; idx < videos.length; idx++) {
      const v = (videos as VideoSegment[])[idx];
      let segment: Uint8Array | null = null;
      // Build URL attempt order: presigned (most reliable) → original → presigned again
      const urlsToTry: string[] = v.presignedUrl
        ? [v.presignedUrl, v.url, v.presignedUrl]
        : [v.url, v.url, v.url];
      for (let attempt = 1; attempt <= 3; attempt++) {
        const downloadUrl = urlsToTry[attempt - 1];
        try {
          const resp = await fetchWithTimeout(downloadUrl, {}, 60000);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const buf = await resp.arrayBuffer();
          segment = new Uint8Array(buf);
          const urlType = downloadUrl === v.presignedUrl ? 'presigned' : 'direct';
          console.log(`[MergeVideos] Downloaded ${idx + 1}/${videos.length} (scene ${v.sceneNumber}): ${(buf.byteLength / 1024).toFixed(0)}KB${attempt > 1 ? ` (retry ${attempt}, ${urlType})` : ''}`);
          break;
        } catch (dlErr: unknown) {
          const urlType = downloadUrl === v.presignedUrl ? 'presigned' : 'direct';
          console.warn(`[MergeVideos] Download attempt ${attempt}/3 for scene ${v.sceneNumber} failed (${urlType}): ${getErrorMessage(dlErr)}`);
          if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * attempt));
        }
      }
      if (segment) {
        validSegments.push(segment);
        validSceneNumbers.push(v.sceneNumber);
      } else {
        failedScenes.push(v.sceneNumber);
        console.error(`[MergeVideos] ❌ Scene ${v.sceneNumber} download FAILED after 3 attempts — will be MISSING from merged video`);
      }
    }

    if (failedScenes.length > 0) {
      console.warn(`[MergeVideos] ⚠️ ${failedScenes.length}/${videos.length} scenes failed download: [${failedScenes.join(',')}]`);
    }

    if (validSegments.length === 0) {
      return c.json({ success: false, error: `所有 ${videos.length} 个分镜视频下载失败（场景: ${videos.map((v: VideoSegment) => v.sceneNumber).join(',')}），请检查网络后重试` }, 500);
    }

    // v6.0.96: 内存检查——记录总大小，为批处理策略提供依据
    const totalSegBytes = validSegments.reduce((s: number, seg: Uint8Array) => s + seg.length, 0);
    console.log(`[MergeVideos] Total segment bytes: ${(totalSegBytes / 1024 / 1024).toFixed(1)}MB across ${validSegments.length} segments`);

    // v6.0.193: Runtime memory guard — actual download size often exceeds pre-estimate
    // concatMP4 needs ~2.5× totalSize (input arrays + output buffer + MP4 parsing overhead)
    const RUNTIME_MAX_MB = 80;
    if (totalSegBytes / 1024 / 1024 > RUNTIME_MAX_MB) {
      console.warn(`[MergeVideos] Runtime OOM guard: ${(totalSegBytes / 1024 / 1024).toFixed(1)}MB exceeds ${RUNTIME_MAX_MB}MB, redirecting to client merge`);
      return c.json({
        success: false,
        useClientMerge: true,
        error: `视频总大小(${(totalSegBytes / 1024 / 1024).toFixed(0)}MB)超过服务器限制，将使用本地合并`,
        segmentCount: validSegments.length,
        estimatedSizeMB: Math.round(totalSegBytes / 1024 / 1024),
      }, 200);
    }

    const outputKey = `merged/${episode.series_id}/ep${episode.episode_number}-merged.mp4`;
    let outputData: Uint8Array;

    if (validSegments.length >= 2) {
      try {
        // v6.0.96: 批量concat策略——分批处理避免Edge Function WORKER_LIMIT (OOM)
        const concatOpts = preferredResolution ? { preferredResolution } : undefined;
        let concatResult: ConcatResult;

        if (validSegments.length <= 6) {
          // ≤6段: 直接合并（内存峰值约120MB，在Edge Function限制内）
          concatResult = concatMP4(validSegments, concatOpts);
        } else {
          // >6段: 链式分批合并——每批最多处理4个段+前一批结果
          // 峰值内存 ≈ 4×最大分段 + 2×中间结果，避免一次性加载所有段
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
            } catch (batchErr: unknown) {
              if (isResolutionMismatchError(batchErr)) throw batchErr;
              console.warn(`[MergeVideos] Batch concat error at [${bStart}]: ${getErrorMessage(batchErr)} — continuing`);
            }
            // 释放已处理的输入段，辅助GC
            for (let ii = bStart; ii < bEnd; ii++) {
              (validSegments as (Uint8Array | null)[])[ii] = null;
            }
          }
          concatResult = { data: batchData, videoCount: batchVideoCount, duration: batchDuration, totalSamples: batchSamples };
        }

        outputData = concatResult.data;
        mergedSegments = concatResult.videoCount;
        console.log(`[MergeVideos] ✅ MP4 concat success: ${concatResult.videoCount}/${validSegments.length} segments -> ${(outputData.length / 1024 / 1024).toFixed(2)}MB, ${concatResult.duration.toFixed(1)}s`);
      } catch (concatErr: unknown) {
        // v6.0.69/v6.0.93: 分辨率不一致时，返回可操作的错误信息（告知用户需重新生成哪些分���）
        // v6.0.93: mismatchedScenes 现在反映"不符合系列目标分辨率"的场景，而非简单的少数派
        if (isResolutionMismatchError(concatErr)) {
          const mismatchedScenes: number[] = [];
          for (const segIdx of (concatErr.mismatchedSegmentIndices || [])) {
            const sceneNum = validSceneNumbers[segIdx];
            if (sceneNum != null) mismatchedScenes.push(sceneNum);
          }
          const targetRes = concatErr.majorityResolution; // now = preferredResolution when available
          const hintMsg = preferredResolution
            ? `部分分镜视频分辨率与系列设定(${seriesAspectRatio} → ${preferredResolution})不一致���需重新生成场景 [${mismatchedScenes.join(',')}]。`
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
        // 策略B: 其他拼接失败，上传��大的单段MP4（保证merged_video_url始终为真实MP4）
        console.warn(`[MergeVideos] ⚠️ MP4 concat failed: ${getErrorMessage(concatErr)} — falling back to largest single segment`);
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

    // 更新剧集的 merged_video_url 并标记为 completed（始终是.mp4 OSS链接）
    await supabase.from('series_episodes')
      .update({ merged_video_url: ossUrl, status: 'completed', updated_at: new Date().toISOString() }).eq('id', episodeId);

    return c.json({
      success: true,
      data: {
        mergedVideoUrl: ossUrl, totalVideos: videos.length, totalDuration,
        mergeMethod, mergedSegments, fileSize: mergedFileSize,
        videoUrls: videos.map((v: VideoSegment) => v.url),
        // v6.0.63: 返回失败/跳过信息，前端可精确提示缺失分镜
        failedScenes,
        totalStoryboards: allStoryboards.length,
        downloadedCount: validSegments.length,
      },
    });
  } catch (error: unknown) {
    console.error('[MergeVideos] Error:', getErrorMessage(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
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
  } catch (e: unknown) {
    return c.json({ success: false, error: getErrorMessage(e) }, 500);
  }
});


// v6.0.126: POST /episodes/:episodeId/request-upload-token — 生成OSS预签名PUT URL（浏览器直传合并视频）
// 前端拿到 uploadUrl 后直接 PUT blob 到 OSS，无需经由 Edge Function 中转（绕过 10MB 请求体限制）
app.post(`${PREFIX}/episodes/:episodeId/request-upload-token`, async (c) => {
  try {
    const episodeId = c.req.param('episodeId');
    const { userPhone, episodeNumber } = await c.req.json().catch(() => ({})) as Record<string, unknown>;

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
  } catch (error: unknown) {
    console.error('[UploadToken] Error:', getErrorMessage(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

// v6.0.126: POST /episodes/:episodeId/save-merged-video — 记录客户端直传后的OSS URL到DB
// 前端完成直传后调用此接口持久化 merged_video_url，确保下次可直接下载
app.post(`${PREFIX}/episodes/:episodeId/save-merged-video`, async (c) => {
  try {
    const episodeId = c.req.param('episodeId');
    const { ossUrl, sizeMB, userPhone } = await c.req.json().catch(() => ({})) as Record<string, unknown>;

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
  } catch (error: unknown) {
    console.error('[SaveMergedVideo] Error:', getErrorMessage(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
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
    const completed = storyboards?.filter((sb: StoryboardRow) => sb.video_url).length || 0;

    return c.json({
      success: true,
      data: {
        episodeId: episode.id, episodeNumber: episode.episode_number, title: episode.title,
        mergedVideoUrl: episode.merged_video_url || null, hasMergedVideo: !!episode.merged_video_url,
        storyboardStats: { total, completed, pending: total - completed },
      },
    });
  } catch (error: unknown) {
    console.error('[GET /episodes/:episodeId/merge-status] Error:', getErrorMessage(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
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
    const videos: VideoSegment[] = (storyboards || [])
      .filter((sb: StoryboardRow) => {
        const url = (sb.video_url || '').trim();
        return url.length > 0 && url.startsWith('http');
      })
      .map((sb: StoryboardRow) => ({
        sceneNumber: sb.scene_number, url: sb.video_url!.trim(), duration: sb.duration || 10,
        title: sb.description || `场景${sb.scene_number}`, thumbnail: sb.image_url || '',
      }));
    if (videos.length === 0) return c.json({ success: false, error: '没有可用的分镜视频' }, 400);

    // v6.0.20: repair也尝试真实MP4拼接
    let mergedVideoUrl = '';
    if (isOSSConfigured()) {
      try {
        console.log(`[RepairVideo] 🎬 Attempting real MP4 concat for ${videos.length} segments...`);
        const dlResults = await Promise.all(videos.map(async (v: VideoSegment) => {
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
      } catch (concatErr: unknown) {
        // v6.0.69: 分辨率不一致 or 其他拼接失败 → 上传最大片段MP4兜底
        if (isResolutionMismatchError(concatErr)) {
          console.warn(`[RepairVideo] ⚠️ Resolution mismatch — falling back to largest single segment`);
        } else {
          console.warn(`[RepairVideo] MP4 concat failed: ${getErrorMessage(concatErr)} — using largest segment`);
        }
        const dlResults2 = await Promise.all(videos.map(async (v: VideoSegment) => {
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
  } catch (error: unknown) {
    console.error('[RepairVideo] Error:', getErrorMessage(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
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
    const sbByEp = new Map<number, StoryboardRow[]>();
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
        const videos: VideoSegment[] = storyboards
          .filter((sb: StoryboardRow) => {
            const url = (sb.video_url || '').trim();
            return url.length > 0 && url.startsWith('http');
          })
          .map((sb: StoryboardRow) => ({
            sceneNumber: sb.scene_number, url: sb.video_url!.trim(), duration: sb.duration || 10,
            title: sb.description || `场景${sb.scene_number}`, thumbnail: sb.image_url || '',
          }));
        if (videos.length === 0) continue;

        // v6.0.106→107: OOM 预防——与 merge-videos 共享阈值常量
        // 批量路由中单集跳过不影响其他集，仅记录到 skipped 列表供前端按需本地合并
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
              const v = (videos as VideoSegment[])[si];
              let seg: Uint8Array | null = null;
              for (let att = 1; att <= 3; att++) {
                try {
                  const resp = await fetchWithTimeout(v.url, {}, 60000);
                  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                  seg = new Uint8Array(await resp.arrayBuffer());
                  console.log(`[MergeAll] ep${ep.episode_number} seg ${si + 1}/${videos.length} (scene ${v.sceneNumber}): ${(seg.length / 1024).toFixed(0)}KB${att > 1 ? ` (retry ${att})` : ''}`);
                  break;
                } catch (dlE: unknown) {
                  console.warn(`[MergeAll] ep${ep.episode_number} scene ${v.sceneNumber} attempt ${att}/3 failed: ${getErrorMessage(dlE)}`);
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
              let epConcat: ConcatResult;
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
                  catch (be: unknown) { if (isResolutionMismatchError(be)) throw be; }
                  for (let ii = bs; ii < Math.min(bs + BATCH - 1, valid.length); ii++) { (valid as (Uint8Array | null)[])[ii] = null; }
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
          } catch (concatErr: unknown) {
            // v6.0.69: 分辨率不一致时，记录失败并添加有用的错误信息
            if (isResolutionMismatchError(concatErr)) {
              const mismatchedNums = (concatErr.mismatchedSegmentIndices || []).map((si: number) => validSceneNums[si]).filter((n: number) => n != null);
              errors.push(`第${ep.episode_number}集: 视频分辨率不一致 — 场景[${mismatchedNums.join(',')}]需要重新生成`);
              failedCount++;
              console.error(`[MergeAll] ❌ ep${ep.episode_number}: Resolution mismatch — scenes [${mismatchedNums.join(',')}] differ from majority`);
            } else {
              console.error(`[MergeAll] ep${ep.episode_number}: MP4 concat failed: ${getErrorMessage(concatErr)}`);
            }
          }
        }

        // v6.0.39: 如果仍无URL（OSS���配置或全部下载失败），跳过该集
        if (!mergedVideoUrl) {
          console.warn(`[MergeAll] ep${ep.episode_number}: no merged URL produced, skipping`);
          continue;
        }

        await supabase.from('series_episodes')
          .update({ merged_video_url: mergedVideoUrl, updated_at: new Date().toISOString() }).eq('id', ep.id);
        mergedCount++;
      } catch (err: unknown) {
        failedCount++;
        errors.push(`第${ep.episode_number}集: ${getErrorMessage(err)}`);
      }
    }

    return c.json({ success: true, data: {
      mergedCount, failedCount, totalEpisodes: episodes.length, errors,
      skippedEpisodes, // v6.0.106: 被跳过的集数（分镜过多，建议本地合并）
      useClientMerge: skippedEpisodes.length > 0, // 前端据此对 skipped 集走本地合并
    } });
  } catch (error: unknown) {
    console.error('[MergeAll] Error:', getErrorMessage(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

// ==================== [J] AI从创意创建（简化版） ====================

app.post(`${PREFIX}/series/create-from-idea`, async (c) => {
  try {
    const body = await c.req.json();
    const { userInput, userPhone, targetAudience, scriptGenre } = body;
    const totalEpisodes = Math.min(Math.max(parseInt(body.totalEpisodes) || 10, 1), 50);
    if (!userInput || !userPhone) return c.json({ success: false, error: '缺少必要参数' }, 400);
    if (userInput.length > 5000) return c.json({ success: false, error: '创意描述不���超过5000字' }, 400);

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
      title: userInput.substring(0, 50) || '新作品',
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
  } catch (error: unknown) {
    console.error('[AI] create-from-idea error:', truncateErrorMsg(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

// ------------------------------------------------------------------
//  [H] 火山引擎 — 视频提交 / 状态查询 / Debug / 批量操作
// ------------------------------------------------------------------

// ==================== [K] 火山引擎 - 视频生成 ====================

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
    const _isAdminUser = userPhone ? await isAdminPhone(userPhone) : false;
    if (userPhone && !_isAdminUser) {
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

    // v5.6.0 + v6.0.8: 当 seriesId 存在时，自动从数据库查找作品/剧集/角色上下文 + 视觉风格指南，丰富视频 prompt
    // 解决"视频内容与作品主题无关"和"画面风格不一致"问题
    let ctxSeries: SeriesRow | null = null; // v6.0.16: 提升作用域供风格锁定
    let _deferredBridgeInfo: { endState: string; prevTail: string; prevLocation: string } | null = null; // v6.0.205
    if (seriesId) {
      try {
        // v6.0.11: 并行获取 series + episode + characters 上下文（原3个顺序查询 → Promise.all）
        const contextQueries: Promise<{ data: unknown }>[] = [
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

        // v6.0.196: 极简上下文——Seedance视频模型不是LLM，复杂指令互相冲突导致全部被忽略
        // 原则: 场景描述占prompt 70%+，上下文只补充最关键的1-2条简短信息
        const contextParts: string[] = [];
        const coherenceCheck = ctxSeries?.coherence_check;

        // 仅注入作品标题和主题（各限20字），帮助模型理解内容方向
        if (ctxSeries?.title) contextParts.push(`作品《${ctxSeries.title.substring(0, 20)}》`);
        if (ctxSeries?.theme) contextParts.push(`主题:${ctxSeries.theme.substring(0, 30)}`);

        // v6.0.205: 视觉桥接重构——用前一场景的具体视觉元素构建开头画面描述
        // Seedance是视频模型不是LLM，抽象指令("自然承接")无效，必须给出具体视觉描述
        if (seriesId && episodeNumber && storyboardNumber) {
          try {
            const sceneNum = parseInt(storyboardNumber);
            if (sceneNum > 1) {
              const { data: prevSbCtx } = await supabase
                .from('series_storyboards')
                .select('description, location, generation_metadata')
                .eq('series_id', seriesId)
                .eq('episode_number', episodeNumber)
                .eq('scene_number', sceneNum - 1)
                .maybeSingle();
              if (prevSbCtx?.description) {
                const prevMeta = parseMeta(prevSbCtx.generation_metadata);
                const endState = prevMeta?.endingVisualState ? String(prevMeta.endingVisualState).substring(0, 40) : '';
                // v6.0.205: 收集桥接信息，延迟到图片注入后构建——将上一场景结束画面的关键视觉元素注入到当前场景描述的开头
                // 这让视频模型的前1-2秒画面从上一场景的视觉延续过渡到本场景内容
                const prevDesc = prevSbCtx.description;
                const prevLocation = prevSbCtx.location || '';
                const prevTail = prevDesc.length > 30 ? prevDesc.substring(prevDesc.length - 30) : prevDesc;
                _deferredBridgeInfo = { endState, prevTail, prevLocation };
                console.log(`[Volcengine] 🌉 Bridge info deferred: endState=${endState ? 'YES' : 'NO'}, loc=${prevLocation || '-'}`);
                /* v6.0.205: bridge prefix block DISABLED — deferred to post-image-injection
                if (endState) {——从参考图的画面状态自然延续
                  const visualBridge = `视频开头画面与参考图保持一致的场景和角色，从${endState}的画面自然延续到`;
                  finalPrompt = `${visualBridge}${finalPrompt}`;
                  console.log(`[Volcengine] 🌉 Visual bridge (endState): ${visualBridge.substring(0, 60)}`);
                } else {
                  const prevDesc = prevSbCtx.description;
                  const prevLocation = prevSbCtx.location || '';
                  const prevTail = prevDesc.length > 40 ? prevDesc.substring(prevDesc.length - 40) : prevDesc;
                  const visualBridge = `视频开头画面与参考图保持一致的场景和角色，从${prevLocation ? prevLocation + '的' : ''}${prevTail}的画面自然延续到`;
                  finalPrompt = `${visualBridge}${finalPrompt}`;
                  console.log(`[Volcengine] 🌉 Visual bridge (desc tail): ${visualBridge.substring(0, 60)}`);
                }
                // 简短上下文（不再用抽象的"须自然承接"）
                // v6.0.205: prev scene context deferred to bridge
                */
              }
            }
            // v6.0.205: next scene preview DISABLED — saves one DB round-trip
            if (false) {
              const scn = parseInt(storyboardNumber);
              const { data: nextSbCtx } = await supabase
                .from('series_storyboards')
                .select('description, location')
                .eq('series_id', seriesId)
                .eq('episode_number', episodeNumber)
                .eq('scene_number', scn + 1)
                .maybeSingle();
              if (nextSbCtx?.description) {
                // v6.0.199: 用具体视觉元���替代抽象指令
                const nextHead = nextSbCtx.description.substring(0, 40);
                const nextLoc = nextSbCtx.location || '';
                contextParts.push(`本场景结尾画面须逐渐呈现${nextLoc ? nextLoc + '的' : ''}${nextHead}的视觉元素`);
              }
            }
          } catch { /* non-blocking */ }
        }

        // v6.0.197: 注入当前场景的转场指令（来自AI分镜师的transitionFromPrevious）
        if (storyboardId) {
          try {
            const { data: currentSbMeta } = await supabase
              .from('series_storyboards')
              .select('generation_metadata')
              .eq('id', storyboardId)
              .maybeSingle();
            const curMeta = parseMeta(currentSbMeta?.generation_metadata);
            if (curMeta?.transitionFromPrevious) {
              contextParts.push(`镜头衔接:${String(curMeta.transitionFromPrevious).substring(0, 60)}`);
              console.log(`[Volcengine] 🎬 Transition: ${String(curMeta.transitionFromPrevious).substring(0, 50)}`);
            }
          } catch { /* non-blocking */ }
        }

        if (contextParts.length > 0) {
          finalPrompt = `${finalPrompt}\n${contextParts.join('。')}`;
          console.log(`[Volcengine] 📖 Context: ${contextParts.length} parts, total prompt: ${finalPrompt.length} chars`);
        }

        // v6.0.196: 以下旧代码块已移除——角色外貌锁定、视觉风格指南、风格DNA、邻场景上下文、转场指令
        // 这些大段文字约束导致Seedance模型注意力被分散，完全忽略场景描述
        // 角色/风格由前端buildVideoPrompt精简注入，不再在后端重复膨胀
        const _skipLegacyContextEnrichment = true;
        if (!_skipLegacyContextEnrichment && false && coherenceCheck?.characterAppearances && coherenceCheck.characterAppearances.length > 0) {
          // 优先使用视觉风格指南中锁定的角色外貌卡
          // v6.0.16: 强化角色身份锁定——格式改为"名字：外貌"以提高AI遵守率
          // v6.0.194: 精简角色描述，每个角色限80字，避免context过长导致scene description被截断
          const charDesc = coherenceCheck.characterAppearances.map((ch: AIParsedCharacter) =>
            `[${ch.name}]${(ch.appearance || ch.role || '').substring(0, 80)}`
          ).join('；');
          contextParts.push(`【角色外貌锁定】${charDesc}。五官/发型/服装严格遵守，帧间不变`);
        } else if (!_skipLegacyContextEnrichment && ctxChars && ctxChars.length > 0) {
          const charDesc = ctxChars.map((ch: CharacterRow) => `[${ch.name}]${(ch.appearance || ch.personality || ch.role || '').substring(0, 80)}`).join('；');
          contextParts.push(`【角色外貌锁定】${charDesc}。五官/发型/服装严格遵守，帧间不变`);
        }

        // v6.0.8: 注入视觉风格指南中的色彩方案和构图规范（截取关键部分控制token）
        // v6.0.103: 全量注入视觉风格指南——解决不同分镜画面风格不统一问题
        // 根因: 此前仅提取~60字片段，不同分镜收到的��格信息碎片化导致画风漂移
        // 修复: 提取完整的色彩/构图/环境段落 + 角色外貌卡全文 + 风格DNA锚点
        if (coherenceCheck?.visualStyleGuide) {
          const guideText = coherenceCheck.visualStyleGuide;
          // 提取完整段落（增加到200字，覆盖关键视觉参数）
          const colorMatch = guideText.match(/【色彩方案】([^【]*)/);
          const compositionMatch = guideText.match(/【构图与光影规范】([^【]*)/);
          const envMatch = guideText.match(/【环境风格基准】([^【]*)/);
          const charCardMatch = guideText.match(/【角色外貌卡】([^【]*)/);
          const styleParts: string[] = [];
          // v6.0.194: 缩减视觉风格指南长度，避免prompt过长截断scene description
          if (charCardMatch) styleParts.push(`【角色外貌卡】${charCardMatch[1].trim().substring(0, 200)}`);
          if (colorMatch) styleParts.push(`【色彩】${colorMatch[1].trim().substring(0, 120)}`);
          if (compositionMatch) styleParts.push(`【构图光影】${compositionMatch[1].trim().substring(0, 120)}`);
          if (envMatch) styleParts.push(`【环境】${envMatch[1].trim().substring(0, 120)}`);
          if (styleParts.length > 0) {
            contextParts.push(`【全系列视觉风格指南——所有分镜必须100%遵守以下规范，严禁任何画风偏移】${styleParts.join('。')}`);
          }
        } else if (coherenceCheck?.baseStylePrompt) {
          contextParts.push(`画面风格：${coherenceCheck.baseStylePrompt.substring(0, 120)}`);
        }

        // v6.0.103: 风格一致性DNA锚点——从baseStylePrompt生成固定的���格指纹，确保每个分镜收到相同的风格基因
        const seriesStyleKey = ctxSeries?.style || style;
        const styleDesc = STYLE_PROMPTS[seriesStyleKey];
        if (styleDesc) {
          contextParts.push(`【风格DNA—��本系列全部视频的视觉基因，每帧画面必须体现】${styleDesc}`);
        }

        // v6.0.116: 首帧风格锚定提示——���用系列首个已生成场景的画面作为全局视觉基准
        // 即使当前场景使用前序场景作为i2v参考（保证时序连贯），prompt中仍提示原始风格画面
        // 防止"电话游戏效应"——每场景只参考上一场景导致��格逐渐漂移
        const styleAnchorUrl = coherenceCheck?.styleAnchorImageUrl;
        const styleAnchorScene = coherenceCheck?.styleAnchorScene || '';
        if (styleAnchorUrl && typeof styleAnchorUrl === 'string' && styleAnchorUrl.startsWith('http')) {
          contextParts.push(`【全系列视觉基准帧(${styleAnchorScene})——当前场景的色调/光影/质感/渲染手法必须与此基准帧完全一致，任何偏移视为画风错误】参考基准画面已作为首帧提供`);
          console.log(`[Volcengine] 🎨 Style anchor hint injected in prompt: ${styleAnchorScene}`);
        }

        // v6.0.205: DISABLED — this block pushed to contextParts AFTER assembly at line ~4064,
        // so all its DB queries (neighborScenes, crossEpPrevScene) produced results that were NEVER used.
        // Removing saves 2-3 DB round trips (~100ms) per video generation request.
        if (false && seriesId && episodeNumber && storyboardNumber) {
          try {
            const sceneNum = parseInt(storyboardNumber);
            if (sceneNum > 0) {
              // v6.0.20: 扩大查询范围到前2个+后1个场景，获取更多连续性上下文
              const neighborRange = [sceneNum - 2, sceneNum - 1, sceneNum + 1].filter(n => n > 0);
              const { data: neighborScenes } = await supabase
                .from('series_storyboards')
                .select('scene_number, description, emotional_tone, location, camera_angle, image_url, dialogue, time_of_day')
                .eq('series_id', seriesId)
                .eq('episode_number', episodeNumber)
                .in('scene_number', neighborRange)
                .order('scene_number', { ascending: true });

              // v6.0.63: 跨集衔接——当本集scene 1/2缺少前序场景时，查询上一集末尾场景补充上下文
              let crossEpPrevScene: NeighborScene | null = null;
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
                const prevPrevScene = neighborScenes?.find((s: NeighborScene) => s.scene_number === sceneNum - 2) || null;
                let prevScene: NeighborScene | null = neighborScenes?.find((s: NeighborScene) => s.scene_number === sceneNum - 1) || null;
                const nextScene = neighborScenes?.find((s: NeighborScene) => s.scene_number === sceneNum + 1) || null;
                const transitionParts: string[] = [];

                // v6.0.63: 跨集末尾场景作为"虚拟前一场景"（仅当本集无前序场景时）
                if (!prevScene && crossEpPrevScene && sceneNum === 1) {
                  const locInfo = crossEpPrevScene.location ? `地点：${crossEpPrevScene.location}` : '';
                  const dlgInfo = crossEpPrevScene.dialogue ? `对话：「${crossEpPrevScene.dialogue.substring(0, 80)}」` : '';
                  // v6.0.194: 精简跨集衔接上下文
                  transitionParts.push(`【上集末尾(第${episodeNumber - 1}集)】${crossEpPrevScene.description?.substring(0, 80) || ''}，${crossEpPrevScene.emotional_tone || ''}，${[locInfo, dlgInfo].filter(Boolean).join('，')}。本集开头须承接上集结尾`);
                  // 标记已注入跨集场景，避免下面重复注入
                  prevScene = crossEpPrevScene;
                }

                // v6.0.78: 更详细���上下文——增加generation_metadata中的transition/endingVisualState
                if (prevScene && prevScene !== crossEpPrevScene) {
                  const locationInfo = prevScene.location ? `地点：${prevScene.location}` : '';
                  const timeInfo = prevScene.time_of_day ? `时段：${prevScene.time_of_day}` : '';
                  const camInfo = prevScene.camera_angle ? `镜头：${prevScene.camera_angle}` : '';
                  const dialogueInfo = prevScene.dialogue ? `对话：「${prevScene.dialogue.substring(0, 80)}」` : '';
                  // v6.0.194: 精简上下文避免prompt过长
                  transitionParts.push(`【上一场景${sceneNum - 1}】${prevScene.description?.substring(0, 80) || ''}。${prevScene.emotional_tone || ''}，${[locationInfo, timeInfo, camInfo].filter(Boolean).join('，')}。本场景开头须与上一场景结尾衔接`);
                }
                // v6.0.20: 前前场景用于建立更长的视觉记忆链
                if (prevPrevScene && prevScene) {
                  transitionParts.push(`【前2场景摘要】场���${sceneNum - 2}→场景${sceneNum - 1}：${(prevPrevScene.description || '').substring(0, 40)}→${(prevScene.description || '').substring(0, 40)}。保持视觉风格和角色外观的整体一致性`);
                }
                if (nextScene) {
                  transitionParts.push(`【下一场景(场景${sceneNum + 1})预告】${nextScene.description?.substring(0, 50) || ''}。本场景结尾需为下一场景做视觉铺垫，避免画面突变`);
                }
                // v6.0.69: 对话去重约束——防止同集内对话重复
                if (prevScene?.dialogue) {
                  transitionParts.push(`【对话去重】上一场景对话为「${prevScene.dialogue.substring(0, 60)}」——本场景必须推进全新对话内容，严禁重复或近似上一场景的台词`);
                }
                if (transitionParts.length > 0) {
                  contextParts.push(transitionParts.join('。'));
                  console.log(`[Volcengine] 🔗 Injected ${transitionParts.length} neighbor scene(s) context for continuity`);
                }
              }
            }
          } catch (neighborErr: unknown) {
            console.warn(`[Volcengine] Neighbor scenes lookup failed (non-blocking):`, getErrorMessage(neighborErr));
          }
        }

        // v6.0.197: transitionFromPrevious已移至上方lean context块中注入，此处不再重复
        // if (storyboardId) { ... } — 已被v6.0.197替代

        // v6.0.196: 旧的contextParts组装已移至上方（精简版），此处不再重复组装
        // if (contextParts.length > 0) { ... } — 已被v6.0.196替代
      } catch (ctxErr: unknown) {
        console.warn(`[Volcengine] Context lookup failed (non-blocking):`, getErrorMessage(ctxErr));
      }
    }

    // v6.0.21: 前一场景图片注入——当无用户图片时，自动用前一场景图片作为i2v起始参考
    // 这使 t2v 自动升级为 i2v，大幅提升场景间视觉连贯性
    // v6.0.116: 增加风格锚定图回退——当前序场景和跨集场景均无图片时，使用系列首个已生成场景的图片作��i2v风格锚点
    let prevSceneImageInjected = false;
    let styleAnchorInjected = false;
    const userImageCount = finalImages.length; // v6.0.205: snapshot before prev-scene injection
    // v6.0.205: 放宽注入条件——即使用户上传了素材图(finalImages>0)，仍追加前序场景尾帧
    // 根因: 用户素材仅提供风格参考，而前序场景尾帧是保证时序连贯性的核心
    // Seedance支持多图参考(最多2张)，用户素材+尾帧可以并存
    if (seriesId && episodeNumber && storyboardNumber && finalImages.length <= 1) {
      try {
        const sceneNum = parseInt(storyboardNumber);
        if (sceneNum > 1) {
          // v6.0.200: 三级回退策略获取前一场景尾帧图片：
          // 1. DB中已保存的 last_frame_url（最可靠——OSS截帧或客户端上传的永久文件）
          // 2. 实时 OSS 视频截帧（需要 IMM 服务）
          // 3. 回退到 thumbnail（首帧——有总比没有好）
          const { data: prevVideoTasks } = await supabase
            .from('video_tasks')
            .select('task_id, thumbnail, video_url, duration, generation_metadata')
            .eq('status', 'completed')
            .filter('generation_metadata->>seriesId', 'eq', seriesId)
            .filter('generation_metadata->>episodeNumber', 'eq', String(episodeNumber))
            .filter('generation_metadata->>type', 'eq', 'storyboard_video')
            .order('created_at', { ascending: false })
            .limit(10);

          // 找到前一场景的最新已完成任务
          let prevTask: { task_id?: string; thumbnail?: string; video_url?: string; duration?: string; generation_metadata?: Record<string, unknown> } | null = null;
          if (prevVideoTasks) {
            for (const t of prevVideoTasks) {
              const tMeta = parseMeta(t.generation_metadata);
              const tSn = Number(tMeta?.storyboardNumber || tMeta?.sceneNumber);
              if (tSn === sceneNum - 1 && t.video_url) { prevTask = t; break; }
            }
          }

          // v6.0.201: 全面诊断日志——精确定位首尾帧注入失败的根因
          console.log(`[Volcengine] 🔍 Prev scene lookup: sceneNum=${sceneNum}, prevTasks found=${prevVideoTasks?.length || 0}, prevTask=${prevTask ? `task_id=${prevTask.task_id}, thumbnail=${prevTask.thumbnail ? 'YES(' + prevTask.thumbnail.substring(0, 40) + ')' : 'NONE'}, video_url=${prevTask.video_url ? 'YES(OSS=' + prevTask.video_url.includes('.aliyuncs.com') + ')' : 'NONE'}, lastFrameUrl=${(parseMeta(prevTask.generation_metadata) as Record<string,unknown>)?.lastFrameUrl ? 'YES' : 'NONE'}` : 'NOT_FOUND'}`);

          let refInjected = false;
          // 策略1: DB中已保存的尾帧（存储在generation_metadata.lastFrameUrl中）
          const prevMeta = parseMeta(prevTask?.generation_metadata);
          let savedLastFrameUrl = prevMeta?.lastFrameUrl as string | undefined;
          if (savedLastFrameUrl && typeof savedLastFrameUrl === 'string' && savedLastFrameUrl.startsWith('http')) {
            // v6.0.212: 检测旧版本污染——如果savedLastFrameUrl等于thumbnail（首帧/封面），
            // 说明是v6.0.210之前的代码错误地把首帧保存为尾帧，必须跳过并清除
            if (prevTask?.thumbnail && savedLastFrameUrl === prevTask.thumbnail) {
              console.warn(`[Volcengine] ⚠️ Strategy1 SKIP: savedLastFrameUrl === thumbnail (legacy pollution from pre-v6.0.210), clearing bad data`);
              // 清除DB中错误的lastFrameUrl
              if (prevTask?.task_id) {
                const cleanMeta = { ...(prevMeta || {}) };
                delete (cleanMeta as Record<string, unknown>).lastFrameUrl;
                await supabase.from('video_tasks').update({ generation_metadata: cleanMeta }).eq('task_id', prevTask.task_id);
                console.log(`[Volcengine] 🧹 Cleared polluted lastFrameUrl for task ${prevTask.task_id}`);
              }
              savedLastFrameUrl = undefined; // 让Strategy2接手
            }
            // v6.0.212: 额外检查——cover_url也可能被错误保存为lastFrameUrl
            // cover_url是Volcengine返回的封面图（通常是首帧），不是尾帧
            if (savedLastFrameUrl && prevMeta?.coverUrl && savedLastFrameUrl === prevMeta.coverUrl) {
              console.warn(`[Volcengine] ⚠️ Strategy1 SKIP: savedLastFrameUrl === coverUrl (first frame, not last frame)`);
              savedLastFrameUrl = undefined;
            }
            // v6.0.211: 检测是否是临时URL（非OSS），如果是则尝试转存到OSS
            if (savedLastFrameUrl) {
              const isOSSUrl = savedLastFrameUrl.includes('.aliyuncs.com');
              if (!isOSSUrl && isOSSConfigured()) {
                console.log(`[Volcengine] 📦 Strategy1: savedLastFrameUrl is temp URL, attempting OSS persist...`);
                try {
                  const lfResp = await fetchWithTimeout(savedLastFrameUrl, {}, 8000);
                  if (lfResp.ok) {
                    const lfBuf = await lfResp.arrayBuffer();
                    if (lfBuf.byteLength > 500 && prevTask?.task_id) {
                      const ossLfUrl = await uploadToOSS(`last-frames/${prevTask.task_id}.jpg`, lfBuf, 'image/jpeg');
                      if (ossLfUrl) {
                        const updMeta = { ...(prevMeta || {}), lastFrameUrl: ossLfUrl };
                        await supabase.from('video_tasks').update({ generation_metadata: updMeta }).eq('task_id', prevTask.task_id);
                        savedLastFrameUrl = ossLfUrl;
                        console.log(`[Volcengine] ✅ Strategy1: temp URL persisted to OSS: ${ossLfUrl.substring(0, 60)}...`);
                      }
                    }
                  } else {
                    console.warn(`[Volcengine] ⚠️ Strategy1: temp URL expired/unreachable (HTTP ${lfResp.status}), falling through to Strategy2`);
                    savedLastFrameUrl = undefined;
                  }
                } catch (persistErr: unknown) {
                  console.warn(`[Volcengine] ⚠️ Strategy1: temp URL persist failed: ${getErrorMessage(persistErr)}`);
                  savedLastFrameUrl = undefined;
                }
              }
            }
            // v6.0.201: 对参考图放宽尺寸验证——100px即可（原300px过严）
            if (savedLastFrameUrl && await validateImageDimensions(savedLastFrameUrl, 100)) {
              finalImages.push(savedLastFrameUrl);
              prevSceneImageInjected = true;
              refInjected = true;
              console.log(`[Volcengine] 🎯 Strategy1 OK: prev scene ${sceneNum - 1} SAVED LAST FRAME as i2v ref`);
            } else if (savedLastFrameUrl) {
              console.warn(`[Volcengine] ⚠️ Strategy1 FAIL: savedLastFrameUrl dimensions too small or unreachable`);
            }
          }
          // 策略2: 实时 OSS 视频截帧
          if (!refInjected && prevTask?.video_url?.includes('.aliyuncs.com') && isOSSConfigured()) {
            try {
              const prevDurSec = parseInt(String(prevTask.duration)) || 10;
              const snapshotTimeMs = Math.max(0, (prevDurSec * 1000) - 500);
              const urlObj = new URL(prevTask.video_url);
              const objectKey = urlObj.pathname.startsWith('/') ? urlObj.pathname.slice(1) : urlObj.pathname;
              const lastFrameUrl = await generateVideoSnapshotUrl(objectKey, snapshotTimeMs, 3600);
              const checkResp = await fetchWithTimeout(lastFrameUrl, { method: 'HEAD' }, 5000);
              if (checkResp.ok && await validateImageDimensions(lastFrameUrl, 100)) {
                finalImages.push(lastFrameUrl);
                prevSceneImageInjected = true;
                refInjected = true;
                console.log(`[Volcengine] 🎯 Strategy2 OK: prev scene ${sceneNum - 1} OSS SNAPSHOT (t=${snapshotTimeMs}ms) as i2v ref`);
                // 同时保存到DB以便下次直接用
                (async () => {
                  try {
                    const snapResp = await fetchWithTimeout(lastFrameUrl, {}, 10000);
                    if (snapResp.ok) {
                      const buf = await snapResp.arrayBuffer();
                      if (buf.byteLength > 1000 && prevTask?.task_id) {
                        const lfUrl = await uploadToOSS(`last-frames/${prevTask.task_id}.jpg`, buf, 'image/jpeg');
                        if (lfUrl) {
                          const updMeta = { ...(parseMeta(prevTask.generation_metadata) || {}), lastFrameUrl: lfUrl };
                          await supabase.from('video_tasks').update({ generation_metadata: updMeta }).eq('task_id', prevTask.task_id);
                        }
                      }
                    }
                  } catch { /* non-blocking */ }
                })().catch(() => {});
              } else {
                console.warn(`[Volcengine] ⚠️ Strategy2 FAIL: OSS snapshot HTTP ${checkResp?.status || 'unknown'} (IMM/video processing may not be enabled on bucket)`);
              }
            } catch (snapErr: unknown) {
              console.warn(`[Volcengine] ⚠️ Strategy2 FAIL: ${getErrorMessage(snapErr)}`);
            }
          } else if (!refInjected && prevTask?.video_url) {
            console.warn(`[Volcengine] ⚠️ Strategy2 SKIP: video not on OSS (url=${prevTask.video_url.substring(0, 50)})`);
          }
          // v6.0.210: 已移除策略3（thumbnail首帧回退）和策略4（storyboard.image_url回退）
          // 根因: thumbnail和image_url都是视频的首帧/封面图，注入后会导致所有后续场景的
          // 视频画面都和前一场景的首帧一样——这正是"全都是第一帧"问题的根源
          // 正确做法: 仅使用策略1(DB lastFrameUrl，来自Volcengine API return_last_frame)
          // 和策略2(OSS视频截帧)获取真正的尾帧
          if (!refInjected) {
            console.warn(`[Volcengine] ⚠️ Strategy1+2 both failed for prev scene ${sceneNum - 1} — falling back to pure t2v mode (no thumbnail/first-frame injection to avoid first-frame duplication)`);
          }
          if (!prevSceneImageInjected) {
            console.warn(`[Volcengine] ❌ Strategies 1-2 failed for prev scene ${sceneNum - 1} — pure t2v mode (no visual continuity)`);
          }
        } else if (sceneNum === 1 && episodeNumber > 1) {
          // v6.0.200: 跨集衔接——提取上一集最后场景视频的尾帧
          const { data: prevEpTasks } = await supabase
            .from('video_tasks')
            .select('task_id, thumbnail, video_url, duration, generation_metadata')
            .eq('status', 'completed')
            .filter('generation_metadata->>seriesId', 'eq', seriesId)
            .filter('generation_metadata->>episodeNumber', 'eq', String(episodeNumber - 1))
            .filter('generation_metadata->>type', 'eq', 'storyboard_video')
            .not('video_url', 'is', null)
            .order('created_at', { ascending: false })
            .limit(10);

          // 找到上一集最大场景号的最新任务
          let prevEpLastTask: { task_id?: string; thumbnail?: string; video_url?: string; duration?: string; generation_metadata?: Record<string, unknown> } | null = null;
          let maxScn = 0;
          if (prevEpTasks) {
            const bestByScene = new Map<number, (typeof prevEpTasks)[0]>();
            for (const t of prevEpTasks) {
              const tMeta = parseMeta(t.generation_metadata);
              const tSn = Number(tMeta?.storyboardNumber || tMeta?.sceneNumber);
              if (tSn && !bestByScene.has(tSn)) {
                bestByScene.set(tSn, t);
                if (tSn > maxScn) maxScn = tSn;
              }
            }
            if (maxScn > 0) prevEpLastTask = bestByScene.get(maxScn) || null;
          }

          let crossEpLastFrameOk = false;
          // 策略0: DB中已保存的尾帧（在generation_metadata.lastFrameUrl中）
          const prevEpMeta = parseMeta(prevEpLastTask?.generation_metadata);
          const prevEpLastFrameUrl = prevEpMeta?.lastFrameUrl as string | undefined;
          if (prevEpLastFrameUrl?.startsWith('http') && await validateImageDimensions(prevEpLastFrameUrl, 100)) {
            finalImages.push(prevEpLastFrameUrl);
            prevSceneImageInjected = true;
            crossEpLastFrameOk = true;
            console.log(`[Volcengine] 🎯 Cross-ep: ep${episodeNumber - 1} scene${maxScn} SAVED LAST FRAME as i2v ref`);
          }
          // 策略1: OSS视频截帧——提取上一集最后场景的尾帧
          if (!crossEpLastFrameOk && prevEpLastTask?.video_url?.includes('.aliyuncs.com') && isOSSConfigured()) {
            try {
              const prevDurSec = parseInt(String(prevEpLastTask.duration)) || 10;
              const snapshotTimeMs = Math.max(0, (prevDurSec * 1000) - 500);
              const urlObj = new URL(prevEpLastTask.video_url);
              const objectKey = urlObj.pathname.startsWith('/') ? urlObj.pathname.slice(1) : urlObj.pathname;
              const lastFrameUrl = await generateVideoSnapshotUrl(objectKey, snapshotTimeMs, 3600);
              const checkResp = await fetchWithTimeout(lastFrameUrl, { method: 'HEAD' }, 5000);
              if (checkResp.ok && await validateImageDimensions(lastFrameUrl, 100)) {
                finalImages.push(lastFrameUrl);
                prevSceneImageInjected = true;
                crossEpLastFrameOk = true;
                console.log(`[Volcengine] 🎯 Cross-ep: ep${episodeNumber - 1} scene${maxScn} LAST FRAME (t=${snapshotTimeMs}ms) as i2v ref`);
              }
            } catch (snapErr: unknown) {
              console.warn(`[Volcengine] ⚠️ Cross-ep snapshot failed: ${getErrorMessage(snapErr)}`);
            }
          }
          // v6.0.210: 已移除跨集thumbnail首帧回退——同理，thumbnail是首帧不是尾帧
          if (!crossEpLastFrameOk) {
            console.warn(`[Volcengine] ⚠️ Cross-ep: ep${episodeNumber - 1} no valid last frame found — pure t2v mode`);
          }
        }

        // v6.0.210: 风格锚定图——仅用于scene1（第一个场景），不用于后续场景
        // 后续场景(scene2+)应该使用前序场景的尾帧，而不是风格锚定图
        // 风格锚定图只在第一个场景没有参考图时才注入
        if (finalImages.length === 0 && (!storyboardNumber || parseInt(storyboardNumber) === 1)) {
          let anchorImageUrl = '';
          const { data: firstCompletedTask } = await supabase
            .from('video_tasks')
            .select('thumbnail')
            .eq('status', 'completed')
            .filter('generation_metadata->>seriesId', 'eq', seriesId)
            .not('thumbnail', 'is', null)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
          anchorImageUrl = firstCompletedTask?.thumbnail || '';
          if (!anchorImageUrl || !anchorImageUrl.startsWith('http')) {
            anchorImageUrl = ctxSeries?.coherence_check?.styleAnchorImageUrl || '';
          }
          if (anchorImageUrl && anchorImageUrl.startsWith('http') && await validateImageDimensions(anchorImageUrl, 100)) {
            finalImages.push(anchorImageUrl);
            styleAnchorInjected = true;
            console.log(`[Volcengine] 🎨 Style anchor image injected as i2v reference: ${anchorImageUrl.substring(0, 80)}...`);
          }
        }
      } catch (refErr: unknown) {
        console.warn(`[Volcengine] Prev scene / style anchor image lookup failed (non-blocking):`, getErrorMessage(refErr));
      }
    }

    // v6.0.205: 延迟视觉桥接——在图片注入完成后，根据是否有参考图决定桥接措辞
    // 作为后缀追加（而非前缀），确保场景描述保持prompt最前面的位置
    if (_deferredBridgeInfo) {
      const { endState, prevTail, prevLocation } = _deferredBridgeInfo;
      if (prevSceneImageInjected) {
        // 有参考图：引导模型从参考图画面延续
        const bridgeKey = endState || `${prevLocation ? prevLocation + '' : ''}${prevTail}`;
        finalPrompt = `${finalPrompt}。开头画面承接参考图中${bridgeKey}的状态自然过渡`;
        console.log(`[Volcengine] 🌉 Visual bridge (with ref img): ...${bridgeKey.substring(0, 30)}`);
      } else {
        // 无参考图：纯文字衔接，用具体视觉元素而非抽象指令
        const bridgeKey = endState || `${prevLocation ? prevLocation + '' : ''}${prevTail}`;
        finalPrompt = `${finalPrompt}。视频开头画面从${bridgeKey}的状态开始`;
        console.log(`[Volcengine] 🌉 Visual bridge (text-only): ...${bridgeKey.substring(0, 30)}`);
      }
    }

    console.log(`[Volcengine] 🎬 New request: style=${style}, dur=${duration}, audio=${enableAudio}, imgs=${finalImages.length}${prevSceneImageInjected ? '(+1 prev scene ref ✅)' : styleAnchorInjected ? '(+1 style anchor)' : '(⚠️ no img ref — pure t2v)'}${userImageCount > 0 ? ` [user imgs: ${userImageCount}]` : ''}${forceRegenerate ? ' [REGEN]' : ''}, series=${seriesId || '-'}, ep=${episodeNumber || '-'}, sb=${storyboardNumber || '-'}`);

    // 确保用户存在
    if (userPhone) {
      const { data: eu } = await supabase.from('users').select('phone').eq('phone', userPhone).maybeSingle();
      if (!eu) await supabase.from('users').insert({ phone: userPhone, nickname: `用户${userPhone.slice(-4)}` }).select().maybeSingle();
    }

    // 简化模型选择（v6.0.21: 新增单图i2v路径——前场景注入后自动升级）
    let selectedModel = model || 'doubao-seedance-1-5-pro-251215';
    if (!model) {
      // v6.0.21: 系列分镜强制统一使用 seedance-1-5-pro 模型
      // 确保所有分镜输出一致的分辨率/编码，避免MP4拼接因分辨率不匹配而失败
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
    // 如果请求的分辨率超出模型能力，降级到模型最高支持
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
      // 将旧的已完成任务标记为cancelled���防止后续被复用
      const { data: oldTasks } = await supabase.from('video_tasks')
        .select('task_id')
        .eq('user_phone', userPhone || 'system')
        .in('status', ['completed', 'failed'])
        .filter('generation_metadata->>storyboardId', 'eq', storyboardId);
      if (oldTasks && oldTasks.length > 0) {
        const oldIds = oldTasks.map((t: VideoTaskRow) => t.task_id);
        await supabase.from('video_tasks').update({ status: 'cancelled' }).in('task_id', oldIds);
        console.log(`[Volcengine] 🔄 forceRegenerate: cancelled ${oldIds.length} old tasks for storyboard=${storyboardId}`);
      }
      // 同时清除 storyboard 表中的旧 video_url
      await supabase.from('series_storyboards').update({ video_url: null, status: 'draft' }).eq('id', storyboardId);
      console.log(`[Volcengine] 🔄 forceRegenerate: cleared video_url for storyboard=${storyboardId}`);
    }
    if (storyboardId && !forceRegenerate) {
      // Step 1: 检查是否有进行中的活���任务
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
    if (quotaCheckInfo && userPhone && !_isAdminUser) {
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
      } catch (quotaErr: unknown) {
        console.warn('[Quota] Deduct error (non-blocking):', getErrorMessage(quotaErr));
      }
    }

    // 上传Base64图片
    const publicUrls: string[] = [];
    if (finalImages.length > 0) {
      const { data: buckets } = await supabase.storage.listBuckets();
      if (!buckets?.some((b: StorageBucket) => b.name === IMAGE_BUCKET)) {
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
          } catch (ue: unknown) { console.error(`[Volcengine] Image upload ${i} failed:`, getErrorMessage(ue)); }
        } else if (typeof img === 'string' && img.startsWith('http')) {
          publicUrls.push(img);
        }
      }
    }

    // 构建火山引擎请求
    // v6.0.16: 强制使用DB中的系列风格，防止同一系列混用不同风格
    const effectiveStyle = (seriesId && ctxSeries?.style) ? ctxSeries.style : style;
    const stylePrompt = STYLE_PROMPTS[effectiveStyle] || STYLE_PROMPTS.comic;
    const contentArray: VolcContentItem[] = [];
    // v6.0.197: Validate image URLs — check format AND dimensions (≥300px) before adding
    for (const url of publicUrls) {
      if (typeof url === 'string' && url.startsWith('http') && url.length < 2048) {
        // v6.0.205: 100px threshold (was 300px) — prev-scene last frames may be smaller
        if (await validateImageDimensions(url, 100)) {
          contentArray.push({ type: "image_url", image_url: { url } });
        } else {
          console.warn(`[Volcengine] Skipping image too small (<100px): ${url.substring(0, 100)}`);
        }
      } else {
        console.warn(`[Volcengine] Skipping invalid image URL: ${String(url).substring(0, 100)}`);
      }
    }
    // v6.0.196: 极简prompt组装——Seedance有效注意力仅~200字，场景描述必须占绝对主导
    // 只追加简短的画风关键词和基本画质要求，不再注入大段约束文本
    const briefStyle = `${stylePrompt.substring(0, 40)}，画面精致，中文场景`;

    // v6.0.196: proShotDirective/seedanceSuffix/productionTypeDirective/framingDirective 已移除
    // 原因: 这些大段约束文本占据prompt 80%+，导致Seedance完全忽略场景描述

    // v6.0.69: Seedance 2.0 专业视频约束—��运镜/画质/防崩/角色锁定/作品类型定制
    // v6.0.196: seedanceSuffix/productionTypeDirective 已移除（prompt膨胀主因）

    // v6.0.92: 画面比例专属构图强制指令——修复竖屏/方屏下角色主体不在主画面的问题
    // 根本原因: Seedance模型默认按16:9横屏构图习惯生成，输出竖屏(720×1280)时角色位置偏移至边缘
    // 修复: 在prompt最���优先级位置注入针对比例的构图规范，强制模型按对应尺寸居中对焦主体
    // v6.0.196: 精简构图指令（原300字→6字）
    const _BRIEF_FRAMING: Record<string, string> = {
      '9:16': '竖屏构图，主体居中', '1:1': '方形构图，主体居中',
      '3:4': '竖向构图，主体居中', '4:3': '横向构图，三分法', '16:9': '横屏构图，三分法',
    };
    const briefFraming = _BRIEF_FRAMING[effectiveAspectRatio] || '主体居中';
    const briefQuality = '稳定运镜，高清细节，五官清晰，动作自然';
    const _DEPRECATED_ASPECT_FRAMING_DIRECTIVES: Record<string, string> = {
      '9:16': '【竖屏9:16构图——绝对强制执行】本视频尺寸为720×1280竖向画幅，主体角色必须严格沿画面垂直中轴线居中放置；人物头顶位于画面顶部20%-35%��，头部到腰部完整可见于画面中央区域；近景/中景构图下人脸高度不低于画面高度的20%；严禁主体向左/右偏移至画面边缘；严禁人物头部被画面上边缘裁切；严禁身体主要部位超出画面左右边界；所有角色面部表情和肢体动作须在画面可见区域内完整呈现',
      '1:1':  '【方形1:1构图——绝对强制执行】本视频尺寸为正方形画幅，主体角色垂直水平双向居中；人物上半身(头部至腰部)完整可见于画面中央；严禁主体偏移至任何方向的边缘导致被裁切',
      '3:4':  '【3:4竖向构图——绝对强制执行】本视频竖向画幅，主体角色沿垂直中轴居中；头顶至腰部完整可见在画面中央；严禁主体被左右边缘裁切或上下超出画面',
      '4:3':  '【4:3横向构图——强制执行】横向宽画幅，主体角色按三分法定位于画面内；人物完整可见，禁止主体超出画面上下边界',
      '16:9': '【16:9横屏构图——强制执行】宽屏横向画幅，人物按三分法构图完整可见于画面内；禁止主体被画面顶部或底部裁切',
    };
    const _framingDirective = _DEPRECATED_ASPECT_FRAMING_DIRECTIVES[effectiveAspectRatio] || '';
    // v6.0.196: framingDirective no longer used in prompt — using briefFraming instead

    // v6.0.182: comprehensive content.text sanitization — fix Volcengine "Invalid content.text" rejection
    // Root causes: (1) invalid Unicode/control chars from DB-stored AI-generated text
    //              (2) text exceeding API max length after context enrichment (~8000+ chars)
    // Fix: sanitize chars + truncate to API limit (4000 chars)
    // v6.0.195: 场景描述（finalPrompt开头）放在最前面，风格约束放后面
    // Seedance模型注意力机制优先处理prompt开头内容，场景描述必须在最前面才能被正确执行
    // v6.0.196: 极简prompt——场景描述占80%+，只追加关键词级约束
    const rawContentText = `${finalPrompt}。${briefStyle}。${briefFraming}。${briefQuality}`;
    console.log(`[Volcengine] 📝 v6.0.197 prompt (${rawContentText.length} chars): ${rawContentText.substring(0, 300)}`);
    // Step 1: Remove invalid characters — control chars, null bytes, U+FFFD, lone surrogates, zero-width, private-use
    let sanitizedText = rawContentText
      .replace(/\0/g, '')
      .replace(/\uFFFD+/g, '')
      .replace(/\uFEFF/g, '')
      .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .replace(/[\uD800-\uDFFF]/g, '')
      .replace(/[\u200B-\u200F\u2028-\u202F\u2060\u2066-\u2069]/g, '')
      .replace(/[\uE000-\uF8FF]/g, '')
      .replace(/[\uFFF0-\uFFFF]/g, '')
      .replace(/\\u[0-9a-fA-F]{4}/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    // Step 1a: Strip ALL non-BMP characters (emoji U+1Fxxx, supplementary CJK, musical symbols, etc.)
    // Root cause of persistent "Invalid content.text": Volcengine Seedance rejects non-BMP Unicode
    try { sanitizedText = sanitizedText.replace(/[\u{10000}-\u{10FFFF}]/gu, ''); } catch { /* old engine fallback: surrogate pairs already stripped above */ }
    // Step 1b: Normalize general-punctuation block (U+2000-U+206F) to ASCII equivalents
    sanitizedText = sanitizedText
      .replace(/[\u2000-\u200A]/g, ' ')       // Various Unicode spaces → ASCII space
      .replace(/[\u2010-\u2015]/g, '-')       // Various dashes → ASCII dash
      .replace(/[\u2018\u2019]/g, "'")        // Smart single quotes → ASCII
      .replace(/[\u201C\u201D]/g, '"')        // Smart double quotes → ASCII
      .replace(/\u2026/g, '...')              // Ellipsis → three dots
      .replace(/[\u2000-\u206F]/g, '')        // Strip remaining general punctuation
      .replace(/\s{3,}/g, ' ')               // Collapse excessive whitespace
      .trim();
    // Step 1c: Ensure non-empty after sanitization
    if (!sanitizedText || sanitizedText.length < 5) {
      sanitizedText = finalPrompt.substring(0, 2000) || '生成一段精彩的视频画面';
      console.warn(`[Volcengine] content.text empty after sanitization, using fallback`);
    }
    // v6.0.196: 简化截断——精简prompt后通常<500字，不再需要复杂截断逻辑
    const MAX_CONTENT_TEXT = 4000;
    if (sanitizedText.length > MAX_CONTENT_TEXT) {
      console.warn(`[Volcengine] content.text too long (${sanitizedText.length} chars), truncating to ${MAX_CONTENT_TEXT}`);
      sanitizedText = sanitizedText.substring(0, MAX_CONTENT_TEXT);
    }
    console.log(`[Volcengine] content.text OK: ${sanitizedText.length} chars (raw: ${rawContentText.length}), preview: ${sanitizedText.substring(0, 150).replace(/\n/g, '\\n')}...`);
    contentArray.push({ type: "text", text: sanitizedText });

    // v5.6.2: 将视频时长、分辨率作为 API 参数传递（而非仅写在 text prompt 中）
    // 修复：之前 duration/resolution 只存在于 text 提示词，模型不一定遵守
    const reqBody: Record<string, unknown> = {
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

    console.log(`[Volcengine] Calling API: model=${selectedModel}, duration=${adjustedDuration}s, res=${effectiveRes}(${vWidth}x${vHeight}), content_items=${contentArray.length}, audio=${enableAudio}, codec=${codec}, endpoint=${VOLCENGINE_BASE_URL}`);
    let apiResp: Response | null = null;
    let lastErr: Error | null = null;
    // v6.0.176: 超时和重试策略优化 — Edge Function 执行上限 ~150s
    // 单次 fetch 超时 55s（TCP connect 通常 <30s），最多 2 次尝试，总耗时 <120s
    const VOLC_FETCH_TIMEOUT = 55000;
    const VOLC_MAX_ATTEMPTS = 2;
    for (let attempt = 0; attempt < VOLC_MAX_ATTEMPTS; attempt++) {
      try {
        apiResp = await fetchWithTimeout(VOLCENGINE_BASE_URL, {
          method: 'POST', headers: { 'Authorization': `Bearer ${VOLCENGINE_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(reqBody),
        }, VOLC_FETCH_TIMEOUT);
        console.log(`[Volcengine] API response: status=${apiResp.status} (attempt ${attempt + 1})`);
        break;
      } catch (err: unknown) {
        lastErr = err;
        const errMsg = getErrorMessage(err);
        const isConnErr = errMsg.includes('Connection timed out') || errMsg.includes('tcp connect') || errMsg.includes('connect error');
        console.error(`[Volcengine] API attempt ${attempt + 1} failed (conn=${isConnErr}):`, errMsg);
        // 连接级错误不重试（目标不可达，重试无意义）；其他错误短退避后重试
        if (isConnErr) break;
        if (attempt < VOLC_MAX_ATTEMPTS - 1) await new Promise(r => setTimeout(r, 3000));
      }
    }
    if (!apiResp) {
      const finalErrMsg = getErrorMessage(lastErr);
      const isConnTimeout = finalErrMsg.includes('Connection timed out') || finalErrMsg.includes('tcp connect');
      console.error(`[Volcengine] All ${VOLC_MAX_ATTEMPTS} API attempts failed for task ${taskId} (endpoint=${VOLCENGINE_BASE_URL}, connTimeout=${isConnTimeout}): ${finalErrMsg}`);
      await supabase.from('video_tasks').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('task_id', taskId);
      return c.json({ error: isConnTimeout ? `无法连接火山引擎服务器(${VOLCENGINE_BASE_URL})，请检查网络或配置 VOLCENGINE_BASE_URL 环境变量使用代理端点` : `火山引擎API请求失败: ${finalErrMsg}` }, 500);
    }
    const respText = await apiResp.text();
    let result: VolcApiResponse;
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
          }, VOLC_FETCH_TIMEOUT);
          if (fallbackResp.ok) {
            const fallbackResult = JSON.parse(await fallbackResp.text());
            const volcTaskIdFb = fallbackResult.id || fallbackResult.task_id || fallbackResult.data?.id || '';
            if (volcTaskIdFb) {
              await supabase.from('video_tasks').update({ status: 'processing', volcengine_task_id: volcTaskIdFb, updated_at: new Date().toISOString() }).eq('task_id', taskId);
              console.log(`[Volcengine] ✅ H264 fallback success: local=${taskId}, volcengine=${volcTaskIdFb}`);
              return c.json({ success: true, task_id: volcTaskIdFb, local_task_id: taskId, taskId, volcTaskId: volcTaskIdFb, message: '视频生成任务已创建（H264降级）', codecFallback: true });
            }
          }
        } catch (fbErr: unknown) {
          console.error(`[Volcengine] H264 fallback also failed:`, getErrorMessage(fbErr));
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
  } catch (error: unknown) {
    console.error('[Volcengine] Generate error:', truncateErrorMsg(error));
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

// 查询视频任务状态 — v5.4.0: 完成时自动转存阿里云 OSS
app.get(`${PREFIX}/volcengine/status/:taskId`, async (c) => {
  try {
    const taskId = c.req.param('taskId');
    // v6.0.23: 三重查找合并为单次 .or() 查询（原: 最多3次串行查询 → 现: 1次）
    let dbTask: VideoTaskRow | null = null;
    {
      let orFilter = `task_id.eq.${taskId},volcengine_task_id.eq.${taskId}`;
      if (taskId.startsWith('vtask-')) orFilter += `,id.eq.${taskId}`;
      const { data: taskResults } = await supabase.from('video_tasks')
        .select('id, task_id, user_phone, prompt, style, duration, status, volcengine_task_id, video_url, thumbnail, generation_metadata, series_id, created_at, updated_at')
        .or(orFilter);
      if (taskResults && taskResults.length > 0) {
        // 优先级：task_id > volcengine_task_id > id PK
        dbTask = taskResults.find((t: VideoTaskRow) => t.task_id === taskId)
          || taskResults.find((t: VideoTaskRow) => t.volcengine_task_id === taskId)
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
            // v6.0.160: 传入refreshUrlFn，TOS URL过期时自动从Volcengine获取新鲜URL重试
            const videoResult = await transferFileToOSS(dbTask.video_url, `videos/${_localId}.mp4`, 'video/mp4', makeVolcRefreshFn(dbTask.volcengine_task_id));
            if (videoResult.transferred) {
              await supabase.from('video_tasks').update({ video_url: videoResult.url }).eq('task_id', _localId);
              if (_meta?.type === 'storyboard_video' && _meta.seriesId && _meta.episodeNumber) {
                await supabase.from('series_storyboards').update({ video_url: videoResult.url })
                  .eq('series_id', _meta.seriesId).eq('episode_number', _meta.episodeNumber)
                  .eq('scene_number', _meta.storyboardNumber || _meta.sceneNumber);
              }
              console.log(`[OSS] ✅ Retry-transfer done for completed task ${_localId}`);
            }
          } catch (e: unknown) { console.warn(`[OSS] Retry-transfer failed for ${_localId}: ${getErrorMessage(e)}`); }
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

    // ---- 查询火山引擎 API ----
    // v6.0.183: 对长时间处理的任务(>10min)使用更长超时(40s vs 25s)，减少因API超时导致的"假性processing"
    const taskAgeMs = dbTask?.created_at ? Date.now() - new Date(dbTask.created_at).getTime() : 0;
    const volcStatusTimeout = taskAgeMs > 10 * 60 * 1000 ? 40000 : 25000;
    let apiResp: Response;
    try {
      apiResp = await fetchWithTimeout(`${VOLCENGINE_BASE_URL}/${volcId}`, { method: 'GET', headers: { 'Authorization': `Bearer ${VOLCENGINE_API_KEY}`, 'Content-Type': 'application/json' } }, volcStatusTimeout);
    } catch (fe: unknown) {
      if (dbTask) {
        // v6.0.183: 标记 isFallback + ���务年龄，帮助前端识别缓存状态
        const ageMinutes = Math.round(taskAgeMs / 60000);
        console.warn(`[Volcengine] Status API timeout for task ${dbTask.task_id} (age ${ageMinutes}min), returning DB cache`);
        return c.json({ success: true, data: { task_id: dbTask.task_id, status: dbTask.status, content: dbTask.video_url ? { video_url: dbTask.video_url, cover_url: dbTask.thumbnail || '' } : undefined, taskAgeMinutes: ageMinutes }, warning: '网络错误，显示数据库缓存', isFallback: true });
      }
      return c.json({ success: false, error: `查询失败: ${getErrorMessage(fe)}` }, 500);
    }
    const respText = await apiResp.text();
    let apiData: VolcApiResponse;
    try { apiData = JSON.parse(respText); } catch (parseErr) { console.error('[Volcengine] JSON parse error:', parseErr, 'raw:', respText.substring(0, 200)); return c.json({ success: false, error: '火山引擎响应解析失败', parseError: true, message: respText.substring(0, 200) }, 500); }
    if (!apiResp.ok) {
      if (apiResp.status === 404 || apiData.error?.code === 'ResourceNotFound') {
        if (dbTask) await supabase.from('video_tasks').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('task_id', dbTask.task_id);
        return c.json({ success: false, error: '任务不存在', status: 'failed' }, 404);
      }
      return c.json({ error: '��询任务失败', details: apiData }, apiResp.status);
    }

    const volcStatus = apiData.status || 'unknown';
    let rawVideoUrl = '', rawThumbnailUrl = '', rawLastFrameUrl = '';
    if (['succeeded', 'completed', 'success'].includes(volcStatus)) {
      rawVideoUrl = apiData.content?.video_url || apiData.video_url || '';
      rawThumbnailUrl = apiData.content?.cover_url || apiData.thumbnail || '';
      // v6.0.210: 从Volcengine API响应中提取尾帧URL（return_last_frame=true时返回）
      // 官方文档: 任务完成后content.last_frame_url包含尾帧图片URL
      // 这是获取尾帧最可靠的方式，优先于OSS截帧和客户端canvas提取
      rawLastFrameUrl = apiData.content?.last_frame_url || '';
      if (rawLastFrameUrl) {
        console.log(`[Volcengine] 🎯 API returned last_frame_url: ${rawLastFrameUrl.substring(0, 80)}...`);
      }
    }

    // ---- v5.6.1: 视频完成 — 快速写DB + 立即返回，OSS转存fire-and-forget ----
    // 之前同步OSS转存（下载+上传30-120s）阻塞Edge Function导致：
    //   1. 状态轮询超时（前端timeout < 转存时间）
    //   2. 新的/generate请求被拒绝 → "Failed to fetch"
    //   3. 批量生成后续场景全部失败
    if (rawVideoUrl && dbTask) {
      const localId = dbTask.task_id;

      // Step 1: 立即将火山引擎原始URL写入DB（~100ms）
      const upd: Record<string, unknown> = { status: 'completed', video_url: rawVideoUrl, updated_at: new Date().toISOString() };
      if (rawThumbnailUrl) upd.thumbnail = rawThumbnailUrl;
      // v6.0.211: 如果API返回了尾帧URL，立即下载并转存到OSS获取永久链接
      // Volcengine的last_frame_url有24小时有效期，直接保存会导致隔天生成下一场景时URL过期
      // 尾帧图片通常只有100-500KB，下载+上传非常快（<2s）
      if (rawLastFrameUrl && rawLastFrameUrl.startsWith('http')) {
        const curMeta = parseMeta(dbTask.generation_metadata) || {};
        // 先保存临时URL到DB（确保即使OSS转存失败也有值可用）
        upd.generation_metadata = { ...curMeta, lastFrameUrl: rawLastFrameUrl };
        console.log(`[Volcengine] 🎯 API returned last_frame_url for task ${localId}, persisting to OSS...`);
        // 同步转存到OSS（图片很小，不会阻塞太久）
        try {
          const lfResp = await fetchWithTimeout(rawLastFrameUrl, {}, 8000);
          if (lfResp.ok) {
            const lfBuf = await lfResp.arrayBuffer();
            if (lfBuf.byteLength > 500) {
              const ossLfUrl = await uploadToOSS(`last-frames/${localId}.jpg`, lfBuf, 'image/jpeg');
              if (ossLfUrl) {
                upd.generation_metadata = { ...curMeta, lastFrameUrl: ossLfUrl };
                console.log(`[Volcengine] ✅ last_frame_url persisted to OSS: ${ossLfUrl.substring(0, 60)}... (${(lfBuf.byteLength / 1024).toFixed(1)}KB)`);
              }
            } else {
              console.warn(`[Volcengine] ⚠️ last_frame_url image too small (${lfBuf.byteLength}B), keeping temp URL`);
            }
          } else {
            console.warn(`[Volcengine] ⚠️ Failed to download last_frame_url (HTTP ${lfResp.status}), keeping temp URL`);
          }
        } catch (lfErr: unknown) {
          console.warn(`[Volcengine] ⚠️ last_frame_url OSS persist failed: ${getErrorMessage(lfErr)}, keeping temp URL`);
        }
      }
      await supabase.from('video_tasks').update(upd).eq('task_id', localId);
      console.log(`[Volcengine] ✅ Task ${localId} completed → saved to DB${rawLastFrameUrl ? ' (with last_frame_url)' : ''}`);

      // Step 2: 同步到series表（轻量DB操作）
      if (dbTask.generation_metadata?.type === 'storyboard_video') {
        const meta = dbTask.generation_metadata;
        const _sid = meta.seriesId, _epn = meta.episodeNumber, _scn = meta.storyboardNumber || meta.sceneNumber;
        if (_sid && _epn && _scn) {
          try {
            const sbUpd: Record<string, unknown> = { video_url: rawVideoUrl, status: 'completed', updated_at: new Date().toISOString() };
            // v6.0.118: 同步thumbnail→storyboard.image_url，自动替换预设的referenceImageUrl
            // 效果: (a) UI展示真实生成缩略图 (b) 后续场���的prev-scene i2v引用自动升级为生成画面
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
            // 后续所有无前序图的场景将使用此图作为i2v参考��确保风格一致
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
              } catch (anchorErr: unknown) {
                console.warn(`[Volcengine] Style anchor save (non-blocking): ${getErrorMessage(anchorErr)}`);
              }
            }
          } catch (syncErr: unknown) {
            console.warn(`[Volcengine] Series sync: ${getErrorMessage(syncErr)}`);
          }
        }
      }

      // Step 3: v6.0.131 OSS转存 — await with 12s timeout（替代fire-and-forget）
      // 原fire-and-forget问题: Edge Function返回response后可能被杀死，IIFE中的OSS转存来不及完成
      // 新策略: 用Promise.race等待最多12s，大部分10s视频(~5-10MB)在12s内可完成转存
      //   成功 → 直接返回OSS URL（DB已更新），前端拿到���久化URL
      //   超时 → 返回原始Volcengine URL，后台继续转存（下次轮询early-return路径补充）
      let finalVideoUrl = rawVideoUrl;
      let ossPending = false;
      if (isOSSConfigured() && !rawVideoUrl.includes('.aliyuncs.com')) {
        const _meta = dbTask.generation_metadata;
        const OSS_TIMEOUT_MS = 12000;
        const ossTransferTask = (async () => {
          // v6.0.160: 传入refreshUrlFn以防rawVideoUrl已过期
          const videoResult = await transferFileToOSS(rawVideoUrl, `videos/${localId}.mp4`, 'video/mp4', makeVolcRefreshFn(volcId));
          if (videoResult.transferred) {
            const ossUpd: Record<string, unknown> = { video_url: videoResult.url };
            if (rawThumbnailUrl) {
              try {
                const thumbResult = await transferFileToOSS(rawThumbnailUrl, `thumbnails/${localId}.jpg`, 'image/jpeg');
                if (thumbResult.transferred) ossUpd.thumbnail = thumbResult.url;
              } catch (e: unknown) { console.warn(`[Volcengine] Thumbnail OSS transfer failed (non-critical):`, getErrorMessage(e)); }
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

            // v6.0.201: 视频OSS上传成功后，同步提取尾帧（10s超时）
            // 必须在返回响应前完成，否则下一场景生成时找不到尾帧
            if (_meta?.type === 'storyboard_video') {
              const lastFrameTask = (async (): Promise<boolean> => {
                try {
                  const durationSec = parseInt(String(_meta.duration || dbTask.duration)) || 10;
                  const snapshotMs = Math.max(0, (durationSec * 1000) - 500);
                  const ossUrlObj = new URL(ossUrl);
                  const objectKey = ossUrlObj.pathname.startsWith('/') ? ossUrlObj.pathname.slice(1) : ossUrlObj.pathname;
                  const snapshotUrl = await generateVideoSnapshotUrl(objectKey, snapshotMs, 3600);
                  const snapResp = await fetchWithTimeout(snapshotUrl, {}, 8000);
                  if (snapResp.ok) {
                    const snapBuf = await snapResp.arrayBuffer();
                    if (snapBuf.byteLength > 1000) {
                      const lfUrl = await uploadToOSS(`last-frames/${localId}.jpg`, snapBuf, 'image/jpeg');
                      if (lfUrl) {
                        const curMeta = (_meta as Record<string, unknown>) || {};
                        await supabase.from('video_tasks').update({
                          generation_metadata: { ...curMeta, lastFrameUrl: lfUrl },
                        }).eq('task_id', localId);
                        console.log(`[OSS] 🎯 Last frame saved: ${localId} t=${snapshotMs}ms → ${lfUrl.substring(0, 60)}...`);
                        return true;
                      }
                    } else {
                      console.warn(`[OSS] ⚠️ Last frame snapshot too small (${snapBuf.byteLength}B) — IMM may not be enabled. To enable: 阿里云控制台 → OSS → 数据处理 → 智能媒体管理 → 开通`);
                    }
                  } else {
                    console.warn(`[OSS] ⚠️ Last frame snapshot HTTP ${snapResp.status} — IMM video processing not enabled. To enable: 阿里云控制台 → OSS → 数据处理 → 智能媒体管理 → 开通`);
                  }
                  return false;
                } catch (lfErr: unknown) {
                  console.warn(`[OSS] Last frame extraction failed: ${getErrorMessage(lfErr)}`);
                  return false;
                }
                return false;
              })();
              // v6.0.201: 同步等待尾帧提取（最多10s），确保下一场景能找到参考图
              try {
                const lfTimeout = new Promise<boolean>(r => setTimeout(() => r(false), 10000));
                const lfResult = await Promise.race([lastFrameTask, lfTimeout]);
                if (!lfResult) {
                  console.warn(`[OSS] ⚠️ Last frame extraction did not succeed for ${localId} — next scene will use thumbnail fallback`);
                }
              } catch { /* non-blocking */ }
            }
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
        } catch (ossErr: unknown) {
          ossPending = true;
          console.warn(`[OSS] Transfer error for ${localId}: ${getErrorMessage(ossErr)}`);
        }
      }

      // v6.0.210: 已移除thumbnail保底lastFrameUrl逻辑
      // thumbnail是视频首帧/封面图，将其作为lastFrameUrl会导致下一场景的参考图
      // 是前一场景的首帧而非尾帧，产生"所有视频都是第一帧"的问题
      // 正确的尾帧来源优先级: (1) Volcengine API content.last_frame_url (2) OSS截帧 (3) 客户端canvas提取
      // 如果以上都失败，宁可用纯t2v模式也不要注入错误的首帧

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

    // ---- 任务尚未完成：��新DB状态并返回 ----
    if (dbTask) {
      const dbStatus = volcStatus === 'failed' ? 'failed' : volcStatus;
      await supabase.from('video_tasks').update({ status: dbStatus, updated_at: new Date().toISOString() }).eq('task_id', dbTask.task_id);
      // v6.0.183: 长时间 processing 的任务标记为潜在卡住——帮助前端和管理面板识别
      const ageMin = Math.round(taskAgeMs / 60000);
      if (ageMin > 20 && ['processing', 'submitted', 'pending'].includes(volcStatus)) {
        console.warn(`[Volcengine] ⚠️ Task ${dbTask.task_id} (volc=${volcId}) still ${volcStatus} after ${ageMin} minutes — may be stuck on Volcengine side`);
      }
    }
    // v6.0.161: 失败任务返回错误原因，帮助前端展示更有用的信息
    const volcError = apiData.error?.message || apiData.error_message || apiData.base_resp?.status_message || '';
    if (volcStatus === 'failed' && volcError) {
      console.warn(`[Volcengine] Task ${dbTask?.task_id || volcId} failed: ${volcError}`);
    }
    // v6.0.183: 返回任务年龄帮助前端自适应
    const ageMinutes = dbTask?.created_at ? Math.round((Date.now() - new Date(dbTask.created_at).getTime()) / 60000) : undefined;
    return c.json({ success: true, data: { ...apiData, content: apiData.content || {}, ...(volcError ? { failureReason: volcError } : {}), ...(ageMinutes !== undefined ? { taskAgeMinutes: ageMinutes } : {}) } });
  } catch (error: unknown) {
    console.error('[Volcengine] Status error:', truncateErrorMsg(error));
    return c.json({ error: getErrorMessage(error) }, 500);
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
      if (meta && typeof meta === 'object' && (meta as Record<string, unknown>).seriesId) {
        seriesIdSet.add((meta as Record<string, unknown>).seriesId as string);
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
        const existingIds = new Set((existingSeries || []).map((s: SeriesRow) => s.id));
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
          if (meta && typeof meta === 'object' && (meta as Record<string, unknown>).seriesId) {
            return !orphanSeriesIds.has((meta as Record<string, unknown>).seriesId as string);
          }
          return true;
        })
      : activeTasks;

    // v6.0.77: 自愈过期卡住的任务——超过20分钟仍为 pending/processing/submitted 的视频任务标记为 failed
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
        .then(({ error: staleErr }: { error: { message: string } | null }) => {
          if (staleErr) console.warn(`[Tasks] stale task update error: ${staleErr.message}`);
          else console.log(`[Tasks] ${staleTaskIds.length} stale tasks marked as failed in DB`);
        });
    }

    return c.json({ success: true, tasks: toCamelCase(filteredTasks), total: filteredTasks.length });
  } catch (error: unknown) { console.error('[GET /volcengine/active-tasks] Error:', error); return c.json({ success: true, tasks: [], total: 0, error: getErrorMessage(error) }); }
});

// 调试任务
app.get(`${PREFIX}/volcengine/debug/:taskId`, async (c) => {
  try {
    const taskId = c.req.param('taskId');
    const { data, error } = await supabase.from('video_tasks').select('*').eq('task_id', taskId).maybeSingle();
    if (error) return c.json({ success: false, error: error.message }, 500);
    if (!data) return c.json({ success: false, error: 'Task not found' }, 404);
    return c.json({ success: true, data: toCamelCase(data) });
  } catch (error: unknown) { console.error('[GET /volcengine/debug/:taskId] Error:', error); return c.json({ success: false, error: getErrorMessage(error) }, 500); }
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
  } catch (error: unknown) {
    console.error('[POST /volcengine/cancel/:taskId] Error:', getErrorMessage(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
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
  } catch (error: unknown) {
    console.error('[POST /volcengine/cancel-series-tasks/:seriesId] Error:', getErrorMessage(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
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
    // v6.0.196: 极简重试prompt——场景描述优先，只追加简短风格关键词
    let retryText = `${task.prompt}。${sp.substring(0, 40)}，画面精致，中文场景。稳定运镜，高清细节，五官清晰，动作自然`;
    retryText = retryText.replace(/\0/g, '').replace(/\uFFFD+/g, '').replace(/\uFEFF/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').replace(/[\uD800-\uDFFF]/g, '').replace(/[\u200B-\u200F\u2028-\u202F\u2060\u2066-\u2069]/g, '').replace(/[\uE000-\uF8FF]/g, '').replace(/[\uFFF0-\uFFFF]/g, '');
    try { retryText = retryText.replace(/[\u{10000}-\u{10FFFF}]/gu, ''); } catch { /* fallback */ }
    retryText = retryText.replace(/[\u2000-\u206F]/g, '').replace(/\s{3,}/g, ' ').trim();
    if (!retryText || retryText.length < 5) retryText = task.prompt?.substring(0, 2000) || '生成一段精彩的视频画面';
    if (retryText.length > 4000) retryText = retryText.substring(0, 4000);
    const content: VolcContentItem[] = [{ type: 'text', text: retryText }];
    const meta = (task.generation_metadata || {}) as Record<string, unknown>;
    const rb: Record<string, unknown> = { model: meta.model || 'doubao-seedance-1-5-pro-251215', content, return_last_frame: true };
    if (meta.enableAudio) rb.enable_audio = true;
    const resp = await fetchWithTimeout(VOLCENGINE_BASE_URL, { method: 'POST', headers: { 'Authorization': `Bearer ${VOLCENGINE_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(rb) }, 55000);
    if (!resp.ok) { const ed = await resp.json().catch(() => ({})); return c.json({ success: false, error: ed.error?.message || 'Retry failed' }, 500); }
    const result = await resp.json();
    const newVolcId = result.id || result.task_id || '';
    if (newVolcId) await supabase.from('video_tasks').update({ status: 'processing', volcengine_task_id: newVolcId, video_url: null, thumbnail: null, updated_at: new Date().toISOString() }).eq('task_id', taskId);
    return c.json({ success: true, data: { taskId, volcTaskId: newVolcId, status: 'processing' } });
  } catch (error: unknown) {
    console.error('[Volcengine] Retry error:', truncateErrorMsg(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

// ==================== [L] 社区互动补全路由 ====================

app.get(`${PREFIX}/community/works/:workId/comments`, async (c) => {
  try {
    const workId = c.req.param('workId');
    const page = Math.max(parseInt(c.req.query('page') || '1') || 1, 1);
    const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '20') || 20, 1), 100);
    const offset = (page - 1) * limit;
    const { data: comments, error } = await supabase.from('comments').select('id, work_id, user_phone, content, created_at').eq('work_id', workId).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    if (error) return c.json({ success: false, error: error.message }, 500);
    const phones = [...new Set((comments || []).map((cm: CommentRow) => cm.user_phone))];
    let usersMap = new Map<string, UserRow>();
    if (phones.length > 0) {
      const { data: users } = await supabase.from('users').select('phone, nickname, avatar_url').in('phone', phones);
      usersMap = new Map((users || []).map((u: UserRow) => [u.phone, u]));
    }
    const enriched = (comments || []).map((cm: CommentRow) => { const u = usersMap.get(cm.user_phone); return { ...toCamelCase(cm), username: u?.nickname || '匿名用户', userAvatar: u?.avatar_url || '' }; });
    return c.json({ success: true, data: enriched, comments: enriched });
  } catch (error: unknown) { console.error('[GET /community/works/:workId/comments] Error:', error); return c.json({ success: false, error: getErrorMessage(error) }, 500); }
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
  } catch (error: unknown) { console.error('[POST /community/works/:workId/comments] Error:', error); return c.json({ success: false, error: getErrorMessage(error) }, 500); }
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
  } catch (error: unknown) { console.error('[POST /community/works/:workId/like] Error:', error); return c.json({ success: false, error: getErrorMessage(error) }, 500); }
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
  } catch (error: unknown) { console.error('[GET /community/works/:workId/like-status] Error:', error); return c.json({ success: false, error: getErrorMessage(error) }, 500); }
});

// TODO: increment-view 和 share 目前是空操作 stub。
// video_tasks 表没有 views_count / shares_count 列，需要 DDL 迁移后才能实现真实计数。
// 前端以 fire-and-forget 方式调用，不依赖返回数据，因此 stub 不影响功���。
app.post(`${PREFIX}/community/works/:workId/increment-view`, async (c) => {
  try {
    return c.json({ success: true });
  } catch (error: unknown) {
    console.warn('[Community] increment-view stub error:', getErrorMessage(error));
    return c.json({ success: true });
  }
});

app.post(`${PREFIX}/community/works/:workId/share`, async (c) => {
  try {
    return c.json({ success: true });
  } catch (error: unknown) {
    console.warn('[Community] share stub error:', getErrorMessage(error));
    return c.json({ success: true });
  }
});

app.post(`${PREFIX}/community/publish`, async (c) => {
  try {
    const { phone, taskId, prompt, thumbnail, videoUrl } = await c.req.json();
    if (!phone || !taskId) return c.json({ success: false, error: 'phone and taskId required' }, 400);
    const upd: Record<string, unknown> = { status: 'completed', updated_at: new Date().toISOString() };
    if (videoUrl) upd.video_url = videoUrl;
    if (thumbnail) upd.thumbnail = thumbnail;
    if (prompt) upd.prompt = prompt;
    await supabase.from('video_tasks').update(upd).eq('task_id', taskId);
    return c.json({ success: true });
  } catch (error: unknown) { console.error('[POST /community/publish] Error:', error); return c.json({ success: false, error: getErrorMessage(error) }, 500); }
});

// v6.0.14: 增强版 refresh-video — 检测过期URL → 重新查询火山引擎 → 转存OSS
app.post(`${PREFIX}/community/works/:workId/refresh-video`, async (c) => {
  try {
    const workId = c.req.param('workId');
    // v6.0.23: 三重查找合并为单次 .or() 查询
    let task: VideoTaskRow | null = null;
    {
      let orFilter = `task_id.eq.${workId},volcengine_task_id.eq.${workId}`;
      if (workId.startsWith('vtask-')) orFilter += `,id.eq.${workId}`;
      const { data: taskResults } = await supabase.from('video_tasks')
        .select('task_id, video_url, thumbnail, volcengine_task_id, generation_metadata')
        .or(orFilter);
      if (taskResults && taskResults.length > 0) {
        task = taskResults.find((t: VideoTaskRow) => t.task_id === workId)
          || taskResults.find((t: VideoTaskRow) => t.volcengine_task_id === workId)
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
    } catch (volcErr: unknown) {
      console.warn(`[RefreshVideo] Volcengine query failed: ${getErrorMessage(volcErr)}`);
    }

    if (!freshVideoUrl) {
      console.warn(`[RefreshVideo] ${workId} — Volcengine returned no URL, may be permanently expired`);
      return c.json({ success: false, error: '视频已从火山引擎过期删除，需要重新生成' });
    }

    // 更新DB
    const upd: Record<string, unknown> = { video_url: freshVideoUrl, updated_at: new Date().toISOString() };
    if (freshThumbnailUrl) upd.thumbnail = freshThumbnailUrl;
    await supabase.from('video_tasks').update(upd).eq('task_id', task.task_id);
    console.log(`[RefreshVideo] ✅ ${workId} — refreshed URL from Volcengine`);

    // 转存到OSS（fire-and-forget）
    if (isOSSConfigured() && !freshVideoUrl.includes('.aliyuncs.com')) {
      (async () => {
        try {
          const result = await transferFileToOSS(freshVideoUrl, `videos/${task.task_id}.mp4`, 'video/mp4', makeVolcRefreshFn(volcId));
          if (result.transferred) {
            const ossUpd: Record<string, unknown> = { video_url: result.url };
            if (freshThumbnailUrl) {
              try {
                const thumbResult = await transferFileToOSS(freshThumbnailUrl, `thumbnails/${task.task_id}.jpg`, 'image/jpeg');
                if (thumbResult.transferred) ossUpd.thumbnail = thumbResult.url;
              } catch (e: unknown) { console.warn('[RefreshVideo] Thumbnail OSS failed:', getErrorMessage(e)); }
            }
            await supabase.from('video_tasks').update(ossUpd).eq('task_id', task.task_id);
            if (task.generation_metadata?.seriesId && task.generation_metadata?.episodeNumber) {
              const sbUpd: Record<string, unknown> = { video_url: result.url };
              await supabase.from('series_storyboards').update(sbUpd)
                .eq('series_id', task.generation_metadata.seriesId)
                .eq('episode_number', task.generation_metadata.episodeNumber)
                .eq('scene_number', task.generation_metadata.storyboardNumber || task.generation_metadata.sceneNumber);
            }
            console.log(`[RefreshVideo/OSS] ✅ ${task.task_id} transferred`);
          }
        } catch (ossErr: unknown) {
          console.warn(`[RefreshVideo/OSS] Failed: ${getErrorMessage(ossErr)}`);
        }
      })().catch(() => {});
    }

    return c.json({ success: true, data: { videoUrl: freshVideoUrl, thumbnailUrl: freshThumbnailUrl || task.thumbnail || '' } });
  } catch (error: unknown) { console.error('[POST /community/works/:workId/refresh-video] Error:', error); return c.json({ success: false, error: getErrorMessage(error) }, 500); }
});

app.post(`${PREFIX}/community/tasks/cleanup-failed`, async (c) => {
  try {
    await supabase.from('video_tasks').delete().eq('status', 'failed').lt('created_at', new Date(Date.now() - 7 * 86400000).toISOString());
    return c.json({ success: true, data: { cleaned: true } });
  } catch (error: unknown) { console.error('[POST /community/tasks/cleanup-failed] Error:', error); return c.json({ success: false, error: getErrorMessage(error) }, 500); }
});

app.post(`${PREFIX}/community/tasks/batch-status`, async (c) => {
  try {
    const { taskIds } = await c.req.json();
    if (!taskIds || !Array.isArray(taskIds)) return c.json({ success: false, error: 'taskIds required' }, 400);
    const { data, error } = await supabase.from('video_tasks').select('task_id, status, video_url, thumbnail').in('task_id', taskIds);
    if (error) return c.json({ success: false, error: error.message }, 500);
    return c.json({ success: true, data: toCamelCase(data || []) });
  } catch (error: unknown) { console.error('[POST /community/tasks/batch-status] Error:', error); return c.json({ success: false, error: getErrorMessage(error) }, 500); }
});

// ------------------------------------------------------------------
//  [J] OSS & 同步 — 视频转存OSS / 批量同步状态 / 综合恢复
// ------------------------------------------------------------------

// ==================== [M] 视频转存到阿里云 OSS ====================

app.post(`${PREFIX}/video/transfer`, async (c) => {
  try {
    const { taskId, volcengineUrl } = await c.req.json();
    if (!taskId || !volcengineUrl) return c.json({ success: false, error: 'taskId and volcengineUrl required' }, 400);

    if (!isOSSConfigured()) {
      return c.json({ success: false, error: '阿里云 OSS 未配置，请设置 ALIYUN_OSS_ACCESS_KEY_ID / SECRET / BUCKET / REGION 环境变量' }, 500);
    }

    console.log(`[Transfer] Starting OSS transfer for task ${taskId}`);
    // v6.0.173-fix: 查询volcengine_task_id用于403刷新重试
    const { data: taskRow } = await supabase.from('video_tasks').select('volcengine_task_id').eq('task_id', taskId).maybeSingle();
    const result = await transferFileToOSS(volcengineUrl, `videos/${taskId}.mp4`, 'video/mp4', makeVolcRefreshFn(taskRow?.volcengine_task_id));

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
  } catch (error: unknown) {
    console.error('[Transfer] Error:', truncateErrorMsg(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

// ==================== [M] 批量���步火山引擎任务状态 + 转存 OSS ====================

// v5.5.1: 带 deadline 防超时 + 并行批处理
// v6.0.173: deadline 50→40s(防Edge Function硬限60s), batch 3→5, per-task 15→10s, limits缩减
app.post(`${PREFIX}/volcengine/sync-pending-tasks`, async (c) => {
  const DEADLINE_MS = 40000;
  const BATCH_SIZE = 5;
  const PER_TASK_TIMEOUT = 10000;
  const startTime = Date.now();
  const isDeadlineNear = () => (Date.now() - startTime) > DEADLINE_MS;

  try {
    console.log('[Sync] v5.5.1: Starting comprehensive sync with deadline...');

    // v6.0.24: 精简字段——sync只需task_id/volcengine_task_id/generation_metadata，排除prompt等大字段
    const [{ data: pendingTasks, error: qErr }, { data: completedNoUrl }, { data: completedVolcUrl }] = await Promise.all([
      // v6.0.173: limits缩减 20/10/10 → 12/6/6，确保最多24个task在40s deadline内处理完
      supabase.from('video_tasks').select(TASK_SYNC_FIELDS).in('status', ['pending', 'processing', 'running']).not('volcengine_task_id', 'is', null).order('created_at', { ascending: false }).limit(12),
      supabase.from('video_tasks').select(TASK_SYNC_FIELDS).eq('status', 'completed').not('volcengine_task_id', 'is', null).is('video_url', null).order('created_at', { ascending: false }).limit(6),
      supabase.from('video_tasks').select(TASK_SYNC_FIELDS).eq('status', 'completed').not('volcengine_task_id', 'is', null).not('video_url', 'is', null).like('video_url', '%volces.com%').order('created_at', { ascending: false }).limit(6),
    ]);

    if (qErr) return c.json({ success: false, error: qErr.message }, 500);

    const taskMap = new Map<string, VideoTaskRow>();
    for (const t of (pendingTasks || [])) taskMap.set(t.task_id, t);
    for (const t of (completedNoUrl || [])) taskMap.set(t.task_id, t);
    for (const t of (completedVolcUrl || [])) taskMap.set(t.task_id, t);
    const allTasks = Array.from(taskMap.values());

    if (allTasks.length === 0) {
      return c.json({ success: true, message: '没有待同步的任务', synced: 0, failed: 0, stillRunning: 0, total: 0 });
    }

    console.log(`[Sync] Found ${allTasks.length} tasks (pending=${pendingTasks?.length || 0}, noUrl=${completedNoUrl?.length || 0}, volcUrl=${completedVolcUrl?.length || 0})`);

    let synced = 0, failed = 0, stillRunning = 0, skipped = 0;

    // v6.0.161: sync流程不做inline OSS转存(OSS下载最多120s撑爆deadline)
    // 保存Volcengine URL即可，OSS转存�� oss-batch-transfer 或下次 status poll 完成
    async function syncOneTask(task: VideoTaskRow): Promise<void> {
      try {
        const result = await queryVolcengineStatus(task.volcengine_task_id, PER_TASK_TIMEOUT);
        if (result.volcStatus === 'completed') {
          await writeBackTaskCompletion(task, result.videoUrl, result.thumbnailUrl);
          synced++;
          console.log(`[Sync] ✅ ${task.task_id} -> completed`);
        } else if (result.volcStatus === 'failed') {
          await markTaskFailed(task.task_id);
          failed++;
        } else {
          stillRunning++;
        }
      } catch (err: unknown) {
        console.warn(`[Sync] Error checking task ${task.task_id}: ${getErrorMessage(err)}`);
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
    const message = `同步完成(${elapsed}ms)：${synced} 个已完成，${failed} 个失败，${stillRunning} 个仍在处理${skipped > 0 ? `，${skipped} 个因超时跳过` : ''}`;
    console.log(`[Sync] ✅ ${message}`);
    return c.json({ success: true, total: allTasks.length, synced, failed, stillRunning, skipped, message });
  } catch (error: unknown) {
    console.error('[Sync] Batch sync error:', truncateErrorMsg(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

// v5.5.1: 综合恢复所有视频任务 — 带 deadline 防超时 + 并行批处理
// v6.0.173: deadline 50→45s, batch 3→5, per-task 15→10s
app.post(`${PREFIX}/volcengine/recover-all-tasks`, async (c) => {
  const DEADLINE_MS = 45000;
  const BATCH_SIZE = 5;
  const PER_TASK_TIMEOUT = 10000;
  const startTime = Date.now();

  const isDeadlineNear = () => (Date.now() - startTime) > DEADLINE_MS;

  try {
    const body = await c.req.json().catch(() => ({}));
    const seriesId = body.seriesId || '';
    console.log(`[Recover] Starting full recovery${seriesId ? ` for series ${seriesId}` : ' (global)'}...`);

    // 1. 查出所有需要恢复的任务（使用共享字段常量 TASK_SYNC_FIELDS）
    let pendingQuery = supabase.from('video_tasks')
      .select(TASK_SYNC_FIELDS)
      .in('status', ['pending', 'processing', 'running'])
      .not('volcengine_task_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20);

    let completedNoUrlQuery = supabase.from('video_tasks')
      .select(TASK_SYNC_FIELDS)
      .eq('status', 'completed')
      .not('volcengine_task_id', 'is', null)
      .is('video_url', null)
      .order('created_at', { ascending: false })
      .limit(10);

    let volcUrlQuery = supabase.from('video_tasks')
      .select(TASK_SYNC_FIELDS)
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

    const taskMap = new Map<string, VideoTaskRow>();
    for (const t of (p1 || [])) taskMap.set(t.task_id, t);
    for (const t of (p2 || [])) taskMap.set(t.task_id, t);
    for (const t of (p3 || [])) taskMap.set(t.task_id, t);
    const allRecoverTasks = Array.from(taskMap.values());

    if (allRecoverTasks.length === 0) {
      return c.json({ success: true, total: 0, recovered: 0, failed: 0, alreadyOK: 0, ossTransferred: 0, message: '所有任务状态正常' });
    }

    console.log(`[Recover] Found ${allRecoverTasks.length} tasks (${p1?.length || 0} pending, ${p2?.length || 0} no-url, ${p3?.length || 0} volc-url)`);

    let recovered = 0, failed = 0, alreadyOK = 0, ossTransferred = 0, skipped = 0;

    // 单个任务恢复逻辑（使用共享 queryVolcengineStatus + writeBackTaskCompletion）
    async function recoverOneTask(task: VideoTaskRow): Promise<void> {
      try {
        const result = await queryVolcengineStatus(task.volcengine_task_id, PER_TASK_TIMEOUT);
        if (result.volcStatus === 'completed') {
          let { videoUrl, thumbnailUrl } = result;
          // 转���到 OSS（仅在 deadline 未近时尝试）
          if (videoUrl && !isDeadlineNear()) {
            try {
              const vr = await transferFileToOSS(videoUrl, `videos/${task.task_id}.mp4`, 'video/mp4', makeVolcRefreshFn(task.volcengine_task_id));
              videoUrl = vr.url;
              ossTransferred++;
            } catch (e: unknown) { console.warn(`[Recover] Video OSS transfer failed for ${task.task_id}:`, getErrorMessage(e)); }
          }
          if (thumbnailUrl && !isDeadlineNear()) {
            try {
              const tr = await transferFileToOSS(thumbnailUrl, `thumbnails/${task.task_id}.jpg`, 'image/jpeg');
              thumbnailUrl = tr.url;
            } catch (e: unknown) { console.warn(`[Recover] Thumbnail OSS transfer failed for ${task.task_id}:`, getErrorMessage(e)); }
          }
          await writeBackTaskCompletion(task, videoUrl, thumbnailUrl);
          recovered++;
          console.log(`[Recover] ✅ ${task.task_id} -> recovered (${Date.now() - startTime}ms elapsed)`);
        } else if (result.volcStatus === 'failed') {
          await markTaskFailed(task.task_id);
          failed++;
        } else {
          alreadyOK++;
        }
      } catch (err: unknown) {
        console.warn(`[Recover] Error recovering task ${task.task_id}: ${getErrorMessage(err)}`);
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
    const message = `全量恢复完成(${elapsed}ms)：${recovered} 个已恢复，${ossTransferred} 个已转存OSS，${failed} 个失败���${alreadyOK} 个仍在处理${skipped > 0 ? `，${skipped} 个因超时跳过` : ''}`;
    console.log(`[Recover] ✅ ${message}`);
    return c.json({ success: true, total: allRecoverTasks.length, recovered, failed, alreadyOK, ossTransferred, skipped, message });
  } catch (error: unknown) {
    console.error('[Recover] Full recovery error:', truncateErrorMsg(error));
    return c.json({ success: false, error: getErrorMessage(error), total: 0, recovered: 0, failed: 0, alreadyOK: 0, ossTransferred: 0, message: getErrorMessage(error) }, 500);
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

    // v6.0.173: deadline 50→40s
    const DEADLINE_MS = 40000;
    const startTime = Date.now();
    const isDeadlineNear = () => (Date.now() - startTime) > DEADLINE_MS;

    console.log(`[OSS-Batch] v6.0.131: Starting batch OSS transfer${filterSeriesId ? ` for series ${filterSeriesId}` : ''} with deadline...`);

    let query = supabase.from('video_tasks')
      .select('task_id, volcengine_task_id, video_url, thumbnail, generation_metadata')
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

    const needTransfer = (tasks || []).filter((t: VideoTaskRow) => t.video_url && !t.video_url.includes('.aliyuncs.com'));
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
        // v6.0.131+160: HEAD检查TOS URL过期——过期时尝试refreshUrlFn刷新而非直接跳过
        if (task.video_url.includes('volces.com') || task.video_url.includes('tos-cn')) {
          try {
            const headResp = await fetch(task.video_url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
            if (headResp.status === 403) {
              // v6.0.160: 不再直接跳过——让transferFileToOSS通过refreshUrlFn尝试获取新鲜URL
              console.log(`[OSS-Batch] ${task.task_id}: TOS URL expired (HEAD 403), will attempt refresh via Volcengine API`);
            }
          } catch { /* HEAD failed (timeout/network) — try transfer anyway */ }
        }
        // v6.0.160: 传入refreshUrlFn，TOS 403时自动查询Volcengine获取新鲜URL
        const vr = await transferFileToOSS(task.video_url, `videos/${task.task_id}.mp4`, 'video/mp4', makeVolcRefreshFn(task.volcengine_task_id));
        if (vr.transferred) {
          const upd: Record<string, unknown> = { video_url: vr.url, updated_at: new Date().toISOString() };
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
            } catch (e: unknown) { console.warn(`[OSS-Batch] Thumbnail transfer failed for ${task.task_id}:`, getErrorMessage(e)); }
          }

          transferred++;
          console.log(`[OSS-Batch] ✅ ${task.task_id} transferred`);
        }
      } catch (err: unknown) {
        errors++;
        console.warn(`[OSS-Batch] ❌ ${task.task_id} failed: ${getErrorMessage(err)}`);
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
      message: `批量转存完成(${elapsed}ms)：${transferred} 成功，${errors} 失败，${headSkipped} URL已过期跳过${skipped > 0 ? `，${skipped} 因超时跳过` : ''}`,
    });
  } catch (error: unknown) {
    console.error('[OSS-Batch] Error:', truncateErrorMsg(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

// ==================== [N] 作品缩略图同步 ====================

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

    // 2. 按 episodeNumber 分组，取每组第一个缩略图；并同步更新 storyboards
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
  } catch (error: unknown) {
    console.error('[Thumbnails] Sync error:', truncateErrorMsg(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

// ==================== [N] 作品进度和生成路由 ====================

app.get(`${PREFIX}/series/:id/batch-status`, async (c) => {
  try {
    const seriesId = c.req.param('id');
    // Use filter on JSONB column - generation_metadata->>'seriesId' = ?
    const { data, error } = await supabase.from('video_tasks')
      .select('task_id, status, video_url, thumbnail')
      .filter('generation_metadata->>seriesId', 'eq', seriesId);
    if (error) return c.json({ success: false, error: error.message }, 500);
    return c.json({ success: true, data: toCamelCase(data || []) });
  } catch (error: unknown) { console.error('[GET /series/:id/batch-status] Error:', error); return c.json({ success: false, error: getErrorMessage(error) }, 500); }
});

app.post(`${PREFIX}/series/:id/generate`, async (c) => {
  try {
    await supabase.from('series').update({ status: 'generating', updated_at: new Date().toISOString() }).eq('id', c.req.param('id'));
    return c.json({ success: true, message: 'Generation started' });
  } catch (error: unknown) { console.error('[POST /series/:id/generate] Error:', error); return c.json({ success: false, error: getErrorMessage(error) }, 500); }
});

// ==================== [N] AI 剧集生成（替代原503桩路由�� ====================
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
      return c.json({ success: false, error: seriesErr?.message || '作品不存在' }, 404);
    }

    console.log(`[AI] generate-episodes-ai: series=${seriesId}, totalEpisodes=${totalEpisodes}`);
    let episodeOutlines: EpisodeOutline[] = [];

    if (VOLCENGINE_API_KEY || ALIYUN_BAILIAN_API_KEY) {
      try {
        // v6.0.175: removed dead `prompt` variable (was superseded by `promptFixed` at v6.0.35)
        // v6.0.35+v6.0.176: 修复大纲prompt中Unicode乱码+统一转义风格（\\n→\n）
        const promptFixed = `你是一位专业的影视编剧。请根据以下信息，为作品创作${totalEpisodes}集的详细大纲。\n\n作品标题：${series.title}\n剧集简介：${series.description || '未提供'}\n${series.genre ? `类型：${series.genre}` : ''}\n${series.theme ? `主题：${series.theme}` : ''}\n\n请严格按以下JSON格式回复（不要包含markdown标记），返回一个数组：\n[{"episodeNumber":1,"title":"集标题","synopsis":"50-80字简介","growthTheme":"成长主题","keyMoments":["场景1","场景2"]}]\n\n要求：每集标题简洁有力，【最重要的规则】你的所有创作内容必须100%围绕上面给出的作品标题和简介来展开！禁止编造与标题和简介无关的故事。角色名、职业、背景必须与用户提供的标题/简介/类型保持�����。每一集的剧情都必须是用户给定主题的自������伸。`;
        // v6.0.176: orphaned line removed; second-half prompt rebuilt below with unified \n escaping
        const promptPart2 = [
          '',
          '',
          '要求：',
          '1. 每集标题简洁有力，必须与作品主题相关',
          '2. 故事线有递进和转折，前期建立世界观，中期发展冲突，后期走向高潮和结局',
          '3. 所有角色、事件、场景必须紧扣用户给定的标题「' + series.title + '」',
          '4. 如果用户提供了具体简介，每集剧情必须是该简介故事的具体展开',
        ].join('\n');
        const promptFinal = promptFixed + promptPart2;

        // v6.0.19: callAI 多模型路由（heavy tier — 多集大纲生成）
        const aiResult = await callAI({
          messages: [{ role: 'user', content: promptFinal }],
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
      } catch (aiErr: unknown) {
        console.warn('[AI] generate-episodes-ai: AI call failed:', truncateErrorMsg(aiErr));
      }
    }

    if (episodeOutlines.length === 0) {
      const titles = ['命运的开端','初次交锋','暗流涌动','转折点','真相初现','并肩作战','信任危机','绝地反击','最终决战','尘埃落定'];
      const synopses = ['主角登场，日常生活中遭遇意外事件，命运的齿轮开始转动。','主角面对第一个挑战，遇到重要配角。','暗中的势力浮出水面，事情远比想象中复杂。','关键信息揭露，信念受到动摇，需要做出重大抉择。','真相逐渐清晰，但新的危机在酝酿。','并肩作战，共同面对强敌，友情在战斗中升华。','信任遭受考验，必须独自面对���境。','绝境之中找到新的力量，开始反击。','终极对决，命运即将揭晓。','归于平静，完成成长，故事迎来结��。'];
      episodeOutlines = Array.from({ length: Math.min(totalEpisodes, 30) }, (_, i) => ({
        episodeNumber: i + 1,
        title: i < 10 ? titles[i] : `第${i + 1}集`,
        synopsis: i < 10 ? synopses[i] : `故事持续发展，新角色出场，情节逐步深入。`,
        growthTheme: '成长与蜕变',
        keyMoments: [`场景${i + 1}A`, `场景${i + 1}B`],
      }));
    }

    episodeOutlines = episodeOutlines.map((ep: EpisodeOutline, idx: number) => ({
      episodeNumber: ep.episodeNumber || ep.episode_number || idx + 1,
      title: ep.title || `第${idx + 1}集`,
      synopsis: ep.synopsis || ep.description || '',
      growthTheme: ep.growthTheme || ep.growth_theme || '成长',
      keyMoments: ep.keyMoments || ep.key_moments || [],
    }));

    await supabase.from('series_episodes').delete().eq('series_id', seriesId);

    // v6.0.78: 保存cliffhanger/previousEpisodeLink到key_moment（JSON编码后缀）
    const episodeRows = episodeOutlines.map((ep: EpisodeOutline) => {
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
  } catch (error: unknown) {
    console.error('[AI] generate-episodes-ai error:', truncateErrorMsg(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
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
    const sbCharBlock = (sbChars || []).map((ch: CharacterRow) => `${ch.name}(${ch.role}): ${ch.appearance || '标准外貌'}`).join('; ');

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
    const currentKM = (episode as Record<string, unknown>).key_moment as string || '';
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
    let sbOutlines: StoryboardOutline[] = [];

    if (VOLCENGINE_API_KEY || ALIYUN_BAILIAN_API_KEY) {
      try {
        // v6.0.15+v6.0.35: 增强prompt——角色/风格/邻集上下文+场景衔接+Seedance 2.0分镜优化+Unicode修复
        // NOTE: sbPrompt2 is immediately overwritten below, this initial value is a legacy placeholder
        let sbPrompt2: string = '';
        // (legacy initial prompt removed — overwritten below by v6.0.78 prompt)
        void `你是一位��业的影视分镜师，擅长为AI视频生成引擎编写高质量分镜。请为以下剧集创作${sceneCount}个分镜场景。\n\n作品标题：${series?.title || '未知'}\n剧集标题：${episode.title}\n剧集简介：${episode.synopsis || '未提供'}\n\n请严格按以下JSON格式回复（不要包含markdown标记），返回一个数组：\n[{"sceneNumber":1,"description":"场景详细描述(50-100字,含主体外貌+连续动作+环境+光影)","dialogue":"角色对话","location":"场景地点","timeOfDay":"早晨/上午/中午/下午/傍晚/夜晚","cameraAngle":"近景/中景/远景/全景/特写/俯拍/仰拍","duration":8,"emotionalTone":"情感基调"}]`;
        // v6.0.15: 追加角色、风格、邻集上下文 + 场景衔接要求
        // v6.0.35→v6.0.36: 覆盖修复Unicode乱码+注入专业视听语言知识
        // v6.0.78: 重写分镜prompt——强化衔接+角色一致性+characters字段
        sbPrompt2 = `你是一位${sbPtInfo.label}级别的专业分镜师兼摄影指导，精通视听语言理论，擅长为AI视频生成引擎编写电影级分镜。请为以下剧集创作${sceneCount}个分镜场景。\n\n作品标题：${series?.title || '未知'}\n剧集标题：${episode.title}\n剧集简介：${episode.synopsis || '未提供'}\n\n请严格按以下JSON格式回复（不要包含markdown标记），返回一个数组：\n[{"sceneNumber":1,"description":"场景详细描述(50-100字,含主体外貌+连续动作+环境+光影)","dialogue":"角色全名：对话内容(每场景必填2-3句推动剧情的对话,格式如:林小雨：我不会放弃的\\n张明：你确定吗)","location":"场景地点","timeOfDay":"早晨/上午/中午/下午/傍晚/夜晚","cameraAngle":"近景/中景/远景/全景/特写/俯拍/仰拍","characters":["本场景出场角色全名1","角色全名2"],"duration":10,"emotionalTone":"情感基调","transitionFromPrevious":"与上一场景的镜头衔接(第1个场景写开场)","endingVisualState":"本场景结束时画面状态(20字)"}]`;
        // v6.0.112: 修复sbPrompt2内残留的Unicode乱码（剧集标题/出场角色）
        sbPrompt2 = sbPrompt2.replace(/\\n.{1,6}集标题：/, '\\n剧集标题：').replace(/本场景出.{1,6}角色全名1/, '本场景出场角色全名1');
        const extraCtx: string[] = [];
        // v6.0.36: 注入专业景别编排知识+蒙太奇技法
        extraCtx.push(`\n【景别编排节奏】场景cameraAngle须形成变化：开场远景→中景互动→中近景情感→特写高潮→中景推进→远景收尾。禁止连续3场景相同景别。蒙太奇：对比(明暗对比)/平行(双线��叉)/隐喻(笼中鸟暗喻束缚)。`);
        if (sbCharBlock) extraCtx.push(`\n【角色外貌卡】${sbCharBlock}`);
        if (sbStyleGuide) extraCtx.push(`\n【视觉风格】${sbStyleGuide.substring(0, 300)}`);
        else if (sbBaseStyle) extraCtx.push(`\n【画面风格】${sbBaseStyle}`);
        if (prevEpCtx) extraCtx.push(`\n【前集回顾】${prevEpCtx}`);
        if (nextEpCtx) extraCtx.push(`\n【后集预告】${nextEpCtx}`);
        // v6.0.78: 注入当前集承接说明（从key_moment META中提取）
        if (currentEpLink) extraCtx.push(`\n【本集开头承接】${currentEpLink}——第1个场景必须体现这一衔接`);
        // v6.0.20: 大幅强化场景连贯性要求
        extraCtx.push(`\n【场景连贯性——最高优先级要求】
1. ���色一致性：同一角色在所有场景中服装/发型/配饰/体型必须完全一致，描述中必须出现具体角色名和完整外貌特征（不可用"他""她"代替）
2. 环境连续性：同一地点的场景，环境细节（天气/光线/家具/陈设/季节）必须保持一致；转换地点时必须描述转场过程
3. 时间连续性：注明每个场景的时段（早晨/上午/中午/下午/傍晚/夜晚），相邻场景时间必须合理衔接，禁止无理由跳跃
4. 情感过渡：情感基调变化必须渐进（如平静→好奇→紧张→恐惧），禁止跳跃式突变
5. 动作连贯：上一场景角色"走向门口"，下一场景必须从"推开门"或"门外"开始，禁止空间跳跃
6. 视觉构图递进：镜头语言应有节奏感——远景建立环境→中景交代人物→近景推进情感→特写强化冲突，避免连续相同机位
7. 对话角色锁定：dialogue字段必须标注说话者角色名（格式："角色名：对话内容"），同一角色的语气/口头禅必须前后一致，禁止张冠李戴
8. 角色出场追踪：每个场景的description必须明确列出该场景中出场的所有角色全名及其当前动作/位置，禁止用代词模糊指代`);
        // v6.0.34: Seedance 2.0 视频生成优化——指导AI写出更适合视频引擎的分镜描述
        extraCtx.push(`\n【视��生成优化——description写法指南】\n1. 结构：「主体外貌特征 + 连续动作(3-4步) + 场景环境 + 光影氛围」\n2. 动作拆解示例：不写"她跳舞"，写"她右脚轻点地面→身体缓缓旋转→裙摆随惯性展开→双臂向两侧舒展"\n3. 光���必写：每个场景必须包含光源描述（如"窗外暖阳斜射""头顶日光灯冷白光""街边霓虹灯红蓝交替"）\n4. 禁止抽象词：不写"激烈战斗"写"右拳挥出→对方侧身闪避→回身一脚踢向腰部→对方后退两步撞上墙壁"`);
        // v6.0.112: 修复description写法指南条目的Unicode乱码（指南/氛围）
        extraCtx[extraCtx.length - 1] = `\n【视频生成优化——description写法指南】\n1. 结构：「主体外貌特征 + 连续动作(3-4步) + 场景环境 + 光影氛围」\n2. 动作拆解示例：不写"她跳舞"，写"她右脚轻点地面→身体缓缓旋转→裙摆随惯性展开→双臂向两侧舒展"\n3. 光影必写：每个场景必须包含���源描述（如"窗外暖阳斜射""头顶日光灯冷白光""街边霓虹灯红蓝交替"）\n4. 禁止抽象词：不写"激烈战斗"写"右拳挥出→对方侧身闪避→回身一脚踢向腰部→对方后退两步撞上墙壁"`;
        if (prevEpCtx) extraCtx.push(`\n第1个场景必须衔接上一集结尾——描述中明���体现从上集最后画面过渡到本集开场的衔接。`);
        // v6.0.69: 反重复+中国审美+角色语言个性化
        extraCtx.push(`\n【严禁重复——红线规则】\n1. 不同场景的description禁止出现相同或近似的动作描写或情节，每个场景必须推进新剧情事件\n2. dialogue中同一角色不可在不同场景说出含义相似的话，禁止车轱辘对话\n3. 同集内禁止出现相同location+相同动作的场景组合\n4. 如果上一场景是对话推进，下一场景必须是行动/事件而非再��对话`);
        extraCtx.push(`\n【中国审美与价值观】\n1. 人物形象精致优美：五官端正比例协调、气质自然不夸张、衣着得体有品位\n2. 场景环境美观：注重构图美感、色彩和谐、光影层次\n3. 情节传递正向价值：勇气/善良/成长/责任/家国情怀\n4. 角色语���得体：符合角色身份和年龄，避免不符合国情的表达方式`);
        // v6.0.63: 对白匹配+角色出场追踪规则
        extraCtx.push(`\n【对话与角色匹配——严格要求】\n1. dialogue字段中每句对话必须标明说话者全名（格式："陈世美：我是冤枉的"），禁止无名对话\n2. dialogue中出现的角色必须在同一场景的description中已明确出场，禁止幽灵角色说话\n3. 同一角色的语气/称谓/口头禅必须全���一致\n4. 多角色对话场景必须在description中交代所有参与者的位置和朝向`);
        // v6.0.84: dialogue必填强制规则
        extraCtx.push(`\n【对白必填——核心要求】dialogue字段严禁为空！每个场景至少2-3句角色对话，对话须推动剧情、揭示性格或制造冲突。唯一例外：纯动作追逐场景可写"角色名：(内心)独白内容"。`);
        sbPrompt2 += extraCtx.join('');
        // v6.0.19: callAI 多模型路由（heavy tier — 分镜创作）
        // v6.0.84: max_tokens 6000→7000（单集6场景+必填对话增���输出量）
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
      } catch (aiErr: unknown) {
        console.warn('[AI] generate-storyboards-ai: AI call failed:', truncateErrorMsg(aiErr));
      }
    }

    if (sbOutlines.length === 0) {
      const tpls: { desc: string; cam: string; tone: string }[] = [
        { desc: '开场画面，建立场景氛围', cam: '远景', tone: '期待' },
        { desc: '角色登场，展现人物状态', cam: '中景', tone: '自然' },
        { desc: '关键对话，推动剧情', cam: '中近景', tone: '认真' },
        { desc: '冲突或转折发生', cam: '特写', tone: '紧张' },
        { desc: '展现人物状态', cam: '中景', tone: '自然' },
        { desc: '关键对话，推动剧情', cam: '中近景', tone: '认真' },
        { desc: '冲突或转折发生', cam: '特写', tone: '紧张' },
        { desc: '角色做出选择', cam: '中景', tone: '坚定' },
        { desc: '行动场景', cam: '中景', tone: '激动' },
        { desc: '高潮时刻', cam: '特写', tone: '震撼' },
        { desc: '本集结尾', cam: '远景', tone: '余韵' },
      ];
      // v6.0.112: 修复tpls[2]描述中的Unicode乱码（关键→关键）
      tpls[2].desc = '关键对话，推动剧情';
      // v6.0.160: 运行时修复tpls中所有含U+FFFD的desc字段
      for (const t of tpls) {
        if (t.desc && /\uFFFD/.test(t.desc)) {
          t.desc = t.desc.replace(/\uFFFD+/g, '');
        }
      }
      sbOutlines = Array.from({ length: Math.min(sceneCount, 12) }, (_, i) => {
        const t = tpls[i % tpls.length];
        return { sceneNumber: i + 1, description: `${episode.title} - 场景${i + 1}：${t.desc}`, dialogue: '', location: '', timeOfDay: i < sceneCount / 2 ? '白天' : '夜晚', cameraAngle: t.cam, duration: 10, emotionalTone: t.tone };
      });
    }

    await supabase.from('series_storyboards').delete().eq('series_id', episode.series_id).eq('episode_number', episode.episode_number);

    // v6.0.78: 保存characters字段+transitionFromPrevious到generation_metadata
    const sbRows = sbOutlines.map((sb: StoryboardOutline, idx: number) => ({
      series_id: episode.series_id, episode_number: episode.episode_number,
      scene_number: sb.sceneNumber || sb.scene_number || idx + 1,
      description: sb.description || `场景${idx + 1}`, dialogue: sb.dialogue || '',
      characters: sb.characters || [],
      location: sb.location || '', time_of_day: sb.timeOfDay || sb.time_of_day || '',
      camera_angle: sb.cameraAngle || sb.camera_angle || '中景',
      duration: sb.duration || 10, emotional_tone: sb.emotionalTone || sb.emotional_tone || '', status: 'draft',
    }));

    // v6.0.160: Protect scenes with existing videos from overwrite
    let sbRowsFiltered = sbRows;
    const { data: existingVideoSbs } = await supabase.from('series_storyboards')
      .select('scene_number, video_url')
      .eq('series_id', episode.series_id)
      .eq('episode_number', episode.episode_number)
      .not('video_url', 'is', null);
    if (existingVideoSbs && existingVideoSbs.length > 0) {
      const protectedScenes = new Set(
        existingVideoSbs.filter((s: StoryboardRow) => s.video_url && s.video_url.startsWith('http')).map((s: StoryboardRow) => s.scene_number)
      );
      if (protectedScenes.size > 0) {
        sbRowsFiltered = sbRows.filter((r) => !protectedScenes.has(r.scene_number));
        console.log(`[AI] generate-storyboards-ai: ⚠️ PROTECTED ${sbRows.length - sbRowsFiltered.length} scenes with existing videos`);
      }
    }

    const { data: insertedSbs, error: sbInsertErr } = await supabase.from('series_storyboards').upsert(sbRowsFiltered, { onConflict: 'series_id,episode_number,scene_number' }).select();
    if (sbInsertErr) {
      console.error('[AI] generate-storyboards-ai: DB upsert error:', sbInsertErr.message);
      return c.json({ success: false, error: `数据库写入失败: ${sbInsertErr.message}` }, 500);
    }

    console.log(`[AI] generate-storyboards-ai: Created ${insertedSbs?.length || 0} storyboards (${sbRows.length - sbRowsFiltered.length} protected)`);
    return c.json({ success: true, data: toCamelCase(insertedSbs || []), count: insertedSbs?.length || 0, fallback: !ALIYUN_BAILIAN_API_KEY });
  } catch (error: unknown) {
    console.error('[AI] generate-storyboards-ai error:', truncateErrorMsg(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

app.post(`${PREFIX}/series/:id/generate-full-ai`, async (c) => {
  // v6.0.158: Hoist termination-protection variables OUTSIDE try block so catch can access them
  // (v6.0.142-147 declared them inside try → ReferenceError in catch due to let block scoping)
  let _generationCompleted = false;
  let _allBatchesWritten = false;
  let _cleanupHandler: (() => void) | null = null;
  try {
    const seriesId = c.req.param('id');
    const body = await c.req.json();

    // v6.0.75: 增加 status + updated_at 用于幂等性防护
    // v6.0.143: 增加 generation_progress 用于区分"创建路由预设generating"和"真正在生成中"
    const { data: series, error: seriesErr } = await supabase
      .from('series').select('id, title, description, genre, style, theme, total_episodes, coherence_check, story_outline, status, updated_at, generation_progress').eq('id', seriesId).maybeSingle();
    if (seriesErr || !series) return c.json({ success: false, error: seriesErr?.message || '作品不存在' }, 404);

    // v6.0.94: 幂等性防护窗口 3分钟→10分钟（每批次AI+retry需~3min，防止双批次~6min内被误判为卡住）
    // v6.0.75原始逻辑：3分钟内的generating状态阻止重复请求
    // v6.0.115: forceRetry=true 时跳过幂等性检查（修复: retrySeries先更新updated_at→generate-full-ai看到fresh updated_at→静默BLOCK→重试永远不生效）
    // v6.0.143: 修复 v6.0.87 竞态——创建路由预设status='generating'但不设generation_progress
    //           → 首次generate-full-ai被幂等性守卫误拦截 → episodes永远不生成 → 显示0/0集
    //           修复: generation_progress为null说明updateProgress从未调用过（无真正生成进程），放行
    const forceRetry = body.forceRetry === true;
    if (series.status === 'generating' && !forceRetry) {
      const hasActiveGeneration = series.generation_progress != null;
      if (hasActiveGeneration) {
        const updatedAt = series.updated_at ? new Date(series.updated_at).getTime() : 0;
        const elapsedMs = Date.now() - updatedAt;
        if (elapsedMs < 10 * 60 * 1000) {
          console.warn(`[AI] generate-full-ai: BLOCKED duplicate request for series=${seriesId} (status=generating, progress=${JSON.stringify(series.generation_progress)?.substring(0, 80)}, updated ${Math.round(elapsedMs / 1000)}s ago)`);
          return c.json({ success: true, data: { message: '生成任务已在进行中，请等待完成', alreadyGenerating: true }, alreadyGenerating: true });
        }
        // 超过10分钟的generating状态视为卡住，允许重新生成
        console.warn(`[AI] generate-full-ai: Stale generating status for series=${seriesId} (${Math.round(elapsedMs / 1000)}s old), allowing re-generation`);
      } else {
        // v6.0.143: generation_progress 为 null → 创建路由预设了 generating 但尚未有真正的生成进程
        console.log(`[AI] generate-full-ai: series=${seriesId} has status=generating but NO generation_progress — first call after creation, allowing`);
      }
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
    // v6.0.192: 用户上传的参考素材
    const referenceAssets: Array<{ url: string; type: string; name: string; tag?: string }> = series.coherence_check?.referenceAssets || [];
    const hasRefAssets = referenceAssets.length > 0;
    // v6.0.192: 合并所���图片URL用于多模态AI视觉分析（最多5张，避免token爆炸）
    const _refImageUrls: string[] = [];
    if (referenceImageUrl) _refImageUrls.push(referenceImageUrl);
    for (const asset of referenceAssets) {
      if (asset.type === 'image' && asset.url && !_refImageUrls.includes(asset.url)) {
        _refImageUrls.push(asset.url);
      }
    }
    const multimodalImageUrls = _refImageUrls.slice(0, 5);
    console.log(`[AI] generate-full-ai: series=${seriesId}, title=${series.title}, totalEpisodes=${totalEpisodes}, style=${seriesStyle}, prodType=${productionType}${referenceImageUrl ? ', hasRefImage=true' : ''}${hasRefAssets ? `, refAssets=${referenceAssets.length}` : ''}${multimodalImageUrls.length > 1 ? `, multimodalImgs=${multimodalImageUrls.length}` : ''}`);

    // 🔥 v5.2.0: 写入实时进度，前端轮询 GET /series/:id 可读取
    // 降级保护：如果 generation_progress 列不存在，仅更新 status
    const updateProgress = async (currentStep: number, totalSteps: number, stepName: string, extra?: Record<string, unknown>) => {
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
      } catch (e: unknown) {
        console.warn(`[AI] generate-full-ai: progress update exception (step ${currentStep}):`, getErrorMessage(e));
      }
    };

    await updateProgress(0, 6, '准备中...');

    // v6.0.142: Edge Function 终止保护——注册 beforeunload 监听器
    // 当 Supabase Edge Function 达到 wall-clock 限制被终止时，Deno 会触发 beforeunload 事件
    // 利用此事件将 series 状态标记为 failed，避免永久卡在 'generating'
    // v6.0.158: _generationCompleted, _allBatchesWritten, _cleanupHandler declarations hoisted before try block
    _cleanupHandler = () => {
      if (_generationCompleted) return;
      // v6.0.147: if all batches were written to DB, set 'draft' not 'failed'
      const _termStatus = _allBatchesWritten ? 'draft' : 'failed';
      console.warn(`[AI] generate-full-ai: ⚠️ Edge Function terminating! Writing status='${_termStatus}' for series=${seriesId} (allBatchesWritten=${_allBatchesWritten})`);
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      if (supabaseUrl && serviceKey) {
        fetch(`${supabaseUrl}/rest/v1/series?id=eq.${seriesId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}`, 'apikey': serviceKey, 'Prefer': 'return=minimal' },
          keepalive: true,
          body: JSON.stringify({
            status: _termStatus,
            generation_progress: _allBatchesWritten
              ? { currentStep: 6, totalSteps: 6, stepName: '生成完成(超时前已写入)', completedAt: new Date().toISOString() }
              : { currentStep: 0, totalSteps: 6, stepName: 'Edge Function 执行超时', error: 'Edge Function wall-clock timeout — 生成管线被强制终止。请点击"重新创作"重试。', failedAt: new Date().toISOString() },
            updated_at: new Date().toISOString(),
          }),
        }).catch(() => { /* best-effort */ });
      }
    };
    globalThis.addEventListener('beforeunload', _cleanupHandler);

    // v6.0.149: Continuation mode — when episodes already exist (e.g. after timeout/crash),
    // skip Steps 1-4 and only generate storyboards for episodes that don't have them yet.
    let _continuationMode = false;
    let _contEpOutlines: EpisodeOutline[] = [];
    let _contCharRows: Record<string, unknown>[] = [];
    let _contCreatedChars: CharacterRow[] | undefined;
    let _contCreatedEpisodes: EpisodeRow[] | undefined;
    let _contVisualStyleGuide = '';
    let _contEpFilter: Set<number> | null = null;
    // v6.0.150: Track existing scene_numbers per episode to skip them during upsert
    let _contExistingScenes: Map<number, Set<number>> | null = null;
    // v6.0.151: Full scene data for prompt context — AI sees existing scenes and only generates missing ones
    let _contExistingSceneData: Map<number, Array<{ scene_number: number; description: string; dialogue: string; characters: string[] | string; location: string; time_of_day: string; camera_angle: string; emotional_tone: string }>> | null = null;

    try {
      const { data: existingEps } = await supabase.from('series_episodes')
        .select('*')
        .eq('series_id', seriesId)
        .order('episode_number', { ascending: true });

      if (existingEps && existingEps.length > 0) {
        // v6.0.175: parallelize storyboards + characters fetch (independent queries)
        const [{ data: existingSbs }, { data: existingChars }] = await Promise.all([
          supabase.from('series_storyboards')
            .select('episode_number, scene_number, description, dialogue, characters, location, time_of_day, camera_angle, emotional_tone')
            .eq('series_id', seriesId)
            .order('episode_number', { ascending: true })
            .order('scene_number', { ascending: true }),
          supabase.from('series_characters').select('*').eq('series_id', seriesId),
        ]);
        const sbCountByEp = new Map<number, number>();
        // v6.0.150: Also collect scene_numbers per episode for scene-level filtering
        const sbScenesByEp = new Map<number, Set<number>>();
        // v6.0.151: Collect full scene data per episode for prompt context injection
        const sbDataByEp = new Map<number, Array<{ scene_number: number; description: string; dialogue: string; characters: string[] | string; location: string; time_of_day: string; camera_angle: string; emotional_tone: string }>>();
        for (const sb of (existingSbs || [])) {
          sbCountByEp.set(sb.episode_number, (sbCountByEp.get(sb.episode_number) || 0) + 1);
          if (!sbScenesByEp.has(sb.episode_number)) sbScenesByEp.set(sb.episode_number, new Set());
          sbScenesByEp.get(sb.episode_number)!.add(sb.scene_number);
          // v6.0.151: Store full scene data
          if (!sbDataByEp.has(sb.episode_number)) sbDataByEp.set(sb.episode_number, []);
          sbDataByEp.get(sb.episode_number)!.push({
            scene_number: sb.scene_number,
            description: sb.description || '',
            dialogue: sb.dialogue || '',
            characters: sb.characters || [],
            location: sb.location || '',
            time_of_day: sb.time_of_day || '',
            camera_angle: sb.camera_angle || '',
            emotional_tone: sb.emotional_tone || '',
          });
        }
        // v6.0.149: Also catch partial storyboard episodes (e.g. 3/6 scenes written before crash)
        const CONT_EXPECTED_SCENES = 6; // matches scenesPerEp defined later
        const epsNeedingSb = existingEps.filter(ep => (sbCountByEp.get(ep.episode_number) || 0) < CONT_EXPECTED_SCENES);
        // existingChars already fetched in parallel above (v6.0.175)

        if (epsNeedingSb.length > 0 && existingChars && existingChars.length > 0) {
          _continuationMode = true;
          _contEpFilter = new Set(epsNeedingSb.map(ep => ep.episode_number));
          _contExistingScenes = sbScenesByEp; // v6.0.150: scene-level skip map
          _contExistingSceneData = sbDataByEp; // v6.0.151: full scene data for prompt context
          _contEpOutlines = existingEps.map(ep => {
            // v6.0.149: Parse META suffix from key_moment to recover cliffhanger/previousEpisodeLink
            // (Step 4 encodes them as `||META:{...}` suffix in key_moment field)
            const metaMatch = ep.key_moment?.match(/\|\|META:(.+)$/);
            let meta: Record<string, string> = {};
            try { if (metaMatch) meta = JSON.parse(metaMatch[1]); } catch { /* ignore parse error */ }
            const cleanKeyMoment = ep.key_moment ? ep.key_moment.replace(/\s*\|\|META:.+$/, '') : '';
            return {
              episodeNumber: ep.episode_number, title: ep.title, synopsis: ep.synopsis,
              growthTheme: ep.growth_theme,
              keyMoments: cleanKeyMoment ? cleanKeyMoment.split('; ').filter(Boolean) : [],
              cliffhanger: meta.cliffhanger || '',
              previousEpisodeLink: meta.previousEpisodeLink || '',
            };
          });
          _contCharRows = existingChars.map(ch => ({
            series_id: seriesId, name: ch.name, role: ch.role,
            description: ch.description, appearance: ch.appearance, personality: ch.personality,
          }));
          _contCreatedChars = existingChars;
          _contCreatedEpisodes = existingEps;
          _contVisualStyleGuide = series.coherence_check?.visualStyleGuide || '';
          // v6.0.150: Log existing scene counts for scene-level skip visibility
          const existingSceneSummary = epsNeedingSb.map(ep => `E${ep.episode_number}:${sbScenesByEp.get(ep.episode_number)?.size || 0}/6`).join(',');
          console.log(`[AI] generate-full-ai: CONTINUATION MODE — ${existingEps.length} episodes exist, ${epsNeedingSb.length}/${existingEps.length} need storyboards [${existingSceneSummary}], ${existingChars.length} characters ready. Skipping Steps 1-4.`);
          await updateProgress(4, 6, `续接模式：${existingEps.length}集已存在，${epsNeedingSb.length}集需要生成分镜...`);
        } else if (epsNeedingSb.length === 0 && existingSbs && existingSbs.length > 0) {
          console.log(`[AI] generate-full-ai: All ${existingEps.length} episodes already have storyboards ��� marking completed`);
          _generationCompleted = true;
          globalThis.removeEventListener('beforeunload', _cleanupHandler);
          await supabase.from('series').update({
            status: 'completed',
            generation_progress: { currentStep: 6, totalSteps: 6, stepName: '创作完成(续接检测)', completedAt: new Date().toISOString() },
            updated_at: new Date().toISOString(),
          }).eq('id', seriesId);
          return c.json({ success: true, data: { message: '所有分集已有分镜，标记为完成', continuationComplete: true } });
        }
      }
    } catch (contErr: unknown) {
      console.warn('[AI] generate-full-ai: Continuation check failed, proceeding with full generation:', getErrorMessage(contErr));
    }

    // v6.0.149: Declare variables used across Steps 1-5 (must be in scope for both normal and continuation paths)
    let visualStyleGuide = '';
    const baseStylePrompt = STYLE_PROMPTS[seriesStyle] || STYLE_PROMPTS.realistic;

    // v6.0.149: Hoist variable declarations — used by both normal (Steps 1-4) and continuation paths
    let episodeOutlines: EpisodeOutline[] = [];
    let characterRows: Record<string, unknown>[] = [];
    let createdChars: CharacterRow[] | undefined;
    let createdEpisodes: EpisodeRow[] | undefined;

    // v6.0.159: Hoist creativeSeed to outer scope — used by both episode outline (Step 1-2) and storyboard (Step 5) prompts
    const creativeSeed = getCreativeSeed(seriesId);
    console.log(`[AI] generate-full-ai: Creative seed — archetype=${creativeSeed.archetype.substring(0, 20)}, motif=${creativeSeed.motif.substring(0, 15)}, cultural=${creativeSeed.cultural.substring(0, 15)}`);

    // v6.0.149: Skip Steps 1-4 in continuation mode (episodes/characters/style already exist)
    if (!_continuationMode) {
    // ===== Steps 1+2 并行: 剧集大纲 + 角色（互不依赖，并行省~60s） =====
    // v6.0.93: 原串行流程约需 120s(大纲)+60s(角色)=180s；并行后关键路径仅120s
    await updateProgress(1, 6, '正在并行生成剧集大纲与角色...');

    // --- 构建大纲 prompt（与原Step1完全一致）---
    // v6.0.149: episodeOutlines/characterRows/createdChars/createdEpisodes hoisted above if-block

    const ptLabel = (PRODUCTION_TYPE_PROMPTS[productionType] || PRODUCTION_TYPE_PROMPTS.short_drama).label;
    const ptNarrative = (PRODUCTION_TYPE_PROMPTS[productionType] || PRODUCTION_TYPE_PROMPTS.short_drama).narrativeStyle;

    // v6.0.90: 品牌/产品宣传片判断——提升到if块外部供后续兜底逻辑使用
    // v6.0.191: 与前端 isPromoType() 保持一致，包含 advertisement 类型
    const _isPromoType = productionType === 'brand_promo' || productionType === 'product_promo' || productionType === 'advertisement';

    if (VOLCENGINE_API_KEY || ALIYUN_BAILIAN_API_KEY) {
      // v6.0.93: Promise.all 并行执行大纲生成 + 角色生成
      // v6.0.157: 参考图通过多模态视觉直接注入（模型能"看"到图片），prompt提示相应升级
      const refImgHintText = referenceImageUrl ? `\n【参考图分析——已附在消息中】请仔细观察参考图中的人物形象，提取：(a)面部五官风格与比例 (b)发型发色特征 (c)服饰风格与色彩搭配 (d)整体气质与年龄段，以此作为角色外貌设计的核心参考基准。所有角色的视觉风格应与参考图保持统一美学。` : '';

      // v6.0.159: 角色生成prompt全面升级——注入心理学深度+角色悖论+独特语言指纹
      // v6.0.90: 品牌/产品宣传片使用代言人/展示者角色
      // v6.0.190: 宣传片角色改为可选——AI自行判断是否需要出镜人物（行业主流宣传片很多是纯视��驱动无���物的）
      const _promoCharPrompt = [
        `你是一位世界顶级${ptLabel}视觉总监。请根据以下宣传片内容，判断是否需要出镜人物。`,
        ``, `作品标题：${series.title}`, `作品简介：${series.description || '未提供'}`,
        series.story_outline ? `创意描述：${(series.story_outline || '').substring(0, 400)}` : '',
        ``,
        `【重要判断规则】`,
        `行业主流品牌/产品宣传片有两种模式：`,
        `A. 纯视觉驱动型（无出镜人物）：以产品特写、品牌意象、航拍、延时摄影、文字排版、旁白为主。适用于：科技产品发布、品牌形象片、抽象概念宣传等。`,
        `B. 人物驱动型（有出镜人物）：以品牌代言人、用户故事、创始人叙事为主。适用于：人文关怀类、用户证言、品牌故事等。`,
        ``,
        `请先分析上述内容属于哪种模式。`,
        `- 如果属于A型（纯视觉驱动），返回空数组：[]`,
        `- 如果属于B型（人物驱动），设计1-3个出镜人物。`,
        ``,
        `严格按JSON格式回复（不要markdown），返回数组（可为空）：`,
        `[{"name":"人物称谓(如品牌创始���/年轻用户/工匠师傅)","role":"protagonist|supporting","description":"人物身份与场景定位(50-80字)","appearance":"外貌特征(60-100字,精确年龄/身高体型/发型发色/瞳色/肤色/面部五官/服装——要与品牌调性匹配)","personality":"气质与表现方式(30-50字)","relationships":"与品牌产品的关系(20-40字)"}]`,
        refImgHintText,
        `【如果需要人物，遵守以下要求】`,
        `1. 人物形象必须与品牌调性一致，外貌精致优美符合当代中国主流审美`,
        `2. 面部特征锁定：全片保持100%一致，服装搭配体现品牌色彩体系`,
        `3. 人物必须与标题「${series.title}」完全匹配`,
      ].filter(Boolean).join('\n');
      const charPromptLines = _isPromoType ? _promoCharPrompt.split('\n') : [
        `你是一位融合了鲁迅刻画灵魂、莎士比亚构建悲剧人物、宫崎骏塑造温度的角色设计大师。你深信：伟大的角色不是被"创造"出来的，而是被"发现"的——他们早已存在于故事的必然性中。`,
        ``, `作品标题：${series.title}`, `剧集简介：${series.description || '未提供'}`,
        series.genre ? `类型：${series.genre}` : '', series.theme ? `主题：${series.theme}` : '',
        series.story_outline ? `故事大纲：${(series.story_outline || '').substring(0, 400)}` : '',
        ``, `请设计3-5个让观众"忘不掉"的角色。严格按JSON格式回复（不要markdown），返回数组：`,
        `[{"name":"角色名(必须有文化厚度:可引经据典/谐音双关/暗含��运线索,如'顾望舒'取自戴望舒的雨巷)","role":"protagonist|supporting|antagonist","description":"角色心理画像(100-150字,必须包含:①职业与社会处境 ②童年关键创伤或温暖记忆(具体到某个画面) ③核心动机(他最想得到什么) ④致命弱点(他最怕失去什么) ⑤角色悖论(表面vs真实——如表面冷漠实则极度害怕被抛弃) ⑥道德灰区(他做过的最有争议的一件事))","appearance":"外貌特征(60-100字,必须包含精确年龄/身高体型/发型发色含刘海方向/瞳色/肤色/面部五官特征/面部微特征如痣疤位置或明确写无痣无疤/标志性服装不超过2套/标志性配饰——外貌要暗示性格:如常咬嘴唇暗示焦虑,永远穿长袖暗示藏���什么)","personality":"语言指纹与行为密码(40-60字,必须包含:①独特的说话节奏如总是先沉默3秒再回答/喜欢用反问句 ②口头禅或标志性小动作如紧张时转笔/说谎时摸耳朵 ③情绪失控时的表现如愤怒时反而��/难过时会去跑步 ④只有他会说的那种话如用食物比喻一切)","relationships":"角色关系网(30-50字,不止��关系标签,要写关系中的暗流——如:与XX表面是师徒实则她怀疑XX害死了父���/对XX有愧疚因为当年见死不救)"}]`,
        refImgHintText, ``, `【��色设计的灵魂铁律】`,
        `1. 【名字即命运】角色名必须有讲究——可以藏典故(如"陆离"出自"光怪陆离")、暗示结局(如"归雁"注定要离开)、体现身份(如"钱进"讽刺拜金)。严禁路人甲式随意取名`,
        `2. 【角色悖论必填】每个角色必须有一个让观众"又爱又恨"的矛盾点——好人的自私面/坏人的柔软面/强者的脆弱面。纯好人和纯坏人都是失败的角色设计`,
        `3. 【语言指纹唯一性】读对话就能猜出是谁说的——学者角色引用诗文/底层角色说方言俚语/压抑角色话少但每句都重/话痨角色用废话掩饰不安。严禁所有角色说话方式雷同`,
        `4. 【外貌叙事化】外貌不是购物清单而是性格的外化——驼背暗示压力/总穿黑色暗示封闭/戴帽子暗示躲藏。视觉锚点(每角色至少2个独特标识)让AI视频能区分���色`,
        `5. 【关系暗流】角色间的关系不是简单标签而是一条条暗河——表面的客气下藏着嫉妒、恩情下藏着亏欠、信任下藏着秘密。至少设计2对"看似A实则B"的关系`,
        `6. 【面部微特征锁定】痣/疤痕/胎记/酒窝的位置必须精确(如"右嘴角上方1cm小痣")或明确写"面部无痣无���"——全剧位置100%一致`,
        `7. 【审美基准】角色形象精致优美符合当代中国主流审美:五官端正比例协调,气质自然不夸张;但美的类型要多样——不是所有人都是标准美人,有人美在气质,有人美在眼神,有人美在笑容`,
        `8. 角色名字、职业、背景必须与标题「${series.title}」和简介完全匹配，禁止创作与主题无关的角色`,
      ].filter(Boolean).join('\n');
      try {
        const epGenPromptFixed = buildEpisodeOutlinePrompt({ ptLabel, ptNarrative, totalEpisodes, series, creativeSeed });
        // v6.0.93: parallel episode outlines + characters generation
        // Clear old character data before parallel execution (retry-safe)
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
          // v6.0.157: 有参考图时启用多模态视觉——seed-2-0-pro直接"看"参考图来设计匹配的角色外貌
          callAI({
            messages: [{ role: 'user', content: charPromptLines }],
            tier: 'medium',
            temperature: 0.8,
            max_tokens: 3000,
            timeout: 60000,
            ...(multimodalImageUrls.length > 0 ? { imageUrls: multimodalImageUrls } : {}),
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
            characterRows = chars.map((ch: AIParsedCharacter) => ({
              series_id: seriesId,
              name: ch.name || '未命名角色',
              role: ['protagonist', 'supporting', 'antagonist', 'mentor', 'extra'].includes(ch.role || '') ? ch.role : 'supporting',
              description: `${ch.description || ''}${ch.relationships ? '。关系：' + ch.relationships : ''}`,
              appearance: ch.appearance || '',
              personality: ch.personality || '',
            }));
          } catch { console.warn('[AI] generate-full-ai: Character JSON parse failed, using fallback'); }
        } else {
          console.warn('[AI] generate-full-ai: Character AI call failed:', truncateErrorMsg(charResult.reason));
        }

        // v6.0.190: 角色兜底——宣传片允许0角色（纯视觉驱动型），非宣传片保留3角色兜底
        if (characterRows.length === 0 && !_isPromoType) {
          characterRows = [
            { series_id: seriesId, name: '主角', role: 'protagonist', description: '故事的主人公，怀揣梦想的年轻人', appearance: '20岁左右，精神饱满，目光坚定', personality: '勇敢、坚韧、善良' },
            { series_id: seriesId, name: '挚友', role: 'supporting', description: '主角最信任的伙伴，总在关键时刻伸出援手', appearance: '与主角同龄，性格开朗，笑容爽朗', personality: '忠诚、幽默、热心' },
            { series_id: seriesId, name: '导师', role: 'supporting', description: '引导主角成长的智者，拥有丰富的阅历', appearance: '中年人，气质沉稳，目光深��', personality: '睿智、严厉、关怀' },
          ];
        } else if (characterRows.length === 0 && _isPromoType) {
          console.log('[AI] generate-full-ai: Promo type with 0 characters (visual-driven mode) — skipping character creation');
        }

        // 写入角色到 DB（并行AI完成后同步写）
        // v6.0.176: 旧角色已在并行前清除，此处直接插入
        // v6.0.190: 宣传片允许0角色，跳过插入
        if (characterRows.length > 0) {
          const { data: insertedChars, error: charInsertErrInner } = await supabase
            .from('series_characters').insert(characterRows).select();
          if (charInsertErrInner) {
            console.warn('[AI] generate-full-ai: character insert warning:', charInsertErrInner.message);
          } else {
            createdChars = insertedChars || [];
            console.log(`[AI] generate-full-ai: ✅ Created ${createdChars.length} characters (parallel)`);
          }
        } else {
          createdChars = [];
        }
      } catch (aiErr: unknown) {
        console.warn('[AI] generate-full-ai: Parallel AI call failed:', truncateErrorMsg(aiErr));
      }
    }

    // v6.0.94: 并行完成后补充进度更新（告知前端Step1+2已完成）
    await updateProgress(2, 6, characterRows.length > 0 
      ? `剧集大纲+角色��建完成（${episodeOutlines.length}集/${characterRows.length}个角色）...`
      : `剧集大纲创建完成（${episodeOutlines.length}集，纯视觉驱动模式）...`);

    // v6.0.190: 兜底——宣传片允许0角色，非宣传片保留默认角色
    if (characterRows.length === 0 && !_isPromoType) {
      characterRows = [
        { series_id: seriesId, name: '主角', role: 'protagonist', description: '故事的主人公，怀揣梦想的年轻人', appearance: '20岁左右，精神饱满，目光坚定', personality: '勇敢、坚韧、善良' },
        { series_id: seriesId, name: '挚友', role: 'supporting', description: '主角最信任的伙伴，总在关键时刻伸出援手', appearance: '与主角同龄，性格开朗，笑容爽朗', personality: '忠诚、幽默、热心' },
        { series_id: seriesId, name: '导师', role: 'supporting', description: '引导主角成长���智者，拥有丰富的阅历', appearance: '中年人，气质沉稳，目光深邃', personality: '睿智、严厉、关怀' },
      ];
      if (characterRows[0]?.name === '主角') characterRows[0].description = '故事的主人公，怀揣梦想的年轻人';
      const { error: delCharErr2 } = await supabase.from('series_characters').delete().eq('series_id', seriesId);
      if (delCharErr2) console.warn('[AI] generate-full-ai: delete old characters warning:', delCharErr2.message);
      const { data: fallbackChars } = await supabase.from('series_characters').insert(characterRows).select();
      createdChars = fallbackChars || [];
    }
    // v6.0.190: 宣传片允许0角色——纯视觉驱动型宣传片无需出镜人物
    if (characterRows.length === 0 && _isPromoType) {
      createdChars = createdChars || [];
      console.log('[AI] generate-full-ai: Promo visual-driven mode — 0 characters is normal');
    }

    // ===== Step 3: 生成视觉风格指南（v6.0.8 新增） =====
    await updateProgress(3, 6, '正在生成视觉风格指南...');
    let visualStyleGuide = '';
    const baseStylePrompt = STYLE_PROMPTS[seriesStyle] || STYLE_PROMPTS.realistic;

    if (VOLCENGINE_API_KEY || ALIYUN_BAILIAN_API_KEY) {
      try {
        const charAppearanceList = characterRows.map((ch: Record<string, unknown>) =>
          `${ch.name}（${ch.role}）：${ch.appearance || '未描述'}`
        ).join('\n');

        // v6.0.177: styleGuidePrompt dead code removed — fully covered by prompt-builders.ts

        // v6.0.19: callAI 多模型路由（medium tier — 风格指南）
        // v6.0.157: 有参考图时启用多模态视觉——seed-2-0-pro分析参考图的色调/构图/光影来制定风格指南
        // v6.0.159+v6.0.176: 使用prompt-builders模��构建风格指南prompt（旧styleGuidePrompt已清理）
        const styleGuidePromptV2 = buildStyleGuidePrompt({ series, seriesStyle, baseStylePrompt, charAppearanceList, referenceImageUrl });
        const sgResult = await callAI({
          messages: [{ role: 'user', content: styleGuidePromptV2 }],
          tier: 'medium',
          temperature: 0.6,
          max_tokens: 2000,
          timeout: 60000,
          ...(multimodalImageUrls.length > 0 ? { imageUrls: multimodalImageUrls } : {}),
        });
        visualStyleGuide = sgResult.content.trim();
        console.log(`[AI] generate-full-ai: ✅ Visual style guide generated (${visualStyleGuide.length} chars, model=${sgResult.model})`);
      } catch (sgErr: unknown) {
        console.warn('[AI] generate-full-ai: Style guide AI error:', truncateErrorMsg(sgErr));
      }
    }

    // Fallback: 如果AI生成失败，用基础风格+角色信息拼一个简单指南
    if (!visualStyleGuide) {
      const charFallback = characterRows.map((ch: Record<string, unknown>) =>
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
          characterAppearances: characterRows.map((ch: Record<string, unknown>) => ({
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
    } catch (sgSaveErr: unknown) {
      console.warn('[AI] generate-full-ai: Style guide save warning:', getErrorMessage(sgSaveErr));
    }

    // ===== Step 4: 写入剧集数据 =====
    await updateProgress(4, 6, `正在写入${episodeOutlines.length}集剧集数据...`);

    // 清除旧数据（重试时必须先删除，注意顺序：先子表再父表）
    const { error: delSbErr } = await supabase.from('series_storyboards').delete().eq('series_id', seriesId);
    if (delSbErr) console.warn('[AI] generate-full-ai: delete old storyboards warning:', delSbErr.message);
    const { error: delEpErr } = await supabase.from('series_episodes').delete().eq('series_id', seriesId);
    if (delEpErr) console.warn('[AI] generate-full-ai: delete old episodes warning:', delEpErr.message);

    // v6.0.78: 保存cliffhanger/previousEpisodeLink到key_moment（JSON编码后缀）
    const episodeRows = episodeOutlines.map((ep: EpisodeOutline) => {
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
    // v6.0.149: createdEpisodes declaration hoisted above if-block (was const, now let assignment)
    const { data: _upsertedEps, error: epInsertErr } = await supabase
      .from('series_episodes').upsert(episodeRows, { onConflict: 'series_id,episode_number' }).select();
    createdEpisodes = _upsertedEps || undefined;

    if (epInsertErr) {
      console.error('[AI] generate-full-ai: Episode insert error:', epInsertErr.message);
      const { error: failUpErr } = await supabase.from('series').update({
        status: 'failed',
        generation_progress: { currentStep: 4, totalSteps: 6, stepName: '剧集写入失败', error: epInsertErr.message, failedAt: new Date().toISOString() },
      }).eq('id', seriesId);
      if (failUpErr) await supabase.from('series').update({ status: 'failed' }).eq('id', seriesId);
      return c.json({ success: false, error: `剧集写入失败: ${epInsertErr.message}` }, 500);
    }
    } // end if (!_continuationMode) — Steps 1-4

    // v6.0.149: In continuation mode, override variables with existing DB data
    if (_continuationMode) {
      episodeOutlines = _contEpOutlines;
      characterRows = _contCharRows;
      createdChars = _contCreatedChars;
      createdEpisodes = _contCreatedEpisodes;
      visualStyleGuide = _contVisualStyleGuide;
    }

    // v6.0.149: In continuation mode, only generate storyboards for episodes that lack them
    const sbEpisodeOutlines = (_continuationMode && _contEpFilter)
      ? episodeOutlines.filter((ep: EpisodeOutline) => _contEpFilter!.has(ep.episodeNumber))
      : episodeOutlines;

    // ===== Step 5: 为每集生成基础分镜 =====
    await updateProgress(5, 6, _continuationMode
      ? `续接模式：为${sbEpisodeOutlines.length}/${episodeOutlines.length}集生成分镜...`
      : '正在生成分镜场景...');
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
    const charNames = characterRows.map((ch: Record<string, unknown>) => ch.name).filter(Boolean).join('、');

    // v5.6.0: 使用AI为每集生成具体的分镜描述，��非硬编码通用模板
    // v6.0.84: 降至每批2集（原3集prompt过大导致AI超时或截断JSON）
    // v6.0.149: 续接模式下使用 sbEpisodeOutlines（仅缺分镜的���），正常模式下等同 episodeOutlines
    const SB_BATCH_SIZE = 2;
    const epBatches: EpisodeOutline[][] = [];
    for (let bi = 0; bi < sbEpisodeOutlines.length; bi += SB_BATCH_SIZE) {
      epBatches.push(sbEpisodeOutlines.slice(bi, bi + SB_BATCH_SIZE));
    }

    // v6.0.8: 构建角色外貌卡（用于分镜prompt注入，确保每帧角色外貌一致）
    const charAppearanceBlock = characterRows.map((ch: Record<string, unknown>) =>
      `- ${ch.name}（${ch.role}）：${ch.appearance || '标准外貌'}`
    ).join('\n');

    // v6.0.8: 追踪已生成的批次，用于传递前集摘要上下文
    let previousBatchSummary = '';

    // v6.0.153: In continuation mode, build sorted completed-episode summaries for per-batch gap injection.
    // v6.0.152 (reverted) seeded ALL completed eps at once — leaked future eps into earlier prompts
    // (e.g., E4,E5,E6 appeared in E3's previousBatchSummary even though E3 is processed first).
    // v6.0.153 fix: inject completed ep summaries dynamically before each batch, only for eps with
    // episodeNumber < current batch's min episode, maintaining correct temporal ordering.
    // v6.0.156: Two-tier summary structure — `summary` (full, with scene arc+dialogue from v6.0.155)
    // and `summaryCompact` (synopsis-only, v6.0.153 style). Budget-based degradation at injection
    // time uses compact for temporally distant eps and full for recent ones.
    const _contCompletedSummaries: Array<{ epNum: number; summary: string; summaryCompact: string }> = [];
    const CONT_SUMMARY_BUDGET = 1500; // v6.0.156: max chars for previousBatchSummary after gap injection
    let _contSummaryInjectedUpTo = 0; // highest completed-ep number already injected
    if (_continuationMode && _contEpOutlines.length > 0 && _contEpFilter) {
      for (const ep of _contEpOutlines) {
        if (!_contEpFilter.has(ep.episodeNumber)) {
          // Base: synopsis + cliffhanger (compact tier, ~70 chars)
          let summaryCompact = `第${ep.episodeNumber}集「${ep.title}」：${(ep.synopsis || '').substring(0, 40)}`;
          if (ep.cliffhanger) summaryCompact += `→悬念：${ep.cliffhanger.substring(0, 30)}`;
          // Full tier: add scene arc + dialogue (v6.0.155, ~150-185 chars total)
          let summaryFull = summaryCompact;
          if (_contExistingSceneData) {
            const scenes = _contExistingSceneData.get(ep.episodeNumber);
            if (scenes && scenes.length > 0) {
              const sorted = [...scenes].sort((a, b) => a.scene_number - b.scene_number);
              const arcPoints: string[] = [];
              const first = sorted[0];
              if (first?.description) arcPoints.push(`开场:${first.description.substring(0, 25)}`);
              if (sorted.length >= 3) {
                const mid = sorted[Math.floor(sorted.length / 2)];
                if (mid?.description) arcPoints.push(`转折:${mid.description.substring(0, 25)}`);
              }
              const last = sorted[sorted.length - 1];
              if (last?.description && last !== first) arcPoints.push(`收尾:${last.description.substring(0, 25)}`);
              if (arcPoints.length > 0) summaryFull += `[${arcPoints.join('→')}]`;
              const dlgScene = sorted.slice(Math.floor(sorted.length / 3)).find(s => s.dialogue && s.dialogue.length > 5);
              if (dlgScene?.dialogue) {
                const firstLine = dlgScene.dialogue.split(/[\\n\n]/).filter(Boolean)[0] || '';
                if (firstLine.length > 3) summaryFull += `|「${firstLine.substring(0, 30)}」`;
              }
            }
          }
          _contCompletedSummaries.push({ epNum: ep.episodeNumber, summary: summaryFull, summaryCompact });
        }
      }
      _contCompletedSummaries.sort((a, b) => a.epNum - b.epNum);
      if (_contCompletedSummaries.length > 0) {
        const avgFull = Math.round(_contCompletedSummaries.reduce((s, e) => s + e.summary.length, 0) / _contCompletedSummaries.length);
        const avgCompact = Math.round(_contCompletedSummaries.reduce((s, e) => s + e.summaryCompact.length, 0) / _contCompletedSummaries.length);
        console.log(`[AI] generate-full-ai: CONTINUATION prepared ${_contCompletedSummaries.length} completed-ep summaries (${_contCompletedSummaries.map(s => `E${s.epNum}`).join(',')}, avg full=${avgFull} compact=${avgCompact} chars/ep, budget=${CONT_SUMMARY_BUDGET})`);
      }
    }

    let sbAiFallback = false;
    let sbConsecutiveAiFails = 0; // v6.0.84: 跟踪连续AI失败次数，>=3次才永久放弃
    // v6.0.86: 生成质量统计
    let statsAiSuccessBatches = 0;
    let statsAiRepairedBatches = 0;
    let statsRetrySuccessBatches = 0;
    let statsFallbackBatches = 0;
    // v6.0.154: Token usage tracking for continuation mode — quantify optimization effect of v6.0.151-153
    const _contTokenStats = {
      totalPromptChars: 0,      // actual prompt chars sent in continuation mode
      normalEstPromptChars: 0,  // estimated chars if using normal (non-continuation) prompt
      totalMaxTokens: 0,        // actual max_tokens requested
      normalEstMaxTokens: 0,    // what normal mode would request (8000 per batch)
      gapSummariesInjected: 0,  // number of completed-ep summaries injected via v6.0.153
      scenesSkippedByFilter: 0, // scenes skipped by v6.0.150 DB filter
      scenesRequestedVsNormal: [0, 0] as [number, number], // [actual, normal] scene counts requested from AI
    };
    for (let batchIdx = 0; batchIdx < epBatches.length; batchIdx++) {
      const epBatch = epBatches[batchIdx];
      // v6.0.104: 心跳——每批次开始��更新updated_at，防止前端误判为卡住
      // （AI单次调用可达90s，多批次总耗时可超300s；此前心跳仅在首次AI调用前触发一次）
      try { await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', seriesId); } catch { /* non-blocking */ }
      // v6.0.84: 批次级进度更新（前端可实时显示"分镜 第2/5批"）
      await updateProgress(5, 6, `正在生成分镜场景 (第${batchIdx + 1}/${epBatches.length}批, 共${sbEpisodeOutlines.length}集)...`, {
        storyboardBatch: batchIdx + 1,
        storyboardTotalBatches: epBatches.length,
        scenesGeneratedSoFar: totalSbScenes,
      });
      // v6.0.153: Inject completed-episode summaries for episodes BEFORE this batch (gap-filling).
      // Ensures temporal ordering: only inject eps with numbers < current batch's min, not yet injected.
      // v6.0.156: Budget-based graceful degradation — use full summaries for recent eps, compact for distant ones
      if (_continuationMode && _contCompletedSummaries.length > 0) {
        const batchMinEp = Math.min(...epBatch.map((ep: EpisodeOutline) => ep.episodeNumber));
        const toInject = _contCompletedSummaries.filter(s => s.epNum < batchMinEp && s.epNum > _contSummaryInjectedUpTo);
        if (toInject.length > 0) {
          // v6.0.156: Build gap summary with budget-aware tier selection
          // Strategy: start with all full summaries, if over budget progressively downgrade oldest to compact
          const existingLen = previousBatchSummary ? previousBatchSummary.length + 1 : 0; // +1 for `；` separator
          const availableBudget = CONT_SUMMARY_BUDGET - existingLen;
          // Try all-full first
          let gapParts = toInject.map(s => s.summary);
          let gapStr = gapParts.join('；');
          if (gapStr.length > availableBudget && toInject.length > 1) {
            // Phase 1: Downgrade oldest entries to compact, keeping most recent 2 as full
            const keepFullCount = Math.min(2, toInject.length);
            let degradedCount = 0;
            gapParts = toInject.map((s, i) => {
              if (i < toInject.length - keepFullCount && s.summary.length > s.summaryCompact.length) {
                degradedCount++;
                return s.summaryCompact;
              }
              return s.summary;
            });
            gapStr = gapParts.join('；');
            if (degradedCount > 0) {
              console.log(`[AI] generate-full-ai: CONTINUATION budget degradation: downgraded ${degradedCount}/${toInject.length} gap summaries to compact tier (budget=${availableBudget}, result=${gapStr.length} chars)`);
            }
          }
          // Phase 2: If still over budget, hard-truncate from start (drop oldest entirely)
          if (gapStr.length > availableBudget && availableBudget > 0) {
            const parts = gapStr.split('；');
            while (parts.length > 1 && parts.join('；').length > availableBudget) {
              parts.shift();
            }
            gapStr = parts.join('；');
          }
          previousBatchSummary = previousBatchSummary
            ? `${previousBatchSummary}；${gapStr}`
            : gapStr;
          // v6.0.156: Replace count-based trim (old: keep 6) with budget-based trim on full previousBatchSummary
          if (previousBatchSummary.length > CONT_SUMMARY_BUDGET) {
            const trimParts = previousBatchSummary.split('；');
            while (trimParts.length > 1 && trimParts.join('；').length > CONT_SUMMARY_BUDGET) {
              trimParts.shift();
            }
            previousBatchSummary = trimParts.join('；');
          }
          _contSummaryInjectedUpTo = Math.max(...toInject.map(s => s.epNum));
          _contTokenStats.gapSummariesInjected += toInject.length; // v6.0.154
          console.log(`[AI] generate-full-ai: CONTINUATION injected ${toInject.length} gap summaries (${toInject.map(s => `E${s.epNum}`).join(',')}) before batch ${batchIdx + 1} (E${batchMinEp}+), previousBatchSummary=${previousBatchSummary.length}/${CONT_SUMMARY_BUDGET} chars`);
        }
      }

      let batchAiSuccess = false; // v6.0.84: 本批次AI是否成功
      // v6.0.90: 每批次使用局部数组，处理完立即写DB并释放内存，防止大型系列OOM
      const batchRows: Record<string, unknown>[] = [];
      if ((VOLCENGINE_API_KEY || ALIYUN_BAILIAN_API_KEY) && !sbAiFallback) { // v6.0.84: 修复——原仅检查ALIYUN导致仅配VOLCENGINE时跳过AI
        // v6.0.84: 提升prompt构建至try外部，使retry块可访问sbPrompt
        // v6.0.151: In continuation mode, build per-episode missing scene info + existing scene context
        let _batchHasMissingScenes = false; // v6.0.151: track if any episode in this batch has partial scenes
        let _batchMissingInfo: Map<number, { missing: number[]; existing: Array<{ scene_number: number; description: string; dialogue: string; camera_angle: string; emotional_tone: string; location: string }> }> | null = null;
        if (_continuationMode && _contExistingSceneData && _contExistingScenes) {
          _batchMissingInfo = new Map();
          for (const ep of epBatch) {
            const existingSet = _contExistingScenes.get(ep.episodeNumber);
            const existingData = _contExistingSceneData.get(ep.episodeNumber) || [];
            const missing: number[] = [];
            for (let s = 1; s <= scenesPerEp; s++) {
              if (!existingSet || !existingSet.has(s)) missing.push(s);
            }
            if (missing.length > 0 && missing.length < scenesPerEp && existingData.length > 0) {
              _batchHasMissingScenes = true;
              _batchMissingInfo.set(ep.episodeNumber, { missing, existing: existingData });
            }
          }
          if (!_batchHasMissingScenes) _batchMissingInfo = null; // no partial episodes → use normal prompt
        }

        const batchEpInfo = epBatch.map((ep: EpisodeOutline) => {
          let epLine = `第${ep.episodeNumber}集「${ep.title}」：${ep.synopsis || '未提供'}`;
          if (ep.cliffhanger) epLine += `（伏笔/悬念：${ep.cliffhanger}）`;
          return epLine;
        }).join('\n');

        const contextBlock = previousBatchSummary
          ? `\n【前集摘要——必须承接以下剧情】\n${previousBatchSummary}\n`
          : '';

        // v6.0.115: 风格指南截断从500→1000字符——500字切断角色外貌卡+色彩方案等关键参数，导致不同批次分镜收到的风格信息不完整→风格不一致
        // v6.0.115: 始终注入baseStylePrompt风格DNA，即使有visualStyleGuide也要补充（确保跨批次风格基因一致）
        const styleGuideBlock = visualStyleGuide
          ? `\n【视觉风格指南——所有场景必须遵守】\n${visualStyleGuide.substring(0, 1000)}\n【风格DNA锁定】${baseStylePrompt}\n`
          : `\n【视觉风格】${baseStylePrompt}\n`;

        const cinematographyBlock = getCinematographyBlock(productionType);
        const ptInfo = PRODUCTION_TYPE_PROMPTS[productionType] || PRODUCTION_TYPE_PROMPTS.short_drama;

        // v6.0.177: sbPrompt dead code removed — fully covered by prompt-builders.ts
        const sbPromptFixed = buildStoryboardPrompt({
          productionType, series, scenesPerEp, cinematographyBlock, styleGuideBlock,
          charAppearanceBlock, contextBlock, batchEpInfo, creativeSeed,
          referenceAssets: hasRefAssets ? referenceAssets : undefined,
        });

        // v6.0.151: Build targeted continuation prompt — include existing scenes as context, only request missing ones
        let sbPromptFinal = sbPromptFixed;
        let contExpectedSceneCount = scenesPerEp * epBatch.length; // normal: all scenes
        if (_batchHasMissingScenes && _batchMissingInfo) {
          const contBlocks: string[] = [];
          let totalMissing = 0;
          for (const ep of epBatch) {
            const info = _batchMissingInfo.get(ep.episodeNumber);
            if (info && info.missing.length > 0 && info.missing.length < scenesPerEp) {
              // Build existing scene summaries (truncated to save tokens)
              // v6.0.157: Tune truncation — description 60→50 chars, dialogue 40→30 chars (saves ~15% tokens per scene
              // while retaining sufficient context for AI to maintain narrative coherence)
              const existingSummary = info.existing
                .sort((a, b) => a.scene_number - b.scene_number)
                .map(s => `  场景${s.scene_number}[${s.camera_angle}/${s.emotional_tone}@${s.location || '未指定'}]: ${(s.description || '').substring(0, 50)}${s.dialogue ? ' | 对白:' + (s.dialogue).substring(0, 30) : ''}`)
                .join('\n');
              contBlocks.push(`\n【第${ep.episodeNumber}集 续接信息——以下场景已完成，仅需补全缺失场景】\n已完成的场景（只读上下文，不要重新生成）：\n${existingSummary}\n需要补全的缺失场景编号：${info.missing.join(', ')}\n请仅为第${ep.episodeNumber}集生成以上缺失的${info.missing.length}个场景，sceneNumber必须与上述缺失编号一一对应。\n新���景必须与已有场景在叙事、地点、时间线上自然衔接。`);
              totalMissing += info.missing.length;
            } else {
              // Episode has no existing scenes or all scenes missing — normal generation
              totalMissing += scenesPerEp;
            }
          }
          if (contBlocks.length > 0) {
            contExpectedSceneCount = totalMissing;
            // Replace the "每集返回N个场景" instruction
            sbPromptFinal = sbPromptFixed
              .replace(new RegExp(`对每集返回${scenesPerEp}个场景`), `按以下续接要���返回场景（部分集只需补全缺失场景）`)
              .replace(new RegExp(`每集创作${scenesPerEp}个电影`), `按续接要求补全缺失的电影`);
            sbPromptFinal += contBlocks.join('\n');
            sbPromptFinal += `\n\n【续接模式总要求】对于有"已完成场景"的集，只返回缺失场景编号对应的JSON（不要返回已完成的场景）。对于没有续接信息的集，正常返回全部${scenesPerEp}个场景。`;
            console.log(`[AI] generate-full-ai: v6.0.151 continuation prompt — batch ${batchIdx + 1} requesting ${totalMissing} scenes (${contBlocks.length} episodes with partial data)`);
          }
        }

        // v6.0.154: Track token usage for continuation vs normal mode comparison
        const normalSceneCount = scenesPerEp * epBatch.length;
        _contTokenStats.totalPromptChars += sbPromptFinal.length;
        _contTokenStats.normalEstPromptChars += sbPromptFixed.length;
        _contTokenStats.scenesRequestedVsNormal[0] += contExpectedSceneCount;
        _contTokenStats.scenesRequestedVsNormal[1] += normalSceneCount;

        try {
          // v6.0.84: timeout 45s→90s, max_tokens 6000→8000（2集×6场景结构化JSON需更多token+时间）
          // v6.0.151: In continuation mode with partial episodes, reduce max_tokens proportionally
          // v6.0.157: Lower max_tokens floor 4000→3500 — continuation batches with 1-2 missing scenes need fewer tokens
          const contTokenReduction = (contExpectedSceneCount < scenesPerEp * epBatch.length) ? Math.max(3500, Math.round(8000 * contExpectedSceneCount / (scenesPerEp * epBatch.length))) : 8000;
          _contTokenStats.totalMaxTokens += contTokenReduction; // v6.0.154
          _contTokenStats.normalEstMaxTokens += 8000; // v6.0.154
          // v6.0.192: 注入参考素材图片（多模态视觉），仅首批次注入以控制token消耗
          const _sbRefImageUrls = (hasRefAssets && batchIdx === 0)
            ? referenceAssets.filter(a => a.type === 'image').map(a => a.url).slice(0, 4)
            : [];
          const sbAiResult = await callAI({
            messages: [{ role: 'user', content: sbPromptFinal }],
            tier: 'heavy',
            temperature: 0.75,
            max_tokens: contTokenReduction,
            timeout: 90000,
            ...(_sbRefImageUrls.length > 0 ? { imageUrls: _sbRefImageUrls } : {}),
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
        } catch (sbAiErr: unknown) {
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
              // v6.0.104: 重试前心跳——retry AI call也可达90s
              try { await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', seriesId); } catch { /* non-blocking */ }
              const retryResult = await callAI({
                messages: [{ role: 'user', content: sbPromptFinal }], // v6.0.151: use sbPromptFinal (includes continuation context if applicable); v6.0.115: 修复——原使用sbPrompt(含Unicode乱码)
                tier: 'heavy',
                temperature: 0.5, // 降低temperature提高稳定性
                max_tokens: contTokenReduction, // v6.0.151: match first attempt token limit
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
            } catch (retryErr: unknown) {
              console.warn(`[AI] generate-full-ai: Retry also failed for batch ${batchIdx}:`, truncateErrorMsg(retryErr));
            }
          }
        }
      }

      // v6.0.87: Fallback——只要AI+retry都失败就立即生成fallback���镜（不再等3次连续失败）
      // 旧逻辑: sbAiFallback需>=3次连续失败才触发，导致前1-2批零分镜（短剧致命bug）
      if (!batchAiSuccess) {
        statsFallbackBatches++; // v6.0.86
        for (const ep of epBatch) {
          const alreadyGen = batchRows.some((row: Record<string, unknown>) => row.episode_number === ep.episodeNumber);
          if (alreadyGen) continue;
          const syn = ep.synopsis || ep.title || '故事展开';
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

      // v6.0.8: 更新前集摘要——将当前批次的剧集概要追加，��下一批使用
      const batchSummary = epBatch.map((ep: EpisodeOutline) => {
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
              .filter((row: Record<string, unknown>) => row.dialogue && (row.dialogue as string).includes('：（看��远方）') || (row.dialogue as string).includes('这件事没有退路') || (row.dialogue as string).includes('说来听听') || (row.dialogue as string).includes('谢谢你一直陪在我身边') || (row.dialogue as string).includes('总觉得有什么不对劲') || (row.dialogue as string).includes('原来真相是这样'))
              .slice(0, 12);
            if (scenesToEnhance.length > 0) {
              const dlgCharNames = characterRows.map((ch: Record<string, unknown>) => `${ch.name}（${ch.role}）`).join('、');
              const sceneSummaries = scenesToEnhance.map((s: Record<string, unknown>, i: number) =>
                `场景${i + 1}[EP${s.episode_number}S${s.scene_number}]: ${(s.description || '').substring(0, 60)} | 情感:${s.emotional_tone || '自然'}`
              ).join('\n');
              const dialoguePrompt = `你是一位专业编剧。请为以下${scenesToEnhance.length}个场景各生成2-3句简短对话（每句不超过20字）。\n角色：${dlgCharNames}\n作品标题：${series.title}\n\n${sceneSummaries}\n\n要求：\n- 对话必须符合场景描述和情感基调\n- 每个场景的对话用"角色名：对话内容"格式，多句用换行分隔\n- 对话��自然、口语化，有情感张力\n- 返回JSON数组，每项格式：{"index":场景序号(从1开始), "dialogue":"对话内容"}\n\n只返回JSON数组，不要其���内容。`;
              try {
                // v6.0.104: 对话���色前心跳
                try { await supabase.from('series').update({ updated_at: new Date().toISOString() }).eq('id', seriesId); } catch { /* non-blocking */ }
                const dialogueResult = await callAI({
                  messages: [
                    { role: 'system', content: '你是专业影视编剧，擅长写自然、有感情的角色对话。只返回JSON。' },
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
              } catch (dlgAiErr: unknown) {
                console.warn(`[AI] generate-full-ai: Batch ${batchIdx + 1} dialogue AI enhancement failed:`, truncateErrorMsg(dlgAiErr));
              }
            }
          } catch (dlgErr: unknown) {
            console.warn(`[AI] generate-full-ai: Batch ${batchIdx + 1} dialogue enhancement outer error:`, getErrorMessage(dlgErr));
          }
        }

        // v6.0.150: In continuation mode, filter out scenes that already exist in DB
        // This avoids overwriting good scenes from a previous partial batch write
        let rowsToWrite = batchRows;
        if (_continuationMode && _contExistingScenes) {
          const beforeCount = rowsToWrite.length;
          rowsToWrite = batchRows.filter((row: Record<string, unknown>) => {
            const existingScenes = _contExistingScenes!.get(row.episode_number as number);
            return !existingScenes || !existingScenes.has(row.scene_number as number);
          });
          const skipped = beforeCount - rowsToWrite.length;
          if (skipped > 0) {
            _contTokenStats.scenesSkippedByFilter += skipped; // v6.0.154
            console.log(`[AI] generate-full-ai: Batch ${batchIdx + 1} scene-level skip: ${skipped}/${beforeCount} scenes already exist in DB, writing ${rowsToWrite.length} new scenes`);
          }
        }

        // v6.0.160: Protect scenes that already have video_url — NEVER overwrite completed video scenes
        // This prevents video loss when generate-full-ai re-runs (crash recovery, user retry, etc.)
        // Applies regardless of continuation mode — even fresh re-runs must preserve existing videos
        if (rowsToWrite.length > 0) {
          const epNums = [...new Set(rowsToWrite.map((r: Record<string, unknown>) => r.episode_number as number))];
          const { data: existingWithVideo } = await supabase.from('series_storyboards')
            .select('episode_number, scene_number, video_url, status')
            .eq('series_id', seriesId)
            .in('episode_number', epNums)
            .not('video_url', 'is', null);
          if (existingWithVideo && existingWithVideo.length > 0) {
            const videoSceneKeys = new Set(
              existingWithVideo
                .filter((s: StoryboardRow) => s.video_url && s.video_url.startsWith('http'))
                .map((s: StoryboardRow) => `${s.episode_number}:${s.scene_number}`)
            );
            if (videoSceneKeys.size > 0) {
              const beforeCount = rowsToWrite.length;
              rowsToWrite = rowsToWrite.filter((row: Record<string, unknown>) => !videoSceneKeys.has(`${row.episode_number}:${row.scene_number}`));
              const protectedCount = beforeCount - rowsToWrite.length;
              if (protectedCount > 0) {
                console.log(`[AI] generate-full-ai: Batch ${batchIdx + 1} ⚠️ PROTECTED ${protectedCount} scenes with existing videos from overwrite (${[...videoSceneKeys].slice(0, 5).join(', ')}${videoSceneKeys.size > 5 ? '...' : ''})`);
              }
            }
          }
        }

        // 立即写入DB并释放当前批次内存
        for (let i = 0; i < rowsToWrite.length; i += 50) {
          const chunk = rowsToWrite.slice(i, i + 50);
          const { data: ins, error: sbErr } = await supabase.from('series_storyboards').upsert(chunk, { onConflict: 'series_id,episode_number,scene_number' }).select();
          if (sbErr) console.warn(`[AI] generate-full-ai: Batch ${batchIdx + 1} storyboard write error:`, sbErr.message);
          else totalSbInserted += ins?.length || 0;
        }
        totalSbScenes += rowsToWrite.length;
        console.log(`[AI] generate-full-ai: Batch ${batchIdx + 1} wrote ${rowsToWrite.length} rows (total inserted=${totalSbInserted})`);
      }
    }

    // v6.0.154: Log continuation mode token usage summary
    if (_continuationMode && _contTokenStats.totalPromptChars > 0) {
      const promptSavingPct = _contTokenStats.normalEstPromptChars > 0
        ? Math.round((1 - _contTokenStats.totalPromptChars / _contTokenStats.normalEstPromptChars) * 100)
        : 0;
      const maxTokenSavingPct = _contTokenStats.normalEstMaxTokens > 0
        ? Math.round((1 - _contTokenStats.totalMaxTokens / _contTokenStats.normalEstMaxTokens) * 100)
        : 0;
      const [actualScenes, normalScenes] = _contTokenStats.scenesRequestedVsNormal;
      console.log(`[AI] generate-full-ai: ===== CONTINUATION TOKEN USAGE SUMMARY (v6.0.151-154) =====`);
      console.log(`[AI]   Prompt chars: ${_contTokenStats.totalPromptChars} actual vs ${_contTokenStats.normalEstPromptChars} normal (${promptSavingPct > 0 ? '+' : ''}${-promptSavingPct}% — continuation prompts include existing scene context so may be larger)`);
      console.log(`[AI]   max_tokens: ${_contTokenStats.totalMaxTokens} actual vs ${_contTokenStats.normalEstMaxTokens} normal (${maxTokenSavingPct}% saving)`);
      console.log(`[AI]   Scenes requested: ${actualScenes} actual vs ${normalScenes} normal (${normalScenes > 0 ? Math.round((1 - actualScenes / normalScenes) * 100) : 0}% reduction)`);
      console.log(`[AI]   Gap summaries injected (v6.0.153): ${_contTokenStats.gapSummariesInjected} completed-ep summaries`);
      console.log(`[AI]   Scenes skipped by DB filter (v6.0.150): ${_contTokenStats.scenesSkippedByFilter}`);
      console.log(`[AI] ============================================================`);
    }

    // v6.0.147: 数据安全检查点——所有分镜批次已写入DB
    // 不改status(保持'generating')——因为前端轮询在status!='generating'时停止，
    // 如果此处写'draft'，SeriesCreationPanel永远看不到'completed'→自动视频生成不触发
    // 改为: 仅标记_allBatchesWritten+更新generation_progress/updated_at(防stale误判)
    // 真正的状态降级由三层兜底处理:
    //   1. beforeunload: Edge Function被kill时，_allBatchesWritten?'draft':'failed'
    //   2. catch: 收尾操作异常时，_allBatchesWritten?主动写'draft'而非'failed'
    //   3. 前端isGenerationEffectivelyComplete(): 轮询检测全部分镜已完成→自动修正为draft
    _allBatchesWritten = true;
    try {
      await supabase.from('series').update({
        updated_at: new Date().toISOString(),
        generation_progress: { currentStep: 5, totalSteps: 6, stepName: '分镜已写入，正在完成收尾...', totalScenes: totalSbScenes, totalInserted: totalSbInserted },
      }).eq('id', seriesId);
      console.log(`[AI] generate-full-ai: ✅ Batch checkpoint — _allBatchesWritten=true (${totalSbInserted}/${totalSbScenes} storyboards safe in DB). Remaining steps are best-effort.`);
    } catch (earlyErr: unknown) {
      console.warn('[AI] generate-full-ai: batch checkpoint progress update exception:', getErrorMessage(earlyErr));
    }

    // ===== Step 6: 完成 =====
    // v6.0.147: 重排操作顺序——先写'completed'再做参考图注入(best-effort)
    // 原因: 减少"检查点→completed写入"之间的时间窗口，降低Edge Function超时风险
    // 原顺序: 检查点→参考图注入(await DB)→质量统计(JS)→completed
    // 新顺序: 检查点→质量统计(JS,即时)→completed→参考图注入(best-effort)

    // v6.0.86: 汇总生成质量统计（纯JS计算，不耗时）
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

    // v6.0.180: 同步更新所有 episode 状态为 completed
    await supabase.from('series_episodes')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('series_id', seriesId);
    console.log(`[AI] generate-full-ai: ✅ Updated all episodes status to completed`);

    // ✅ 关键修复：生成完成后设为 completed，而非 in-progress
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

    // v6.0.142: 正常完成——禁用 beforeunload 清理
    _generationCompleted = true;
    globalThis.removeEventListener('beforeunload', _cleanupHandler);

    // v6.0.118: 参考图→首帧注入——将referenceImageUrl预设为E1S1的image_url
    // v6.0.147: 移至completed写入之后——即使此步骤因超时被kill，status已经是'completed'
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
      } catch (e: unknown) {
        console.warn(`[AI] generate-full-ai: E1S1 image_url pre-set failed (non-blocking):`, getErrorMessage(e));
      }
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
  } catch (error: unknown) {
    // v6.0.142: catch 也标记完成+移除监听器，防止 beforeunload 重复写
    _generationCompleted = true;
    try { if (_cleanupHandler) globalThis.removeEventListener('beforeunload', _cleanupHandler); } catch { /* ignore */ }
    console.error('[AI] generate-full-ai error:', truncateErrorMsg(error));
    try {
      // v6.0.147: 如果所有分镜批次已成功写入DB，异常发生在后续收尾操作（参考图/质量统计）
      // 此时数据已安全，不���标记'failed'——写'draft'让用户可正常使用
      // 注意：此时status仍为'generating'(检查点未改status)，所以必须主动写'draft'
      if (_allBatchesWritten) {
        console.log(`[AI] generate-full-ai: Error occurred AFTER all batches written — writing status='draft' (data is safe). Error: ${truncateErrorMsg(error)}`);
        await supabase.from('series').update({
          status: 'draft',
          generation_progress: { currentStep: 6, totalSteps: 6, stepName: '生成完成(收尾异常)', completedAt: new Date().toISOString(), warning: truncateErrorMsg(error) },
          updated_at: new Date().toISOString(),
        }).eq('id', c.req.param('id'));
      } else {
        // 尝试写入失败详情
        const { error: failErr } = await supabase.from('series').update({
          status: 'failed',
          generation_progress: { currentStep: 0, totalSteps: 6, stepName: '生成异常', error: truncateErrorMsg(error), failedAt: new Date().toISOString() },
        }).eq('id', c.req.param('id'));
        // 降级：只设 status=failed
        if (failErr) {
          await supabase.from('series').update({ status: 'failed' }).eq('id', c.req.param('id'));
        }
      }
    } catch (statusErr: unknown) {
      console.warn('[AI] generate-full-ai: failed to write failure status to DB:', getErrorMessage(statusErr));
    }
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

// ------------------------------------------------------------------
//  [L] AI 路由 — 剧集大纲 / 故事�����强 / 图片生成 / prompt润色
// ------------------------------------------------------------------

// ==================== [O] AI 路由 ====================

// AI生成剧集大纲（从 aiEpisodeGenerator.ts 后台调用）
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
          keyMoments: [`关键场���${ep}A`, `关键场景${ep}B`],
        };
      });
      return c.json({ success: true, episodes, fallback: true });
    }

    const prompt = `你是一位专业的影视编剧。请根据���下信息，为作品创作${totalEpisodes}集的详细大纲。

作品标题：${seriesTitle}
剧集简介：${seriesDescription}
${genre ? `类型：${genre}` : ''}
${theme ? `主题：${theme}` : ''}
${targetAudience ? `目标受众：${targetAudience}` : ''}

【最重要的规则】你的所有创作内容必须100%���绕上面给出的作品标题和简介来展开！
- 禁止编造与标题和简介无关的故事（如快递员、时空穿越等与用户主题无关的内容）
- 角色名、职业、背景必须与用户提供的标题/简介/类型保持一致
- 每一集的剧情都必须是用户给定主题的自然延伸

请严格按以下JSON格式回复（不要包含markdown标记），返回一个数组：
[{"episodeNumber":1,"title":"集标题","synopsis":"50-80字的集内容简介","growthTheme":"本集的成长主题","keyMoments":["关键场景1","关键场景2"]}]

要求：
1. 每集标题简洁有力，必须与作品主题相关
2. 故事线有递进和转折，前期建立世界观，中期发展冲突，后期走向高潮和结局
3. 所有角色、事件、场景必须紧扣用户给定的标题「${seriesTitle}」
4. 如果用户提供了具体简介，每集剧情必须是该简介故事的具体��开`;

    // v6.0.19: callAI 多模型路由（heavy tier — 分集详情生成）
    const aiResult = await callAI({
      messages: [{ role: 'user', content: prompt }],
      tier: 'heavy',
      temperature: 0.8,
      max_tokens: 6000,
      timeout: 120000,
    });
    const content = aiResult.content;

    let episodes: EpisodeOutline[] = [];
    try {
      const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(cleaned);
      episodes = Array.isArray(parsed) ? parsed : (parsed.episodes || []);
    } catch {
      console.warn('[AI] generate-episodes: JSON parse failed, using fallback');
      episodes = Array.from({ length: Math.min(totalEpisodes, 10) }, (_, i) => ({
        episodeNumber: i + 1, title: `第${i + 1}集`, synopsis: `第${i + 1}集内容`, growthTheme: '成长', keyMoments: [] as string[],
      }));
    }

    if (episodes.length === 0) {
      return c.json({ success: false, error: 'AI未返回有效剧集内容' }, 500);
    }

    episodes = episodes.map((ep: EpisodeOutline, idx: number) => ({
      episodeNumber: ep.episodeNumber || ep.episode_number || idx + 1,
      title: ep.title || `第${idx + 1}集`,
      synopsis: ep.synopsis || ep.description || '',
      growthTheme: ep.growthTheme || ep.growth_theme || '',
      keyMoments: ep.keyMoments || ep.key_moments || [],
    }));

    return c.json({ success: true, episodes });
  } catch (error: unknown) {
    console.error('[AI] generate-episodes error:', truncateErrorMsg(error));
    if (getErrorName(error) === 'AbortError') return c.json({ success: false, error: 'AI生成超时，请重试' }, 504);
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

app.post(`${PREFIX}/ai/generate-story-enhanced`, async (c) => {
  try {
    const body = await c.req.json();
    if (!ALIYUN_BAILIAN_API_KEY) {
      const fallback: Record<string, string[]> = {
        anime: ['在樱花飘落的校园里，一位拥有神秘力量的少女遇见了来自异世界的守护者，一场关于命运与友情的冒险即将开始。', '魔法学院新学期开学，转学生小雨发现自己的室友竟然是传说中的天才魔法师。'],
        comic: ['超级英雄白天是普通上班族张明，夜晚化身守护城市的暗影侠客，在两种身份间艰难平衡。', '侦探林雪拥有读心术却遇到第一个读不懂的人，这背后隐藏着惊天秘密。'],
        cyberpunk: ['2077年霓虹都市中，黑客少女晨芯发现了巨型公司隐藏的黑暗真相，她必须在24小时内逃离追捕。'],
        fantasy: ['古老魔法森林深处，年轻精灵阿尔发现了失落已久的龙之石，一场史诗般的冒险即将开始。'],
        realistic: ['退役运动员重返训练场，为了最后一次证明自己，他克服伤痛和质疑，向梦想发起冲击。'],
      };
      const stories = fallback[body.style] || fallback.anime;
      return c.json({ success: true, story: stories[Math.floor(Math.random() * stories.length)], isFallback: true });
    }
    const { existingText, style, duration } = body;
    const prompt = `你是一位专业的漫画编剧。请创作一段${style || '动漫'}风格的短剧故事。

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
  } catch (error: unknown) {
    console.error('[AI] Story error:', truncateErrorMsg(error));
    return c.json({ success: false, message: getErrorMessage(error) }, 500);
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
    if (!imageUrl) return c.json({ success: false, message: '未获取到图片' }, 500);
    return c.json({ success: true, imageUrl });
  } catch (error: unknown) { console.error('[POST /ai/text-to-image] Error:', error); return c.json({ success: false, message: getErrorMessage(error) }, 500); }
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
  } catch (error: unknown) { console.error('[POST /ai/aliyun/text-to-image-sync] Error:', error); return c.json({ success: false, message: getErrorMessage(error) }, 500); }
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
  } catch (error: unknown) { console.error('[POST /ai/polish-image-prompt] Error:', error); return c.json({ success: false, message: getErrorMessage(error) }, 500); }
});

// ==================== [P] 社区作品系列列表 ====================

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
      // v6.0.27: series表无views列，popular暂按created_at降序（后续可改为likes count排��）
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
    // v6.0.175: Phase-parallel — all independent queries run concurrently (was sequential waterfall)
    const seriesIds = seriesList.map((s: SeriesRow) => s.id);
    const uniqueUserPhones = [...new Set(seriesList.map((s: SeriesRow) => s.user_phone).filter(Boolean))] as string[];
    const needCoverIds = seriesList.filter((s: SeriesRow) => !s.cover_image_url).map((s: SeriesRow) => s.id);

    // ── Phase 2: ALL independent queries in parallel ──
    const phase2Promises: Promise<unknown>[] = [
      // [0] 批量剧集
      supabase.from('series_episodes')
        .select('series_id, id, episode_number, title, synopsis, status, total_duration, thumbnail_url, merged_video_url')
        .in('series_id', seriesIds).order('episode_number', { ascending: true }),
      // [1] 封面回退: storyboard images
      needCoverIds.length > 0
        ? supabase.from('series_storyboards').select('series_id, image_url')
            .in('series_id', needCoverIds).not('image_url', 'is', null)
            .order('episode_number', { ascending: true }).order('scene_number', { ascending: true })
        : Promise.resolve({ data: [] }),
      // [2] likes counts (head:true — no row transfer)
      Promise.all(seriesIds.map((id: string) =>
        supabase.from('likes').select('*', { count: 'exact', head: true }).eq('work_id', id)
      )),
      // [3] comments counts
      Promise.all(seriesIds.map((id: string) =>
        supabase.from('comments').select('*', { count: 'exact', head: true }).eq('work_id', id)
      )),
      // [4] user likes status
      userPhone
        ? supabase.from('likes').select('work_id').in('work_id', seriesIds).eq('user_phone', userPhone)
        : Promise.resolve({ data: [] }),
      // [5] viewing history
      userPhone
        ? supabase.from('viewing_history').select('series_id, last_episode, progress').in('series_id', seriesIds).eq('user_phone', userPhone)
        : Promise.resolve({ data: [] }),
      // [6] user nicknames
      uniqueUserPhones.length > 0
        ? supabase.from('users').select('phone, nickname').in('phone', uniqueUserPhones)
        : Promise.resolve({ data: [] }),
    ];
    const [episodesRes, sbImagesRes, likeCountResults, commentCountResults, userLikesRes, viewHistoryRes, usersRes] = await Promise.all(phase2Promises);

    // Build episodes map
    if (episodesRes.error) console.warn('[Community] Batch episodes query error:', truncateErrorMsg(episodesRes.error));
    const episodesMap = new Map<string, EpisodeRow[]>();
    for (const ep of (episodesRes.data || [])) {
      const list = episodesMap.get(ep.series_id) || [];
      list.push(ep);
      episodesMap.set(ep.series_id, list);
    }

    // Build cover fallback map from storyboard images
    const coverFallbackMap = new Map<string, string>();
    for (const sb of (sbImagesRes.data || [])) {
      if (sb.image_url && !coverFallbackMap.has(sb.series_id)) {
        coverFallbackMap.set(sb.series_id, sb.image_url);
      }
    }
    // Phase 3 (conditional): video_tasks thumbnails for series still missing covers
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

    // Build likes/comments count maps
    const likesCountMap = new Map<string, number>();
    const commentsCountMap = new Map<string, number>();
    seriesIds.forEach((id: string, i: number) => {
      likesCountMap.set(id, likeCountResults[i].count || 0);
      commentsCountMap.set(id, commentCountResults[i].count || 0);
    });

    // Build user interaction maps
    const userLikesSet = new Set<string>();
    for (const like of (userLikesRes.data || [])) userLikesSet.add(like.work_id);
    const viewHistoryMap = new Map<string, Record<string, unknown>>();
    for (const vh of (viewHistoryRes.data || [])) viewHistoryMap.set(vh.series_id, vh);
    const userNicknameMap = new Map<string, string>();
    for (const u of (usersRes.data || [])) userNicknameMap.set(u.phone, u.nickname || '');

    // 组装结果（纯内存操作、零DB调用）
    const enrichedSeries = seriesList.map((series: SeriesRow) => {
      try {
        const episodes = episodesMap.get(series.id) || [];
        const episodeList = episodes.map((ep: EpisodeRow) => ({
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
        const completedEpisodes = episodeList.filter((ep: { status: string; videoUrl: string }) => ep.status === 'completed' || ep.videoUrl).length;
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
      } catch (enrichErr: unknown) {
        console.warn(`[Community] Enrich series ${series.id} failed:`, truncateErrorMsg(enrichErr));
        return {
          id: series.id,
          type: 'series',
          user_phone: series.user_phone || '',
          title: series.title || '未命名���列',
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

    // v6.0.34: 发现页仅展示至少完成完整1集的作品系列
    // 过滤条件：completedEpisodes >= 1（有merged_video_url或status=completed的剧集）
    // Over-fetch补偿：从3x窗口中过滤后取前limit条，确保分页填满
    const allFiltered = enrichedSeries.filter((s: { completedEpisodes: number }) => s.completedEpisodes >= 1);
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
  } catch (error: unknown) {
    console.error('[Community] Series error:', truncateErrorMsg(error));
    return c.json({ success: false, error: getErrorMessage(error), data: [], total: 0 }, 500);
  }
});

// 社区系列详情
app.get(`${PREFIX}/community/series/:id`, async (c) => {
  try {
    const seriesId = c.req.param('id');
    const userPhone = c.req.query('userPhone') || '';

    // v6.0.26: 移除likes_count/shares_count/comments_count（series表无此列），改为并行count查询
    const { data: series, error } = await queryWithRetry(
      () => supabase.from('series').select('id, user_phone, title, description, genre, style, cover_image_url, total_episodes, created_at, updated_at, coherence_check').eq('id', seriesId).maybeSingle(),
      'getSeriesDetail'
    );
    if (error) return c.json({ success: false, error: error.message }, 500);
    if (!series) return c.json({ success: false, error: '作品系列不存在' }, 404);

    // v6.0.70: 私有作品仅作者本人可查看
    const isPublic = series.coherence_check?.isPublic !== false;
    if (!isPublic && series.user_phone !== userPhone) {
      return c.json({ success: false, error: '该作品为私有，仅作者可查看' }, 403);
    }

    // v6.0.26: 并行获取剧集、分镜、点赞状态、昵称、点赞数、评论数（6个独立查询并行）
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

    // 将分镜关联到剧集 — v5.4.1: 自动从分镜构建播���列表
    // v6.0.89: O(N×M)→O(N+M) 优化——用Map索引替代���集filter
    const sbMap2 = new Map<number, StoryboardRow[]>();
    for (const sb of (storyboards || [])) {
      const epNum = Number(sb.episode_number);
      if (!sbMap2.has(epNum)) sbMap2.set(epNum, []);
      sbMap2.get(epNum)!.push(sb);
    }
    const enrichedEpisodes = (episodes || []).map((ep: EpisodeRow) => {
      const epStoryboards = sbMap2.get(Number(ep.episode_number)) || [];
      const completedSb = epStoryboards.filter((sb: StoryboardRow) => sb.video_url);

      let videoUrl = ep.merged_video_url || '';
      if (!videoUrl && completedSb.length > 0) {
        const playlistVideos = completedSb
          .sort((a: StoryboardRow, b: StoryboardRow) => a.scene_number - b.scene_number)
          .map((sb: StoryboardRow) => ({
            url: sb.video_url,
            duration: sb.duration || 5,
            title: sb.description || `场景${sb.scene_number}`,
            sceneNumber: sb.scene_number,
          }));
        const totalDuration = playlistVideos.reduce((sum: number, v: { duration: number }) => sum + v.duration, 0);
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
        status: (ep.status === 'completed' || videoUrl) ? 'completed' : (ep.status || 'draft'),
        storyboardCount: epStoryboards.length,
        completedStoryboardCount: completedSb.length,
      };
    });

    const completedEpisodes = enrichedEpisodes.filter((ep: { status: string; videoUrl: string }) => ep.status === 'completed' || ep.videoUrl).length;

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
  } catch (error: unknown) {
    console.error('[Community] Series detail error:', truncateErrorMsg(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

// v6.0.17: 相似作品推荐
app.get(`${PREFIX}/community/series/:id/similar`, async (c) => {
  try {
    const seriesId = c.req.param('id');
    const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '6') || 6, 1), 20);

    // 先���取当前系列的 genre 和 style
    const { data: current, error: curErr } = await supabase
      .from('series')
      .select('genre, style')
      .eq('id', seriesId)
      .maybeSingle();

    if (curErr || !current) {
      return c.json({ success: true, data: [] });
    }

    // 按 genre 匹配 → style 匹配 → 最新，排除自身，只取已完成的
    // v6.0.26: 移除likes_count（series表无此列），改为created_at排序+批量likes count
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
    const similarIds = (similar || []).map((s: SeriesRow) => s.id);
    const phones = [...new Set((similar || []).map((s: SeriesRow) => s.user_phone).filter(Boolean))] as string[];
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
      similarLikesMap.set(id, (simLikeCountResults as { count: number | null }[])[i]?.count || 0);
    });
    for (const u of (simUsersRes.data || [])) {
      nicknameMap.set(u.phone, u.nickname || '');
    }

    const result = (similar || []).map((s: SeriesRow) => ({
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
  } catch (error: unknown) {
    console.error('[Community] Similar series error:', getErrorMessage(error));
    return c.json({ success: true, data: [] });
  }
});

// ------------------------------------------------------------------
//  [N] 管理维护 — 补全路由 / 诊断修复 / 去重清理
// ------------------------------------------------------------------

// ==================== [Q] 其他补全路由 ====================

app.get(`${PREFIX}/viewing-history`, async (c) => {
  try {
    const userPhone = c.req.query('userPhone');
    const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '20') || 20, 1), 100);
    if (!userPhone) return c.json({ success: true, data: [] });
    // v6.0.24: 精简字段
    const { data, error } = await supabase.from('viewing_history').select('series_id, last_episode, progress, updated_at').eq('user_phone', userPhone).order('updated_at', { ascending: false }).limit(limit);
    if (error) return c.json({ success: false, error: error.message }, 500);
    return c.json({ success: true, data: toCamelCase(data || []) });
  } catch (error: unknown) { console.error('[GET /viewing-history] Error:', error); return c.json({ success: false, error: getErrorMessage(error) }, 500); }
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
  } catch (error: unknown) { console.error('[POST /series/storyboards/:storyboardId/generate-video] Error:', error); return c.json({ success: false, error: getErrorMessage(error) }, 500); }
});

// ==================== [Q] 数据诊断修复路由 ====================

// 修复单个作品的episodes（诊断工具使用）
app.post(`${PREFIX}/series/:id/fix-episodes`, async (c) => {
  try {
    const seriesId = c.req.param('id');
    // v6.0.23: select specific fields instead of *
    const { data: series, error: seriesErr } = await supabase
      .from('series').select('id, title, total_episodes, status').eq('id', seriesId).maybeSingle();
    if (seriesErr || !series) {
      return c.json({ success: false, error: seriesErr?.message || '作品不存在' }, 404);
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
    const synopses = ['主角登场，日常中遭遇意外事件。','面对第一个挑战，遇到重要配角。','暗中势力浮现，事情复杂化。','关键信息揭露，信念受动摇。','真相渐清晰，新危机酝酿。','并肩作战，友情升华。','信任考验，独自面对困境。','绝境中找到新力量。','终极对决，命运揭晓。','尘埃落定，完成成长。'];

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
  } catch (error: unknown) {
    console.error('[Fix] fix-episodes error:', truncateErrorMsg(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

// ==================== [Q] 数据清理与去重（v5.6.3） ====================

// GET /admin/data-health — 数据健康诊断（不修改数据）
app.get(`${PREFIX}/admin/data-health`, async (c) => {
  try {
    const report: Record<string, unknown> = { duplicateEpisodes: [] as Record<string, unknown>[], mergedVideoUrlFormats: {} as Record<string, number>, orphanedEpisodes: [] as string[], timestamp: new Date().toISOString() };

    // 1. 检查 series_episodes 重复（相同 series_id + episode_number 出现多行）
    const { data: allEpisodes, error: epErr } = await supabase
      .from('series_episodes')
      .select('id, series_id, episode_number, title, status, total_duration, merged_video_url, created_at, updated_at')
      .order('series_id', { ascending: true })
      .order('episode_number', { ascending: true })
      .order('updated_at', { ascending: false });

    if (epErr) return c.json({ success: false, error: `查询episodes失败: ${epErr.message}` }, 500);

    // 按 (series_id, episode_number) 分组
    const groupMap = new Map<string, EpisodeRow[]>();
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
          episodes: episodes.map((ep: EpisodeRow) => ({
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
    const seriesIds = [...new Set((allEpisodes || []).map((ep: EpisodeRow) => ep.series_id))];
    if (seriesIds.length > 0) {
      const { data: existingSeries } = await supabase
        .from('series').select('id').in('id', seriesIds);
      const existingSeriesIds = new Set((existingSeries || []).map((s: { id: string }) => s.id));
      const orphanedSeriesIds = seriesIds.filter(id => !existingSeriesIds.has(id));
      if (orphanedSeriesIds.length > 0) {
        const orphanedCount = (allEpisodes || []).filter((ep: EpisodeRow) => orphanedSeriesIds.includes(ep.series_id)).length;
        report.orphanedEpisodes = orphanedSeriesIds.map(sid => ({
          seriesId: sid,
          count: (allEpisodes || []).filter((ep: EpisodeRow) => ep.series_id === sid).length,
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
  } catch (error: unknown) {
    console.error('[Admin] data-health error:', truncateErrorMsg(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

// POST /admin/cleanup-duplicates — 清理重复数据 + 统一 merged_video_url 格式
app.post(`${PREFIX}/admin/cleanup-duplicates`, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false; // 默认 dry run，不实际删除
    const fixMergedUrls = body.fixMergedUrls !== false; // 默认修复 merged_video_url
    const cleanOrphans = body.cleanOrphans === true; // 默认不清理孤儿数据

    console.log(`[Admin] cleanup-duplicates: dryRun=${dryRun}, fixMergedUrls=${fixMergedUrls}, cleanOrphans=${cleanOrphans}`);

    const actions: Record<string, unknown>[] = [];
    let deletedEpisodes = 0, deletedStoryboards = 0, fixedMergedUrls = 0, deletedOrphans = 0;

    // ===== 1. 清理重复 episodes =====
    const { data: allEpisodes, error: epErr } = await supabase
      .from('series_episodes')
      .select('id, series_id, episode_number, title, status, total_duration, merged_video_url, created_at, updated_at')
      .order('series_id').order('episode_number').order('updated_at', { ascending: false });

    if (epErr) return c.json({ success: false, error: `查询失败: ${epErr.message}` }, 500);

    // 按 (series_id, episode_number) 分组
    const groupMap = new Map<string, EpisodeRow[]>();
    for (const ep of (allEpisodes || [])) {
      const key = `${ep.series_id}__${ep.episode_number}`;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(ep);
    }

    for (const [key, episodes] of groupMap) {
      if (episodes.length <= 1) continue;

      // 选择最佳保留项的评分函数
      const scoreFn = (ep: EpisodeRow) => {
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

      // ��得分排序，第一个保留，其余删除
      const sorted = [...episodes].sort((a, b) => scoreFn(b) - scoreFn(a));
      const keep = sorted[0];
      const toDelete = sorted.slice(1);
      const deleteIds = toDelete.map((ep: EpisodeRow) => ep.id);

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
      const sbGroupMap = new Map<string, StoryboardRow[]>();
      for (const sb of allSb) {
        const key = `${sb.series_id}__${sb.episode_number}__${sb.scene_number}`;
        if (!sbGroupMap.has(key)) sbGroupMap.set(key, []);
        sbGroupMap.get(key)!.push(sb);
      }

      for (const [key, sbs] of sbGroupMap) {
        if (sbs.length <= 1) continue;

        const sbScoreFn = (sb: StoryboardRow) => {
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
        const deleteIds = toDelete.map((sb: StoryboardRow) => sb.id);

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
          } catch (e: unknown) {
            console.warn(`[Admin] cleanup: failed to normalize merged_video_url for ${ep.id}:`, getErrorMessage(e));
          }
        }
      }
    }

    // ===== 4. 清理孤儿数据 =====
    if (cleanOrphans && !dryRun) {
      const seriesIds = [...new Set((allEpisodes || []).map((ep: EpisodeRow) => ep.series_id))];
      if (seriesIds.length > 0) {
        const { data: existingSeries } = await supabase.from('series').select('id').in('id', seriesIds);
        const existingIds = new Set((existingSeries || []).map((s: { id: string }) => s.id));
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
  } catch (error: unknown) {
    console.error('[Admin] cleanup-duplicates error:', truncateErrorMsg(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
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
    const uniqueSeriesIds = [...new Set((episodes || []).map((ep: EpisodeRow) => ep.series_id))];
    let allRawSb: StoryboardRow[] = [];
    if (uniqueSeriesIds.length > 0) {
      const { data: sbData } = await supabase
        .from('series_storyboards').select('series_id, episode_number, scene_number, video_url, duration, description, image_url')
        .in('series_id', uniqueSeriesIds)
        .not('video_url', 'is', null)
        .order('scene_number', { ascending: true });
      allRawSb = sbData || [];
    }
    const rebuildSbMap = new Map<string, StoryboardRow[]>();
    for (const sb of allRawSb) {
      const key = `${sb.series_id}:${sb.episode_number}`;
      if (!rebuildSbMap.has(key)) rebuildSbMap.set(key, []);
      rebuildSbMap.get(key)!.push(sb);
    }

    let rebuilt = 0, skipped = 0, failed = 0;
    const results: Record<string, unknown>[] = [];

    for (const ep of (episodes || [])) {
      try {
        // v6.0.23: 从批量预取结果中获取，替��逐集查询
        const rawStoryboards = rebuildSbMap.get(`${ep.series_id}:${ep.episode_number}`) || [];

        const storyboards = rawStoryboards.filter((sb: StoryboardRow) => {
          const url = (sb.video_url || '').trim();
          return url.length > 0 && url.startsWith('http');
        });

        if (storyboards.length === 0) {
          skipped++;
          continue;
        }

        const videos = storyboards.map((sb: StoryboardRow) => ({
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
          totalDuration: videos.reduce((sum: number, v: { duration: number }) => sum + (v.duration || 10), 0),
          videos, createdAt: new Date().toISOString(),
        };
        const playlistJson = JSON.stringify(playlist);

        // 尝试上传到 OSS
        let mergedVideoUrl = playlistJson;
        if (isOSSConfigured()) {
          try {
            const objectKey = `playlists/${ep.series_id}/ep${ep.episode_number}-playlist.json`;
            mergedVideoUrl = await uploadToOSS(objectKey, new TextEncoder().encode(playlistJson).buffer, 'application/json');
          } catch (ossErr: unknown) { console.warn(`[MergeVideos] OSS upload failed for ep${ep.episode_number}, using inline JSON:`, getErrorMessage(ossErr)); }
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
      } catch (e: unknown) {
        failed++;
        console.warn(`[Admin] rebuild-merged-urls: ep ${ep.id} failed:`, getErrorMessage(e));
      }
    }

    console.log(`[Admin] rebuild-merged-urls: rebuilt=${rebuilt}, skipped=${skipped}, failed=${failed}`);
    return c.json({ success: true, data: { rebuilt, skipped, failed, total: episodes?.length || 0, results } });
  } catch (error: unknown) {
    console.error('[Admin] rebuild-merged-urls error:', truncateErrorMsg(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

// ==================== [R] 图片上传（参考图等） ====================

// v6.0.192: 多素材上传（图片+视频），支持批量上传用于AI创作参考
app.post(`${PREFIX}/upload-asset`, async (c) => {
  try {
    const userPhone = c.req.header('x-user-phone');
    if (!userPhone) {
      return c.json({ success: false, error: '请先登录后上传素材' }, 401);
    }
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
    const tag = (formData.get('tag') as string) || 'general';
    if (!file || !(file instanceof File)) {
      return c.json({ success: false, error: '未找到上传文件' }, 400);
    }
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isImage && !isVideo) {
      return c.json({ success: false, error: '仅支持图片或视频文件' }, 400);
    }
    const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return c.json({ success: false, error: `文件大小不能超过${isVideo ? '50' : '10'}MB` }, 400);
    }
    if (!isOSSConfigured()) {
      return c.json({ success: false, error: 'OSS存储未配置' }, 500);
    }
    const ext = file.name.split('.').pop() || (isVideo ? 'mp4' : 'png');
    const objectKey = `uploads/assets/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
    const arrayBuf = await file.arrayBuffer();
    const ossUrl = await uploadToOSS(objectKey, arrayBuf, file.type);
    console.log(`[Upload] Asset uploaded to OSS: ${ossUrl} (${(file.size / 1024).toFixed(1)}KB, type=${isVideo ? 'video' : 'image'}, tag=${tag})`);
    return c.json({
      success: true,
      data: { url: ossUrl, objectKey, size: file.size, type: isVideo ? 'video' : 'image', name: file.name, tag },
    });
  } catch (error: unknown) {
    console.error('[Upload] Asset upload error:', getErrorMessage(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

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
  } catch (error: unknown) {
    console.error('[Upload] Image upload error:', getErrorMessage(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

// ==================== [R] OSS URL 签名（公开桶直接返回原URL） ====================
// v5.5.0: 响应格式必须与前端期望严格匹配

// 单URL签名 — 前端期望 result.data.signedUrl
app.post(`${PREFIX}/oss/sign-url`, async (c) => {
  try {
    const { url } = await c.req.json();
    console.log(`[OSS] sign-url: ${(url || '').substring(0, 80)}...`);
    return c.json({ success: true, data: { signedUrl: url || '' } });
  } catch (error: unknown) {
    console.error('[OSS] sign-url error:', getErrorMessage(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

// v6.0.139: OSS CORS 状态查询 + 手动触发配置（?force=true 重置缓存强制重试）
app.get(`${PREFIX}/oss/cors-status`, async (c) => {
  try {
    const force = c.req.query('force') === 'true';
    if (force) {
      resetOSSCorsCache();
    }
    const result = await ensureOSSCors();
    return c.json({ success: true, data: result, forced: force });
  } catch (error: unknown) {
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
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
  } catch (error: unknown) {
    console.error('[OSS] sign-urls error:', getErrorMessage(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
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
  } catch (error: unknown) {
    console.error('[OSS] fetch-json error:', getErrorMessage(error));
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
});

// ==================== [R] 系列视频任务状态查询 ====================

// 查询指定系列所有分镜的视频任务状态 — 前端批量生成前调用，避免重复创建
app.get(`${PREFIX}/series/:seriesId/video-task-status`, async (c) => {
  try {
    const seriesId = c.req.param('seriesId');
    if (!seriesId) return c.json({ error: '缺少 seriesId' }, 400);

    // 1. 从 video_tasks 查询该系列所有相关任务（�� storyboardId 分组，每组取最新）
    const { data: tasks, error: taskErr } = await supabase.from('video_tasks')
      .select('task_id, status, video_url, volcengine_task_id, thumbnail, created_at, generation_metadata')
      .contains('generation_metadata', { seriesId })
      .order('created_at', { ascending: false })
      .limit(200);

    if (taskErr) {
      console.error('[VideoTaskStatus] Query error:', taskErr.message);
      return c.json({ error: taskErr.message }, 500);
    }

    // 2. 从 series_storyboards 查询已有 video_url 的分镜（可能��其他路径写入）
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

    const taskByStoryboard = new Map<string, Record<string, unknown>>();
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
          lastFrameUrl: task.generation_metadata?.lastFrameUrl || '',
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
  } catch (error: unknown) {
    console.error('[VideoTaskStatus] Error:', truncateErrorMsg(error));
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

// ==================== [S] 404处理 ====================

app.notFound((c) => c.json({ error: "404 Not Found", path: c.req.path, version: APP_VERSION }, 404));

// 启动日志 - 如果这行打印说明模块加载成功
console.log(`[App] ${APP_VERSION} initialized — VOLCENGINE=${!!VOLCENGINE_API_KEY}, AI=${!!ALIYUN_BAILIAN_API_KEY}, OSS=${isOSSConfigured() ? 'configured' : 'NOT_CONFIGURED'}, SUPABASE=${_SUPABASE_URL ? 'ok' : 'MISSING'}`);

export default app;