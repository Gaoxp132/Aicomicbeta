/**
 * ClientVideoMerger — 客户端本地视频合并（v6.0.130）
 *
 * v6.0.130: IRRECOVERABLE_SOURCES收窄——仅'expired-irrecoverable'跳过proxy，
 *   其他源(error/api-error/no-task-id)可能是瞬态错误，仍尝试proxy+DB fallback。
 *   video-proxy v6.0.130现在timeout也触发DB fallback，transient源有望通过proxy恢复。
 * v6.0.129: video-proxy POST body新增seriesId/episodeNumber/sceneNumber，
 *   启用video-proxy服务端DB fallback——代理403时自动查DB获取已转存OSS URL。
 *   即使bulk-refresh-urls失败/超时，video-proxy仍可逐场景自动恢复。
 * v6.0.128: DB-first URL刷新策略——Volcengine TOS签名URL过期后重查API返回同一个缓存URL(不重签)，
 *   所以改为后端先查DB中是否已有OSS URL(后台转存可能已完成)，直接返回公开桶URL。
 *   timeout增至60s，后端可能需要同步OSS转存。响应包含source breakdown用于调试。
 * v6.0.127: 修复 Volcengine TOS 签名URL过期导致 Proxy upstream 403——
 *   合并前批量调用 POST /storyboards/bulk-refresh-urls 刷新所有视频URL
 *   Volcengine TOS URL: 后端重新查询Volcengine API获取fresh URL + 触发后台OSS转存
 *   OSS URL: 公开桶直接返回原URL（或重签名）
 *   freshUrlMap 缓存 originalUrl→freshUrl，proxy和direct两条路径均使用effectiveUrl
 * v6.0.125: 修复 Proxy upstream 403 / 超时——合并前批量刷新所有OSS签名URL（2小时有效期）
 *   根因: storyboard.videoUrl 存储的OSS签名URL有时已过期（OSSAccessKeyId签名有限制有效期）
 *         过期的签名URL经由video-proxy转发时，OSS直接返回403 AccessDenied
 *         即使重试3次也会持续403（签名本身无效，重试无意义）
 *   修复: 下载循环开始前批量调用POST /oss/sign-urls刷新全部OSS URL（expiresIn=7200s=2h）
 *         freshUrlMap缓存 originalUrl→signedUrl，proxy和direct两条路径均使用effectiveUrl
 *         非OSS URL（volcengine CDN等）直接跳过，不影响现有逻辑
 * v6.0.114: video-proxy改用POST方法（避免GET query string超长致Failed to fetch）+ 重试4次+渐进退避
 * v6.0.111: 分辨率不匹配自动修复 + 代理CORS修复
 *   1. clientMergeEpisode 新增 preferredResolution 选项（与服务端 mp4concat.ts v6.0.93 对齐）
 *   2. 返回结构化 excludedScenes + majorityResolution，供调用方自动重新生成
 *   3. ASPECT_TO_RESOLUTION 映射添加到 utils/index.ts（客户端+服务端统一）
 *   4. 修复: 代理下载移除冗余 apikey 头（触发CORS预检失败致全部场景代理下载100%失败）
 *   5. 后端: CORS allowHeaders 补充 apikey（防御性措施）
 * v6.0.110: 三大修复
 *   1. 下载策略反转: proxy-first → direct-fallback（CORS 导致直接下载必失败，浪费时间）
 *   2. 超时防挂: 客户端 fetch 加 AbortController 30s/45s 超时 + 服务端 video-proxy 上游 30s 超时
 *   3. 场景号追踪: 段-场景映射贯穿全流程，分辨率排除报告精确到场景号
 * v6.0.109: 全局分辨率预过滤（修复批量合并多数派漂移）
 * v6.0.108: 三级下载策略（直接/代理/跳过）+ MP4 分辨率宽容合并
 * v6.0.105: 纯 TS MP4 concat 替换 FFmpeg.wasm
 * v6.0.101: 提取 clientMergeEpisode 为独立导出函数
 */
import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Download, Loader2, CheckCircle2, AlertCircle,
  Cpu, Film, ChevronDown, ChevronUp, RefreshCw, Wifi,
} from 'lucide-react';
import { Button } from '../ui';
import { getApiUrl, publicAnonKey } from '../../constants';
import { concatMP4 } from '../../lib/mp4-concat';
import type { Episode, Storyboard } from '../../types';

// ── 进度回调 ──────────────────────────────────────────────────────────
export interface ClientMergeProgress {
  phase: 'fetching' | 'merging';
  fetchDone: number;
  fetchTotal: number;
  mergePct: number;
  /** 0-100 整体百分比 */
  overallPct: number;
}

// ═══════════════════════════════════════════════════════════════════════
// [A] 独立合并函数（v6.0.110）— 纯 TS MP4 concat，无 FFmpeg/Worker 依赖
// ═══════════════════════════════════════════════════════════════════════

/** v6.0.110: 带场景号的段元数据，贯穿下载→过滤→合并全流程 */
interface SegmentMeta {
  data: Uint8Array;
  sceneNumber: number;
}

/** v6.0.110: 合并结果扩展 warnings 字段 */
export interface ClientMergeResult {
  blobUrl: string;
  sizeMB: string;
  /** 人类可读的警告信息（跳过的场景、分辨率排除等） */
  warnings: string[];
  /** v6.0.111: 因分辨率不匹配被排除的场景号 */
  excludedScenes: number[];
  /** v6.0.111: 多数派/首选分辨率 (e.g. "720x1280") */
  majorityResolution: string | null;
}

/** v6.0.111: 合并选项 */
export interface ClientMergeOptions {
  /**
   * 预期分辨率 "WxH"（来自系列 coherence_check.aspectRatio 映射）。
   * 与服务端 preferredResolution 逻辑一致：
   *   提供时，以该分辨率为「正确」基准，不匹配的段标记为异常；
   *   未提供时，退化为多数派投票。
   */
  preferredResolution?: string;
  /** v6.0.127: 系列ID，用于批量刷新Volcengine TOS过期URL */
  seriesId?: string;
}

/**
 * 带超时的 fetch 封装（AbortController）
 */
function fetchWithTimeout(url: string, opts: RequestInit & { timeoutMs: number }): Promise<Response> {
  const { timeoutMs, ...fetchOpts } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...fetchOpts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/**
 * 在浏览器端将多个分镜视频拼接成完整集视频。
 * v6.0.110: proxy-first + fetch timeout + scene-number tracking
 *
 * @returns ClientMergeResult — blobUrl 仅本地有效, warnings 包含跳过/排除详情
 * @throws 合并失败时抛出 Error
 */
export async function clientMergeEpisode(
  episode: Episode,
  storyboards: Storyboard[],
  onProgress?: (p: ClientMergeProgress) => void,
  options?: ClientMergeOptions
): Promise<ClientMergeResult> {
  const readyStoryboards = storyboards
    .filter(sb => {
      const url = sb.videoUrl || (sb as any).video_url || '';
      return typeof url === 'string' && url.trim().startsWith('http');
    })
    .sort((a, b) => a.sceneNumber - b.sceneNumber);

  if (readyStoryboards.length === 0) throw new Error('没有可合并的视频，请先生成分镜视频');

  // v6.0.128: 批量刷新所有视频URL（优先从DB查OSS URL，fallback Volcengine API+HEAD验证）
  // 根因: Volcengine TOS签名URL过期后，重查API返回同一个缓存URL(不会重签)
  // 正确策略: 后端先查DB中是否已有OSS URL（后台转存可能已完成），直接返回
  const freshUrlMap = new Map<string, string>();
  // v6.0.129: Track scenes whose URLs are irrecoverably expired (backend confirmed)
  // These scenes will be skipped without wasting time on proxy retries
  const irrecoverableScenes = new Set<number>();
  {
    const items = readyStoryboards.map(sb => ({
      sceneNumber: sb.sceneNumber,
      currentUrl: sb.videoUrl || (sb as any).video_url || '',
    }));

    // v6.0.132: 始终走 bulk-refresh-urls 端点（OSS URL也需HEAD验证，不再盲目passthrough）
    // 统一后端验证+DB fallback，前端不再区分URL类型
    {
      try {
        console.log(`[ClientMerge] Bulk-refreshing ${items.length} URLs via DB-first strategy...`);
        const refreshResp = await fetchWithTimeout(getApiUrl('/storyboards/bulk-refresh-urls'), {
          method: 'POST',
          timeoutMs: 60_000, // v6.0.128: 增加到60s，后端可能需要同步OSS转存
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            seriesId: options?.seriesId || '',
            episodeNumber: episode.episodeNumber,
            items,
          }),
        });
        if (refreshResp.ok) {
          const refreshJson = await refreshResp.json();
          const results: any[] = refreshJson.data?.results || [];
          let refreshedCount = 0;
          const sourceCounts: Record<string, number> = {};
          results.forEach((r: any) => {
            sourceCounts[r.source] = (sourceCounts[r.source] || 0) + 1;
            if (r.freshUrl && r.freshUrl !== r.originalUrl) {
              freshUrlMap.set(r.originalUrl, r.freshUrl);
              refreshedCount++;
            }
            // v6.0.132: 'expired-irrecoverable' (TOS) 和 'oss-unreachable' (OSS) 都标记为不可恢复
            // 后端已验证URL不可达且DB无替代URL——跳过proxy重试避免浪费时间
            if (r.freshUrl === r.originalUrl &&
                (r.source === 'expired-irrecoverable' || r.source === 'oss-unreachable')) {
              irrecoverableScenes.add(r.sceneNumber);
            }
          });
          console.log(`[ClientMerge] Bulk-refresh: ${refreshedCount}/${items.length} URLs resolved. Sources:`, JSON.stringify(sourceCounts));
          if (irrecoverableScenes.size > 0) {
            console.warn(`[ClientMerge] WARNING: ${irrecoverableScenes.size} scenes have irrecoverably expired URLs (will skip download): [${[...irrecoverableScenes].join(',')}]`);
          }
        } else {
          console.warn(`[ClientMerge] bulk-refresh-urls returned ${refreshResp.status}, falling back to original URLs`);
        }
      } catch (err: any) {
        console.warn('[ClientMerge] Bulk URL refresh failed (proceeding with original URLs):', err.message);
      }
    }
  }

  // ── 阶段 1：逐一下载分镜视频 ──────────────────────────────────────
  // v6.0.110: 策略反转 → 代理优先（绕过 CORS），直接下载兜底
  //           每次 fetch 带 AbortController 超时，避免死 URL 导致长时间挂起
  const total = readyStoryboards.length;
  const segmentsMeta: SegmentMeta[] = [];
  const skippedScenes: number[] = [];
  const warnings: string[] = [];

  console.log(`[ClientMerge] Starting download of ${total} segments (proxy→direct fallback, with timeouts)...`);

  for (let i = 0; i < total; i++) {
    onProgress?.({
      phase: 'fetching', fetchDone: i, fetchTotal: total, mergePct: 0,
      overallPct: Math.round((i / total) * 70),
    });

    const rawUrl = readyStoryboards[i].videoUrl || (readyStoryboards[i] as any).video_url || '';
    // v6.0.125: use fresh signed URL if available (avoids expired-signature 403)
    const effectiveUrl = freshUrlMap.get(rawUrl) || rawUrl;
    const sceneNum = readyStoryboards[i].sceneNumber;
    let downloaded = false;

    // v6.0.132: Skip scenes that the backend confirmed as irrecoverable (expired TOS or unreachable OSS)
    // Saves ~5min per scene (4 proxy retries × 75s timeout + delays) that would all fail
    if (irrecoverableScenes.has(sceneNum)) {
      console.warn(`[ClientMerge] ⏭️ Scene ${sceneNum} skipped: URL irrecoverable (backend confirmed — expired or unreachable, no fallback)`);
      skippedScenes.push(sceneNum);
      continue;
    }

    // ── 策略 1 (v6.0.114): 代理下载优先 — POST body 传 URL（避免 GET query string 超长致 Failed to fetch）──
    // v6.0.129: POST body 新增 seriesId/episodeNumber/sceneNumber，启用 video-proxy DB fallback on 403
    const proxyUrl = getApiUrl('/video-proxy');
    let proxyRetries = 3; // v6.0.114: 4次尝试（3+初始），从3次提升，应对 Edge Function 冷启动/过载

    while (proxyRetries >= 0 && !downloaded) {
      try {
        const resp = await fetchWithTimeout(proxyUrl, {
          method: 'POST',
          timeoutMs: 75_000, // v6.0.132: 45s→75s（服务端upstream timeout从30s提升到60s+网络开销）
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: effectiveUrl,
            seriesId: options?.seriesId || '',
            episodeNumber: episode.episodeNumber,
            sceneNumber: sceneNum,
          }),
        });
        if (!resp.ok) {
          // v6.0.110: 解析 JSON 错误体以获取超时信息
          let detail = `HTTP ${resp.status}`;
          try { const j = await resp.json(); detail = j.detail || detail; } catch {}
          throw new Error(`Proxy ${detail}`);
        }
        const buf = await resp.arrayBuffer();
        if (buf.byteLength > 1000) {
          segmentsMeta.push({ data: new Uint8Array(buf), sceneNumber: sceneNum });
          downloaded = true;
          console.log(`[ClientMerge] ✅ Proxy download ${i + 1}/${total} (scene ${sceneNum}): ${(buf.byteLength / 1024).toFixed(0)}KB`);
        } else {
          throw new Error(`Proxy returned tiny response (${buf.byteLength}B)`);
        }
      } catch (err: any) {
        const isAbort = err.name === 'AbortError';
        const msg = isAbort ? 'timeout(75s)' : err.message;
        proxyRetries--;
        if (proxyRetries >= 0) {
          const delay = (3 - proxyRetries) * 1500; // 1.5s, 3s, 4.5s, 6s 渐进退避
          console.warn(`[ClientMerge] Proxy attempt failed for scene ${sceneNum} (${msg}), retry in ${delay / 1000}s (${proxyRetries} left)...`);
          await new Promise(r => setTimeout(r, delay));
        } else {
          console.warn(`[ClientMerge] Proxy exhausted for scene ${sceneNum} (${msg}), trying direct...`);
        }
      }
    }

    // ── 策略 2: 直接下载兜底（OSS 公开桶 + CORS 已配置时可用）──
    if (!downloaded) {
      try {
        const directResp = await fetchWithTimeout(effectiveUrl, { timeoutMs: 60_000 }); // v6.0.132: 30s→60s
        if (directResp.ok) {
          const buf = await directResp.arrayBuffer();
          if (buf.byteLength > 1000) {
            segmentsMeta.push({ data: new Uint8Array(buf), sceneNumber: sceneNum });
            downloaded = true;
            console.log(`[ClientMerge] ✅ Direct download ${i + 1}/${total} (scene ${sceneNum}): ${(buf.byteLength / 1024).toFixed(0)}KB`);
          }
        }
      } catch (directErr: any) {
        // CORS 或超时 → 最终放弃
      }
    }

    if (!downloaded) {
      console.warn(`[ClientMerge] ❌ Scene ${sceneNum} all download methods failed`);
      skippedScenes.push(sceneNum);
    }
  }

  onProgress?.({
    phase: 'fetching', fetchDone: total, fetchTotal: total, mergePct: 0,
    overallPct: 70,
  });

  if (segmentsMeta.length === 0) throw new Error('所有分镜视频下载失败，请检查网络连接后重试');
  if (skippedScenes.length > 0) {
    const msg = `场景 ${skippedScenes.join(', ')} 下载失败已跳过`;
    warnings.push(msg);
    console.warn(`[ClientMerge] ${skippedScenes.length} scenes skipped: [${skippedScenes.join(',')}]`);
    // v6.0.121: 若有场景下载失败，抛出错误而非静默跳过——确保合并完整性
    // 用户应重试，或检查视频URL是否有效
    // v6.0.129: 区分过期URL（需重新生成）和网络失败（可重试）
    const expiredScenes = skippedScenes.filter(s => irrecoverableScenes.has(s));
    const networkFailScenes = skippedScenes.filter(s => !irrecoverableScenes.has(s));
    let errorMsg = `${skippedScenes.length} 个分镜（场景 ${skippedScenes.join(', ')}）下载失败，无法完整合并。`;
    if (expiredScenes.length > 0) {
      errorMsg += `\n场景 ${expiredScenes.join(', ')} 的视频链接已过期或不可达，请对这些场景重新生成视频。`;
    }
    if (networkFailScenes.length > 0) {
      errorMsg += `\n场景 ${networkFailScenes.join(', ')} 可能是网络问题，请稍后重试。`;
    }
    throw new Error(errorMsg);
  }

  // ── v6.0.121: 移除分辨率预过滤——包容所有分辨率段（现代解码器处理流内SPS变更）
  // 原v6.0.109-111 resolution pre-filter 逻辑已移除
  // 若有分辨率差异，由 concatMP4 内部记录警告但保留所有段
  const excludedSceneNums: number[] = []; // 保留字段兼容性，始终为空
  const resolvedMajorityKey: string | null = null;

  // 提取纯数据数组供 concatMP4 使用
  const segments = segmentsMeta.map(s => s.data);

  // ── 阶段 2：纯 TS MP4 拼接（主线程，无 Worker）────────────────────
  onProgress?.({
    phase: 'merging', fetchDone: total, fetchTotal: total, mergePct: 10,
    overallPct: 75,
  });

  console.log(`[ClientMerge] Concatenating ${segments.length} segments using pure-TS MP4 concat...`);

  let result: { data: Uint8Array; duration: number; videoCount: number; totalSamples: number; excludedSegments?: number };

  if (segments.length === 1) {
    result = { data: segments[0], duration: 0, videoCount: 1, totalSamples: 0 };
  } else {
    // 分批合并以允许UI呼吸（避免长时间阻塞主线程）
    const BATCH_SIZE = 4;
    if (segments.length <= BATCH_SIZE + 1) {
      // 段数较少，直接合并
      result = concatMP4(segments);
    } else {
      // 链式分批合并每批处理 BATCH_SIZE 个新段 + 上一批结果
      console.log(`[ClientMerge] Batch concat: ${segments.length} segments in batches of ${BATCH_SIZE}`);
      let intermediate = segments[0];
      for (let bStart = 1; bStart < segments.length; bStart += BATCH_SIZE) {
        const bEnd = Math.min(bStart + BATCH_SIZE, segments.length);
        const batchSegs = [intermediate, ...segments.slice(bStart, bEnd)];

        // 让UI有机会更新（yield to event loop）
        await new Promise(r => setTimeout(r, 0));
        onProgress?.({
          phase: 'merging', fetchDone: total, fetchTotal: total,
          mergePct: Math.round((bEnd / segments.length) * 90),
          overallPct: 75 + Math.round((bEnd / segments.length) * 23),
        });

        const bRes = concatMP4(batchSegs);
        intermediate = bRes.data;

        // 释放已处理的段
        for (let ii = bStart; ii < bEnd; ii++) {
          (segments as any)[ii] = null;
        }
        console.log(`[ClientMerge] Batch [${bStart}-${bEnd - 1}] done: ${(intermediate.length / 1024 / 1024).toFixed(1)}MB`);
      }
      result = { data: intermediate, duration: 0, videoCount: segments.length, totalSamples: 0 };
    }
  }

  onProgress?.({
    phase: 'merging', fetchDone: total, fetchTotal: total, mergePct: 100,
    overallPct: 98,
  });

  // ── 阶段 3：生成 Blob URL ──────────────────────────────────────────
  const blob = new Blob([result.data], { type: 'video/mp4' });
  const blobUrl = URL.createObjectURL(blob);
  const sizeMB = (blob.size / 1024 / 1024).toFixed(1);

  console.log(`[ClientMerge] Done: ${sizeMB}MB, ${result.videoCount} segments merged (all scenes included, no resolution filtering)`);

  return { blobUrl, sizeMB, warnings, excludedScenes: excludedSceneNums, majorityResolution: resolvedMajorityKey };
}

// ═══════════════════════════════════════════════════════════════════════
// [B] UI 组件（保留供高级用户手动触发）
// ═══════════════════════════════════════════════════════════════════════

type Phase = 'idle' | 'fetching' | 'merging' | 'done' | 'error';

interface MergeProgress {
  phase: Phase;
  pct: number;
  fetchDone: number;
  fetchTotal: number;
  mergePct: number;
  errorMsg: string;
  downloadUrl: string;
  downloadSizeMB: string;
  skipped: number;
}

const INIT_PROGRESS: MergeProgress = {
  phase: 'idle', pct: 0, fetchDone: 0, fetchTotal: 0,
  mergePct: 0, errorMsg: '', downloadUrl: '', downloadSizeMB: '', skipped: 0,
};

interface ClientVideoMergerProps {
  episode: Episode;
  storyboards: Storyboard[];
  onComplete?: (blobUrl: string, sizeMB: string) => void;
}

export function ClientVideoMerger({ episode, storyboards, onComplete }: ClientVideoMergerProps) {
  const [expanded, setExpanded] = useState(false);
  const [prog, setProg] = useState<MergeProgress>(INIT_PROGRESS);

  const readyStoryboards = storyboards
    .filter(sb => {
      const url = sb.videoUrl || (sb as any).video_url || '';
      return typeof url === 'string' && url.trim().startsWith('http');
    })
    .sort((a, b) => a.sceneNumber - b.sceneNumber);

  const hasVideos = readyStoryboards.length > 0;
  const isRunning = ['fetching', 'merging'].includes(prog.phase);

  const overallPct = (() => {
    switch (prog.phase) {
      case 'fetching': return prog.fetchTotal > 0 ? Math.round((prog.fetchDone / prog.fetchTotal) * 70) : 5;
      case 'merging': return 70 + Math.round(prog.mergePct * 0.28);
      case 'done': return 100;
      default: return 0;
    }
  })();

  const handleMerge = useCallback(async () => {
    if (isRunning) return;
    if (prog.downloadUrl) URL.revokeObjectURL(prog.downloadUrl);
    setProg({ ...INIT_PROGRESS, phase: 'fetching' });

    try {
      const { blobUrl, sizeMB } = await clientMergeEpisode(
        episode,
        storyboards,
        (p) => {
          setProg(prev => ({
            ...prev,
            phase: p.phase,
            fetchDone: p.fetchDone,
            fetchTotal: p.fetchTotal,
            mergePct: p.mergePct,
          }));
        }
      );

      // 自动触发下载
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `第${episode.episodeNumber || 1}集-完整视频.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setProg(p => ({ ...p, phase: 'done', mergePct: 100, downloadUrl: blobUrl, downloadSizeMB: sizeMB }));
      onComplete?.(blobUrl, sizeMB);
    } catch (err: any) {
      console.error('[ClientVideoMerger] Merge error:', err);
      setProg(p => ({ ...p, phase: 'error', errorMsg: err.message }));
    }
  }, [isRunning, prog.downloadUrl, episode, storyboards, onComplete]);

  const handleReDownload = () => {
    if (!prog.downloadUrl) return;
    const a = document.createElement('a');
    a.href = prog.downloadUrl;
    a.download = `第${episode.episodeNumber || 1}集-完整视频.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (!hasVideos) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/3 overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center flex-shrink-0">
            <Cpu className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-white">备用本地合并</p>
            <p className="text-[10px] text-gray-500 mt-0.5">服务器合并失败时的备选方案 · 在您设备上运行</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {prog.phase === 'done' && (
            <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">已完成</span>
          )}
          {isRunning && <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />}
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/8 px-4 pb-4 pt-3 space-y-3">
              <div className="flex gap-2 text-xs text-gray-400 bg-white/3 rounded-xl p-3">
                <Wifi className="w-3.5 h-3.5 text-violet-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p>频在您的设备本地完成拼接，<span className="text-white">不占用服务器资源</span>，可绕过服务器内存限制。</p>
                  <p className="text-gray-500">使用浏览器内置 MP4 解析引擎，无需下载额外组件。</p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Film className="w-3.5 h-3.5" />
                <span>准备合并 <span className="text-white font-medium">{readyStoryboards.length}</span> 个分镜视频</span>
                {prog.skipped > 0 && <span className="text-orange-400">（{prog.skipped} 个跳过）</span>}
              </div>

              {prog.phase !== 'idle' && prog.phase !== 'error' && prog.phase !== 'done' && (
                <div className="space-y-2">
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-400"
                      initial={{ width: 0 }}
                      animate={{ width: `${overallPct}%` }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-violet-300">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {prog.phase === 'fetching' && `下载分镜视频 ${prog.fetchDone} / ${prog.fetchTotal}...`}
                      {prog.phase === 'merging' && `本地拼接中 ${prog.mergePct}%...`}
                    </div>
                    <span className="text-gray-500">{overallPct}%</span>
                  </div>
                </div>
              )}

              {prog.phase === 'done' && (
                <div className="flex items-center justify-between bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    <div>
                      <p className="text-sm text-green-300 font-medium">合并完成！已自动下载</p>
                      <p className="text-xs text-green-400/70">文件大小：{prog.downloadSizeMB} MB</p>
                    </div>
                  </div>
                  <button
                    onClick={handleReDownload}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-300 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    再次下载
                  </button>
                </div>
              )}

              {prog.phase === 'error' && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-300 whitespace-pre-wrap">{prog.errorMsg}</p>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handleMerge}
                  disabled={isRunning}
                  className="flex-1 bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-600 hover:to-indigo-600 disabled:opacity-50"
                >
                  {isRunning ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {prog.phase === 'fetching' ? '下载视频...' : '合并中...'}
                    </>
                  ) : prog.phase === 'done' ? (
                    <><RefreshCw className="w-4 h-4 mr-2" />重新合并</>
                  ) : (
                    <><Download className="w-4 h-4 mr-2" />开始本地合并并下载</>
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}