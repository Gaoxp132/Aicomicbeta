/**
 * clientMergeLogic.ts — Pure logic for client-side episode video merging
 * Extracted from ClientVideoMerger.tsx to keep UI and logic separate.
 *
 * v6.0.145: auto-recover irrecoverable TOS URLs via recoverAllTasks before skipping
 * v6.0.138: OSS CORS-free direct download via presigned GET URL + retry enhancement
 * v6.0.135: 5-bug fix for "irrecoverably expired URLs" + "Proxy upstream 403"
 * v6.0.132: video-proxy POST body + timeout 60s + DB fallback
 * v6.0.110: proxy-first + fetch timeout + scene-number tracking
 * v6.0.105: pure TS MP4 concat (no FFmpeg.wasm)
 * v6.0.101: extracted clientMergeEpisode as standalone export
 */
import { getApiUrl, publicAnonKey } from '../../constants';
import { concatMP4 } from '../../lib/mp4-concat';
import { recoverAllTasks } from '../../services/volcengine';
import type { Episode, Storyboard } from '../../types';
import { sbVideoUrl } from '../../utils';
import { getErrorMessage } from '../../utils';

// ── Progress callback ────────────────────────────────────────────────
export interface ClientMergeProgress {
  phase: 'fetching' | 'merging';
  fetchDone: number;
  fetchTotal: number;
  mergePct: number;
  /** 0-100 overall percentage */
  overallPct: number;
}

/** Segment metadata with scene number tracking */
interface SegmentMeta {
  data: Uint8Array;
  sceneNumber: number;
}

/** Merge result with warnings and diagnostics */
export interface ClientMergeResult {
  blobUrl: string;
  sizeMB: string;
  warnings: string[];
  excludedScenes: number[];
  majorityResolution: string | null;
}

/** Merge options */
export interface ClientMergeOptions {
  preferredResolution?: string;
  seriesId?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

function fetchWithTimeout(url: string, opts: RequestInit & { timeoutMs: number }): Promise<Response> {
  const { timeoutMs, ...fetchOpts } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...fetchOpts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// ═════════════════════════════════════════════════════════════════════
// clientMergeEpisode — pure TS MP4 concat, no FFmpeg/Worker dependency
// ════════════════════════════════════════════════════════════════════

export async function clientMergeEpisode(
  episode: Episode,
  storyboards: Storyboard[],
  onProgress?: (p: ClientMergeProgress) => void,
  options?: ClientMergeOptions
): Promise<ClientMergeResult> {
  const readyStoryboards = storyboards
    .filter(sb => {
      const url = sbVideoUrl(sb);
      return url.startsWith('http');
    })
    .sort((a, b) => a.sceneNumber - b.sceneNumber);

  if (readyStoryboards.length === 0) throw new Error('没有可合并的视频，请先生成分镜视频');

  // v6.0.128: bulk-refresh all video URLs (DB-first strategy)
  const freshUrlMap = new Map<string, string>();
  const presignedGetUrlMap = new Map<number, string>();
  const irrecoverableScenes = new Set<number>();
  const ossUnreachableScenes = new Set<number>();
  {
    const items = readyStoryboards.map(sb => ({
      sceneNumber: sb.sceneNumber,
      currentUrl: sbVideoUrl(sb),
    }));

    {
      try {
        console.log(`[ClientMerge] Bulk-refreshing ${items.length} URLs via DB-first strategy...`);
        const refreshResp = await fetchWithTimeout(getApiUrl('/storyboards/bulk-refresh-urls'), {
          method: 'POST',
          timeoutMs: 60_000,
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            seriesId: options?.seriesId,
            episodeNumber: episode.episodeNumber,
            items,
          }),
        });
        if (refreshResp.ok) {
          const refreshJson = await refreshResp.json() as Record<string, unknown>;
          const refreshData = refreshJson.data as Record<string, unknown> | undefined;
          const results: Record<string, unknown>[] = (refreshData?.results || []) as Record<string, unknown>[];
          let refreshedCount = 0;
          const sourceCounts: Record<string, number> = {};
          results.forEach((r: Record<string, unknown>) => {
            const source = r.source as string;
            sourceCounts[source] = (sourceCounts[source] || 0) + 1;
            if (r.freshUrl && r.freshUrl !== r.originalUrl) {
              freshUrlMap.set(r.originalUrl as string, r.freshUrl as string);
              refreshedCount++;
            }
            if (r.presignedGetUrl) {
              presignedGetUrlMap.set(r.sceneNumber as number, r.presignedGetUrl as string);
            }
            if (r.freshUrl === r.originalUrl) {
              if (r.source === 'expired-irrecoverable') {
                irrecoverableScenes.add(r.sceneNumber as number);
              } else if (r.source === 'oss-unreachable') {
                ossUnreachableScenes.add(r.sceneNumber as number);
              }
            }
          });
          if (presignedGetUrlMap.size > 0) {
            console.log(`[ClientMerge] Got ${presignedGetUrlMap.size} presigned GET URLs for CORS-free direct download`);
          }
          console.log(`[ClientMerge] Bulk-refresh: ${refreshedCount}/${items.length} URLs resolved. Sources:`, JSON.stringify(sourceCounts));
          if (irrecoverableScenes.size > 0) {
            console.warn(`[ClientMerge] WARNING: ${irrecoverableScenes.size} scenes have irrecoverably expired TOS URLs (will skip download): [${[...irrecoverableScenes].join(',')}]`);
          }
          if (ossUnreachableScenes.size > 0) {
            console.warn(`[ClientMerge] WARNING: ${ossUnreachableScenes.size} scenes have unreachable OSS URLs (will try 1 proxy attempt each): [${[...ossUnreachableScenes].join(',')}]`);
          }
        } else {
          console.warn(`[ClientMerge] bulk-refresh-urls returned ${refreshResp.status}, falling back to original URLs`);
        }
      } catch (err: unknown) {
        console.warn('[ClientMerge] Bulk URL refresh failed (proceeding with original URLs):', getErrorMessage(err));
      }
    }
  }

  // ── v6.0.145: Auto-recover irrecoverable scenes via recoverAllTasks ────────
  if (irrecoverableScenes.size > 0 && options?.seriesId) {
    try {
      console.log(`[ClientMerge] Attempting auto-recovery for ${irrecoverableScenes.size} irrecoverable scenes via recoverAllTasks...`);
      const recoveryResult = await recoverAllTasks(options.seriesId);
      console.log(`[ClientMerge] Recovery result: recovered=${recoveryResult.recovered}, ossTransferred=${recoveryResult.ossTransferred}, failed=${recoveryResult.failed}`);

      if (recoveryResult.recovered > 0 || recoveryResult.ossTransferred > 0) {
        const retryItems = readyStoryboards
          .filter(sb => irrecoverableScenes.has(sb.sceneNumber))
          .map(sb => ({
            sceneNumber: sb.sceneNumber,
            currentUrl: sbVideoUrl(sb),
          }));

        console.log(`[ClientMerge] Re-checking ${retryItems.length} previously irrecoverable scenes after recovery...`);
        try {
          const retryResp = await fetchWithTimeout(getApiUrl('/storyboards/bulk-refresh-urls'), {
            method: 'POST',
            timeoutMs: 30_000,
            headers: {
              'Authorization': `Bearer ${publicAnonKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              seriesId: options.seriesId,
              episodeNumber: episode.episodeNumber,
              items: retryItems,
            }),
          });
          if (retryResp.ok) {
            const retryJson = await retryResp.json() as Record<string, unknown>;
            const retryData = retryJson.data as Record<string, unknown> | undefined;
            const retryResults: Record<string, unknown>[] = (retryData?.results || []) as Record<string, unknown>[];
            let recoveredCount = 0;
            retryResults.forEach((r: Record<string, unknown>) => {
              if (r.source !== 'expired-irrecoverable' && r.source !== 'error' && r.source !== 'no-task-id') {
                irrecoverableScenes.delete(r.sceneNumber as number);
                if (r.freshUrl && r.freshUrl !== r.originalUrl) {
                  freshUrlMap.set(r.originalUrl as string, r.freshUrl as string);
                }
                if (r.presignedGetUrl) {
                  presignedGetUrlMap.set(r.sceneNumber as number, r.presignedGetUrl as string);
                }
                recoveredCount++;
              }
            });
            if (recoveredCount > 0) {
              console.log(`[ClientMerge] Auto-recovery rescued ${recoveredCount} scenes! Remaining irrecoverable: ${irrecoverableScenes.size}`);
            } else {
              console.warn(`[ClientMerge] Auto-recovery did not rescue any scenes — they truly need video regeneration`);
            }
          }
        } catch (retryErr: unknown) {
          console.warn(`[ClientMerge] Re-check after recovery failed: ${getErrorMessage(retryErr)}`);
        }
      } else {
        console.warn(`[ClientMerge] recoverAllTasks found nothing to recover — scenes truly need video regeneration`);
      }
    } catch (recoverErr: unknown) {
      console.warn(`[ClientMerge] Auto-recovery failed (non-blocking): ${getErrorMessage(recoverErr)}`);
    }
  }

  // ── Phase 1: Download segments (parallel x3, proxy→direct fallback) ────────
  const total = readyStoryboards.length;
  const segmentsMeta: SegmentMeta[] = [];
  const skippedScenes: number[] = [];
  const warnings: string[] = [];

  console.log(`[ClientMerge] Starting download of ${total} segments (parallel*3, proxy->direct fallback, with timeouts)...`);

  const PARALLEL_LIMIT = 3;
  let fetchDoneCount = 0;
  let totalBytesDownloaded = 0;

  const resultSlots: Array<SegmentMeta | null> = new Array(total).fill(null);
  const skippedSet = new Set<number>();

  async function downloadSegment(i: number): Promise<void> {
    const rawUrl = sbVideoUrl(readyStoryboards[i]);
    const effectiveUrl = freshUrlMap.get(rawUrl) || rawUrl;
    const sceneNum = readyStoryboards[i].sceneNumber;
    let downloaded = false;

    if (irrecoverableScenes.has(sceneNum)) {
      console.warn(`[ClientMerge] Scene ${sceneNum} skipped: TOS URL irrecoverably expired`);
      skippedSet.add(sceneNum);
      fetchDoneCount++;
      return;
    }

    // ── Strategy 1: Proxy-first ──
    // v6.0.194: OSS-unreachable scenes should STILL use proxy (it's the only viable path
    // since direct download will CORS-fail). HEAD check timeout ≠ GET download failure.
    const proxyUrl = getApiUrl('/video-proxy');
    let proxyRetries = 3;

    while (proxyRetries >= 0 && !downloaded) {
      try {
        // v6.0.194: 75s→130s — server-side OSS fetch now takes up to 120s, add 10s overhead
        const resp = await fetchWithTimeout(proxyUrl, {
          method: 'POST',
          timeoutMs: 130_000,
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: effectiveUrl,
            seriesId: options?.seriesId,
            episodeNumber: episode.episodeNumber,
            sceneNumber: sceneNum,
          }),
        });
        if (!resp.ok) {
          let detail = `HTTP ${resp.status}`;
          let isOssTimeout = false;
          try {
            const j = await resp.json();
            detail = j.detail || detail;
            if (resp.status === 504 && (j.ossUrl || effectiveUrl.includes('.aliyuncs.com'))) {
              isOssTimeout = true;
            }
          } catch {}
          if (isOssTimeout) {
            console.warn(`[ClientMerge] Scene ${sceneNum}: OSS proxy timeout, skipping to direct download`);
            proxyRetries = -1;
            continue;
          }
          throw new Error(`Proxy ${detail}`);
        }
        const buf = await resp.arrayBuffer();
        if (buf.byteLength > 1000) {
          resultSlots[i] = { data: new Uint8Array(buf), sceneNumber: sceneNum };
          downloaded = true;
          totalBytesDownloaded += buf.byteLength;
          console.log(`[ClientMerge] Proxy download ${i + 1}/${total} (scene ${sceneNum}): ${(buf.byteLength / 1024).toFixed(0)}KB`);
        } else {
          throw new Error(`Proxy returned tiny response (${buf.byteLength}B)`);
        }
      } catch (err: unknown) {
        const isAbort = err instanceof Error && err.name === 'AbortError';
        const isOssUrl = effectiveUrl.includes('.aliyuncs.com');
        if (isAbort && isOssUrl) {
          console.warn(`[ClientMerge] Scene ${sceneNum}: client timeout on OSS proxy, skipping to direct`);
          proxyRetries = -1;
        } else {
          proxyRetries--;
        }
        if (proxyRetries >= 0) {
          const delay = (3 - proxyRetries) * 1500;
          console.warn(`[ClientMerge] Proxy failed for scene ${sceneNum} (${isAbort ? 'timeout' : getErrorMessage(err)}), retry in ${delay / 1000}s (${proxyRetries} left)...`);
          await new Promise(r => setTimeout(r, delay));
        } else {
          console.warn(`[ClientMerge] Proxy exhausted for scene ${sceneNum}, trying direct...`);
        }
      }
    }

    // ── Strategy 2: Direct download fallback ──
    if (!downloaded) {
      const directUrls: Array<{ url: string; label: string }> = [];
      const presignedUrl = presignedGetUrlMap.get(sceneNum);
      if (presignedUrl) {
        directUrls.push({ url: presignedUrl, label: 'presigned-GET' });
      }
      if (!presignedUrl || presignedUrl !== effectiveUrl) {
        directUrls.push({ url: effectiveUrl, label: 'original' });
      }

      for (const { url: directUrl, label: urlLabel } of directUrls) {
        if (downloaded) break;
        for (let directAttempt = 0; directAttempt < 2 && !downloaded; directAttempt++) {
          try {
            const directResp = await fetchWithTimeout(directUrl, { timeoutMs: 60_000 });
            if (directResp.ok) {
              const buf = await directResp.arrayBuffer();
              if (buf.byteLength > 1000) {
                resultSlots[i] = { data: new Uint8Array(buf), sceneNumber: sceneNum };
                downloaded = true;
                totalBytesDownloaded += buf.byteLength;
                console.log(`[ClientMerge] Direct [${urlLabel}] ${i + 1}/${total} (scene ${sceneNum}): ${(buf.byteLength / 1024).toFixed(0)}KB`);
              }
            } else {
              console.warn(`[ClientMerge] Direct [${urlLabel}] scene ${sceneNum}: HTTP ${directResp.status}`);
            }
          } catch (directErr: unknown) {
            const isAbort = directErr instanceof Error && directErr.name === 'AbortError';
            const isTypeError = directErr instanceof TypeError;
            const diagType = isAbort ? 'TIMEOUT(60s)' : isTypeError ? 'CORS/NETWORK' : getErrorMessage(directErr);
            console.warn(`[ClientMerge] Direct [${urlLabel}] scene ${sceneNum} attempt ${directAttempt + 1}/2: ${diagType}`);
            if (directAttempt === 0 && !isAbort) {
              await new Promise(r => setTimeout(r, 2000));
            }
          }
        }
      }
    }

    if (!downloaded) {
      console.warn(`[ClientMerge] Scene ${sceneNum} all download methods failed`);
      skippedSet.add(sceneNum);
    }

    fetchDoneCount++;
    onProgress?.({
      phase: 'fetching', fetchDone: fetchDoneCount, fetchTotal: total, mergePct: 0,
      overallPct: Math.round((fetchDoneCount / total) * 70),
    });
  }

  // Execute parallel download (semaphore pattern)
  {
    const queue = Array.from({ length: total }, (_, i) => i);
    const workers: Promise<void>[] = [];

    for (let w = 0; w < Math.min(PARALLEL_LIMIT, total); w++) {
      workers.push((async () => {
        while (queue.length > 0) {
          const idx = queue.shift()!;
          await downloadSegment(idx);
        }
      })());
    }
    await Promise.all(workers);
  }

  // Collect ordered results
  for (let i = 0; i < total; i++) {
    if (resultSlots[i]) segmentsMeta.push(resultSlots[i]!);
  }
  skippedSet.forEach(s => skippedScenes.push(s));

  console.log(`[ClientMerge] Download complete: ${segmentsMeta.length}/${total} segments, ${(totalBytesDownloaded / 1024 / 1024).toFixed(1)}MB total`);

  onProgress?.({
    phase: 'fetching', fetchDone: total, fetchTotal: total, mergePct: 0,
    overallPct: 70,
  });

  if (segmentsMeta.length === 0) throw new Error('所有分镜视频下载失败，请检查网络连接后重试');
  if (skippedScenes.length > 0) {
    console.warn(`[ClientMerge] ${skippedScenes.length} scenes skipped: [${skippedScenes.join(',')}]`);
    const expiredScenes = skippedScenes.filter(s => irrecoverableScenes.has(s) || ossUnreachableScenes.has(s));
    const networkFailScenes = skippedScenes.filter(s => !irrecoverableScenes.has(s) && !ossUnreachableScenes.has(s));

    if (networkFailScenes.length > 0) {
      let errorMsg = `${networkFailScenes.length} 个分镜（场景 ${networkFailScenes.join(', ')}）网络下载失败，无法完整合并，请稍后重试。`;
      if (expiredScenes.length > 0) {
        errorMsg += `\n另有场景 ${expiredScenes.join(', ')} 视频链接已过期或不可达，请对这些场景重新生成视频。`;
      }
      throw new Error(errorMsg);
    }

    const expiredMsg = `${expiredScenes.length} 个场景（${expiredScenes.join(', ')}）视频已过期或不可达，已跳过合并（请重新生成这些场景的视频）`;
    warnings.push(expiredMsg);
    console.warn(`[ClientMerge] Proceeding with partial merge — ${expiredMsg}`);
  }

  // v6.0.121: No resolution pre-filter — include all segments
  const excludedSceneNums: number[] = [];
  const resolvedMajorityKey: string | null = null;

  const segments: (Uint8Array | null)[] = segmentsMeta.map(s => s.data);

  // ── Phase 2: Pure TS MP4 concat (main thread) ─────────────────────
  onProgress?.({
    phase: 'merging', fetchDone: total, fetchTotal: total, mergePct: 10,
    overallPct: 75,
  });

  console.log(`[ClientMerge] Concatenating ${segments.length} segments using pure-TS MP4 concat...`);

  let result: { data: Uint8Array; duration: number; videoCount: number; totalSamples: number; excludedSegments?: number; resolutionMismatch?: { resolutions: Map<string, number[]> } };

  if (segments.length === 1) {
    result = { data: segments[0]!, duration: 0, videoCount: 1, totalSamples: 0 } as typeof result;
  } else {
    const BATCH_SIZE = 4;
    if (segments.length <= BATCH_SIZE + 1) {
      result = concatMP4(segments.filter((s): s is Uint8Array => s !== null));
    } else {
      console.log(`[ClientMerge] Batch concat: ${segments.length} segments in batches of ${BATCH_SIZE}`);
      let intermediate = segments[0]!;
      for (let bStart = 1; bStart < segments.length; bStart += BATCH_SIZE) {
        const bEnd = Math.min(bStart + BATCH_SIZE, segments.length);
        const batchSegs = [intermediate, ...segments.slice(bStart, bEnd).filter((s): s is Uint8Array => s !== null)];

        await new Promise(r => setTimeout(r, 0));
        onProgress?.({
          phase: 'merging', fetchDone: total, fetchTotal: total,
          mergePct: Math.round((bEnd / segments.length) * 90),
          overallPct: 75 + Math.round((bEnd / segments.length) * 23),
        });

        const bRes = concatMP4(batchSegs);
        intermediate = bRes.data;

        for (let ii = bStart; ii < bEnd; ii++) {
          segments[ii] = null;
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

  // ── Phase 3: Create Blob URL ──────────────────────────────────────
  const blob = new Blob([result.data], { type: 'video/mp4' });
  const blobUrl = URL.createObjectURL(blob);
  const sizeMB = (blob.size / 1024 / 1024).toFixed(1);

  // v6.0.194: Surface resolution mismatch warning with actionable scene numbers
  if (result.resolutionMismatch) {
    const { resolutions } = result.resolutionMismatch;
    // Find the majority resolution and list minority scenes
    let majorityRes = '';
    let majorityCount = 0;
    const mismatchedSceneNums: number[] = [];
    for (const [res, indices] of resolutions) {
      if (indices.length > majorityCount) {
        // Move previous majority's scenes to mismatched
        if (majorityRes) {
          const prevIndices = resolutions.get(majorityRes)!;
          mismatchedSceneNums.push(...prevIndices.map(idx => segmentsMeta[idx]?.sceneNumber).filter((n): n is number => n != null));
        }
        majorityRes = res;
        majorityCount = indices.length;
      } else {
        mismatchedSceneNums.push(...indices.map(idx => segmentsMeta[idx]?.sceneNumber).filter((n): n is number => n != null));
      }
    }
    if (mismatchedSceneNums.length > 0) {
      const warnMsg = `视频已合并，但场景 ${mismatchedSceneNums.join(', ')} 的分辨率与其他分镜不同（多数为 ${majorityRes}），播放时可能有画面尺寸跳变。建议对这些场景重新生成视频以统一分辨率。`;
      warnings.push(warnMsg);
      console.warn(`[ClientMerge] Resolution mismatch: majority=${majorityRes}, mismatched scenes=[${mismatchedSceneNums.join(',')}]`);
    }
  }

  console.log(`[ClientMerge] Done: ${sizeMB}MB, ${result.videoCount} segments merged`);

  return { blobUrl, sizeMB, warnings, excludedScenes: excludedSceneNums, majorityResolution: resolvedMajorityKey };
}