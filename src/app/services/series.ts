/**
 * Series Service - CRUD, polling, AI episode generation, video prompt builder
 * Split from consolidated services/index.ts (v6.0.68)
 */

import { apiRequest } from '../utils';
import type { ApiResponse, Series, SeriesFormData, Episode, Storyboard } from '../types';
import { isEdgeFunctionReachable, getErrorMessage } from '../utils';

// ═══════════════════════════════════════════════════════════════════
// [1] seriesService — CRUD + polling
// ═══════════════════════════════════════════════════════════════════

export async function createSeries(
  formData: SeriesFormData,
  userPhone: string
): Promise<ApiResponse<Series>> {
  try {
    const result = await apiRequest<Series>('/series', {
      method: 'POST',
      body: JSON.stringify({
        title: formData.title,
        description: formData.description,
        genre: formData.genre,
        style: formData.style,
        totalEpisodes: formData.episodeCount,
        storyOutline: formData.storyOutline,
        userPhone,
        theme: formData.theme,
        targetAudience: formData.targetAudience,
        referenceImageUrl: formData.referenceImageUrl,
        productionType: formData.productionType,
        isPublic: formData.isPublic !== undefined ? formData.isPublic : true,
        resolution: formData.resolution || '720p', // v6.0.78: 传递分辨率
        aspectRatio: formData.aspectRatio || '9:16', // v6.0.79: 传递画面比例
      }),
      timeout: 90000,
      maxRetries: 3,
    });

    if (!result.success || !result.data) {
      return { success: false, error: result.error || '创建漫剧失败' };
    }

    const newSeries = result.data;
    triggerAutoGeneration(newSeries.id, formData, userPhone).catch((error: unknown) => {
      console.error('[SeriesService] Auto-generation error:', error);
    });

    return { success: true, data: { ...newSeries, status: 'generating' } };
  } catch (error: unknown) {
    console.error('[SeriesService] Error creating series:', error);
    return { success: false, error: getErrorMessage(error) };
  }
}

async function triggerAutoGeneration(
  seriesId: string,
  formData: SeriesFormData,
  userPhone: string
): Promise<void> {
  try {
    const result = await apiRequest(`/series/${seriesId}/generate-full-ai`, {
      method: 'POST',
      body: JSON.stringify({
        userPhone,
        storyOutline: formData.storyOutline,
        totalEpisodes: formData.episodeCount,
        style: formData.style,
        enableAudio: false,
      }),
      timeout: 15000,  // v6.0.143: 300s→15s — fire-and-forget, 仅确认服务器收到请求
      maxRetries: 0,
      silent: true,    // v6.0.143: 不打印 "Failed to fetch" — 超时断连是正常行为，轮询会跟踪进度
    });

    if (result.success) {
      console.log('[SeriesService] generate-full-ai request acknowledged:', result.data?.alreadyGenerating ? 'already generating' : 'started');
    }
    // 不需要处理 !result.success — 超时/断连是正常行为，服务端继续处理，轮询会检测
  } catch (error: unknown) {
    // 网络错误也不需要 throw — 服务端可能已收到请求并在处理中
    console.log('[SeriesService] generate-full-ai fire-and-forget (server may still be processing):', getErrorMessage(error));
  }
}

export async function retrySeries(
  seriesId: string,
  userPhone: string,
  storyOutline: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  // v6.0.148: /generate is best-effort status pre-set — don't bail out on failure
  // generate-full-ai independently sets status='generating' via updateProgress
  apiRequest(`/series/${seriesId}/generate`, {
    method: 'POST',
    body: JSON.stringify({}),
    timeout: 8000,
    maxRetries: 0,
    silent: true,
  }).then(r => {
    if (!r.success) console.warn('[SeriesService] retrySeries: /generate best-effort failed (generate-full-ai will handle status):', r.error);
  }).catch(() => {});

  apiRequest(`/series/${seriesId}/generate-full-ai`, {
    method: 'POST',
    body: JSON.stringify({ userPhone, storyOutline, forceRetry: true }),
    timeout: 15000,  // v6.0.143: 300s→15s — fire-and-forget, 轮询会跟踪进度
    maxRetries: 0,
    silent: true,    // v6.0.143: 超时断连是正常行为
  }).then(result => {
    if (result.success) console.log('[SeriesService] retrySeries → generate-full-ai acknowledged');
    // 不需要 error log — 超时断连是正常行为
  }).catch(() => {
    // 网络错误静默处理 — 服务端可能已收到请求并在处理中
    console.log('[SeriesService] retrySeries → generate-full-ai fire-and-forget (server may still be processing)');
  });

  return { success: true, data: { status: 'generating' } };
}

export async function getUserSeries(
  userPhone: string
): Promise<{ success: boolean; data?: Series[]; error?: string; count?: number }> {
  try {
    const url = `/series?userPhone=${encodeURIComponent(userPhone)}`;
    return await apiRequest(url, { method: 'GET', silent: true, maxRetries: 2 });
  } catch (error: unknown) {
    console.error('[SeriesService] Error fetching series:', error);
    return { success: false, error: getErrorMessage(error), data: [], count: 0 };
  }
}

export async function getSeries(
  seriesId: string
): Promise<{ success: boolean; data?: Series; error?: string }> {
  const result = await apiRequest(`/series/${seriesId}`, { method: 'GET', silent: true, maxRetries: 2 });
  if (!result.success && result.error !== 'offline') {
    console.error('[SeriesService] Failed to get series:', result.error);
  }
  return result;
}

export async function generateStoryboards(
  seriesId: string,
  episodeId: string
): Promise<{ success: boolean; data?: any[]; error?: string }> {
  return apiRequest(`/episodes/${episodeId}/generate-storyboards-ai`, {
    method: 'POST',
    body: JSON.stringify({ sceneCount: 10 }),
    timeout: 180000, // 3 minutes — backend callAI uses 90s + DB queries + prompt construction overhead
    maxRetries: 0,   // No retry — heavy AI generation should not be retried on timeout (matches generateFullAI pattern)
  });
}

export async function generateFullAI(
  seriesId: string,
  userPhone: string,
  onProgress?: (status: string) => void
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    if (onProgress) onProgress('正在启动完整生成流程...');
    // v6.0.148: /generate is best-effort status pre-set — don't await/block on failure
    // generate-full-ai independently sets status='generating' via updateProgress(0,6,'准备中...')
    apiRequest(`/series/${seriesId}/generate`, {
      method: 'POST',
      body: JSON.stringify({}),
      timeout: 8000,
      maxRetries: 0,
      silent: true,
    }).then(r => {
      if (!r.success) console.warn('[SeriesService] generateFullAI: /generate best-effort failed (generate-full-ai will handle status):', r.error);
    }).catch(() => {});

    // 发送生成请求（fire-and-forget，15s超时仅确认收到）
    apiRequest(`/series/${seriesId}/generate-full-ai`, {
      method: 'POST',
      body: JSON.stringify({ userPhone }),
      timeout: 15000,  // v6.0.143: 300s→15s — fire-and-forget
      maxRetries: 0,
      silent: true,    // v6.0.143: 超时断连是正常行为
    }).then(result => {
      if (result.success) console.log('[SeriesService] generateFullAI acknowledged');
    }).catch(() => {
      console.log('[SeriesService] generateFullAI fire-and-forget (server may still be processing)');
    });

    // 立即返回 success — 轮询机制会检测实际进度
    return { success: true, data: { message: '生成请求已发送，轮询将跟踪进度', fireAndForget: true } };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) || '一键完整生成失败' };
  }
}

export async function updateSeries(
  seriesId: string,
  updates: Partial<Series> & Record<string, unknown>
): Promise<{ success: boolean; data?: Series; error?: string }> {
  return apiRequest(`/series/${seriesId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteSeries(
  seriesId: string,
  userPhone: string
): Promise<{ success: boolean; error?: string }> {
  return apiRequest(`/series/${seriesId}`, {
    method: 'DELETE',
    body: JSON.stringify({ userPhone }),
  });
}

export async function syncThumbnails(
  seriesId: string
): Promise<{ success: boolean; synced?: number; storyboardsSynced?: number; error?: string }> {
  return apiRequest(`/series/${seriesId}/sync-thumbnails`, { method: 'POST' });
}

// --- Polling helpers ---

async function getSeriesDetails(
  seriesId: string,
  userPhone?: string,
): Promise<{ success: boolean; data?: any; error?: string }> {
  if (!isEdgeFunctionReachable()) return { success: false, error: 'offline' };
  try {
    const params = new URLSearchParams();
    if (userPhone) params.append('userPhone', userPhone);
    const url = `/series/${seriesId}?${params.toString()}`;
    const result = await apiRequest(url, { method: 'GET', timeout: 30000, maxRetries: 2, silent: true });
    if (!result.success) {
      if (result.error?.includes('not found') || result.error?.includes('Series not found')) return result;
      if (result.error === 'offline') return result;
      if (result.error?.includes('timeout') || result.error?.includes('connection')) return { success: false, error: 'offline' };
      if (result.error?.includes('500') || result.error?.includes('Internal server error')) return { success: false, error: 'offline' };
      if (result.error?.includes('数据库查询错误') || result.retryable) return { success: false, error: 'offline' };
      console.error('[SeriesService] Error loading series:', result.error);
      return result;
    }
    return result;
  } catch (error: unknown) {
    console.error('[SeriesService] Error fetching series details:', error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export function pollSeriesProgress(
  seriesId: string,
  userPhone: string,
  onProgress: (series: any) => void,
  interval: number = 3000
): () => void {
  let isPolling = true;
  let timeoutId: ReturnType<typeof setTimeout>;
  let consecutiveFailures = 0;
  const MAX_CONSECUTIVE_FAILURES = 3;

  const poll = async () => {
    if (!isPolling) return;
    if (!isEdgeFunctionReachable()) { if (isPolling) timeoutId = setTimeout(poll, 30000); return; }
    try {
      const result = await getSeriesDetails(seriesId, userPhone);
      if (result.success && result.data) {
        consecutiveFailures = 0;
        onProgress(result.data);
        const status = result.data.status;
        if (status === 'completed' || status === 'failed') { isPolling = false; return; }
      } else if (result.error === 'offline') {
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) { if (isPolling) timeoutId = setTimeout(poll, 30000); return; }
      }
      if (isPolling) timeoutId = setTimeout(poll, interval);
    } catch (error: unknown) {
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) { if (isPolling) timeoutId = setTimeout(poll, 30000); return; }
      if (isPolling) timeoutId = setTimeout(poll, interval);
    }
  };

  poll();
  return () => { isPolling = false; if (timeoutId) clearTimeout(timeoutId); };
}

// ═══════════════════════════════════════════════════════════════════
// [2] aiEpisodeGenerator
// ═══════════════════════════════════════════════════════════════════

interface EpisodeOutline { episodeNumber: number; title: string; synopsis: string; growthTheme: string; keyMoments: string[]; }
interface GenerateEpisodesRequest { seriesTitle: string; seriesDescription: string; totalEpisodes: number; genre?: string; theme?: string; targetAudience?: string; }

export async function generateEpisodeOutlines(
  request: GenerateEpisodesRequest
): Promise<{ success: boolean; episodes?: EpisodeOutline[]; error?: string }> {
  try {
    const result = await apiRequest('/ai/generate-episodes', { method: 'POST', body: JSON.stringify(request), timeout: 60000, maxRetries: 2 });
    if (!result.success) return { success: false, error: result.error || '生成失败' };
    return { success: true, episodes: result.episodes };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) || '网络错误' };
  }
}

// ═══════════════════════════════════════════════════════════════════
// [3] videoPromptBuilder
// ═══════════════════════════════════════════════════════════════════

const PRO_SHOT_MAP: Record<string, string> = {
  'extreme-long-shot': '大远景(ELS)，超广角镜头缓缓平移，展现宏大全貌',
  'long-shot': '远景(LS)，固定或缓慢拉远，展示人物全身与环境关系',
  'medium-shot': '中景(MS)，平稳跟拍人物膝上半身，展现肢体语言',
  'medium-close-up': '中近景(MCU)，缓慢推镜至胸部以上，捕捉表情细节',
  'close-up': '近景特写(CU)，缓慢推镜聚焦面部，传达深层情感',
  'extreme-close-up': '极特写(ECU)，微距镜头聚焦极小细节，强化戏剧张力',
  '大远景': '大远景(ELS)，超广角镜头缓缓平移，展现宏大全貌',
  '远景': '远景(LS)，固定或缓慢拉远，展示人物全身与环境关系',
  '全景': '全景(FS)，固定镜头展示完整场景与所有人物关系',
  '中景': '中景(MS)，平稳跟拍人物膝上半身，展现肢体语言和互动',
  '中近景': '中近景(MCU)，缓慢推镜至胸部以上，捕捉表情与手势',
  '近景': '近景(CU)，缓慢推镜聚焦面部，传达情感与微表情',
  '特写': '特写(CU)，缓慢推镜聚焦面部/关键物品，传达深层情感',
  '大特写': '极特写(ECU)，微距镜头聚焦极小细节，强化戏剧张力',
  '俯拍': '高角度俯拍(HA)，鸟瞰视角固定拍摄，暗示渺小或被压迫',
  '仰拍': '低角度仰拍(LA)，缓慢上推增强角色气势与权威感',
  '平拍': '平视角(EL)，与角色视线齐平，平稳跟拍，最自然真实',
  'POV': '第一人称主观镜头(POV)，手持微晃模拟角色视线，营造代入感',
  '倾斜': '荷兰角(Dutch Angle)，倾斜构图制造不安/紧张心理暗示',
  'medium': '中景(MS)，平稳跟拍人物膝上半身',
  'wide': '远景(LS)，展示人物全身与环境关系',
  'overhead': '高角度俯拍(HA)，鸟瞰视角',
  'low-angle': '低角度仰拍(LA)，增强角色气势',
};

export function buildVideoPrompt(series: Series, episode: Episode, storyboard: Storyboard): string {
  const parts: string[] = [];

  const coherence = series.coherenceCheck;
  if (coherence) {
    if (coherence.visualStyleGuide) parts.push(`[视觉风格指南] ${coherence.visualStyleGuide}`);
    else if (coherence.baseStylePrompt) parts.push(`[画面风格] ${coherence.baseStylePrompt}`);

    // v6.0.78: 修复角色缺失——从描述和对话中智能匹配角色外貌，而非仅依赖storyboard.characters字段
    if (coherence.characterAppearances?.length) {
      const descDialogue = `${storyboard.description || ''} ${storyboard.dialogue || ''}`;
      // 优先匹配：description/dialogue中出现了角色名
      const matchedByText = coherence.characterAppearances
        .filter(ca => ca.name && descDialogue.includes(ca.name));
      // 备选：storyboard.characters字段中显式指定的角色
      const matchedByField = storyboard.characters?.length
        ? coherence.characterAppearances.filter(ca =>
            storyboard.characters.some(charId => charId === ca.name || charId.includes(ca.name))
          )
        : [];
      // 合并去重
      const seen = new Set<string>();
      const allMatched = [...matchedByText, ...matchedByField].filter(ca => {
        if (seen.has(ca.name)) return false;
        seen.add(ca.name);
        return true;
      });
      if (allMatched.length > 0) {
        const involved = allMatched.map(ca => `${ca.name}(${ca.role}): ${ca.appearance}`).join('; ');
        parts.push(`[角色外貌——必须严格按此描述生成角色画面] ${involved}`);
      } else {
        // 未从文本匹配到任何角色时，注入全部角色外貌（保证不遗漏）
        const all = coherence.characterAppearances.map(ca => `${ca.name}(${ca.role}): ${ca.appearance}`).join('; ');
        parts.push(`[角色外貌] ${all}`);
      }
    }
  }

  if (storyboard.description) parts.push(storyboard.description);
  if (storyboard.dialogue) {
    // v6.0.78: 对话中标注说话者，确保不张冠李戴
    parts.push(`对白: "${storyboard.dialogue}"`);
  }

  if (series.characters?.length && !coherence?.characterAppearances?.length) {
    // fallback: 从series.characters匹配（仅在无coherence数据时使用）
    const descDialogue = `${storyboard.description || ''} ${storyboard.dialogue || ''}`;
    const charDescriptions = series.characters
      .filter(c => {
        // 先检查storyboard.characters字段
        if (storyboard.characters?.length) {
          if (storyboard.characters.includes(c.id) || storyboard.characters.includes(c.name)) return true;
        }
        // 再检查描述/对话文本中的角色名
        if (c.name && descDialogue.includes(c.name)) return true;
        return false;
      })
      .map(c => { const desc = c.appearance || c.description || ''; return `${c.name}: ${desc}`; })
      .filter(Boolean);
    if (charDescriptions.length) parts.push(`[角色] ${charDescriptions.join('; ')}`);
  }

  const envParts: string[] = [];
  if (storyboard.location) envParts.push(storyboard.location);
  if (storyboard.timeOfDay) {
    const timeMap: Record<string, string> = { morning: '清晨', noon: '正午', afternoon: '午后', evening: '傍晚', night: '夜晚' };
    envParts.push(timeMap[storyboard.timeOfDay] || storyboard.timeOfDay);
  }
  if (envParts.length) parts.push(`[场景] ${envParts.join(', ')}`);

  if (storyboard.cameraAngle) {
    const proShot = PRO_SHOT_MAP[storyboard.cameraAngle] || storyboard.cameraAngle;
    parts.push(`[镜头] ${proShot}，稳定运镜无抖动`);
  }

  if (storyboard.emotionalTone) parts.push(`[情感] ${storyboard.emotionalTone}`);

  if (episode.synopsis) {
    const short = episode.synopsis.length > 80 ? episode.synopsis.substring(0, 80) + '...' : episode.synopsis;
    parts.push(`[剧情背景] ${short}`);
  }

  if (storyboard.growthInsight) parts.push(`[成长洞察] ${storyboard.growthInsight}`);

  return parts.filter(Boolean).join('\n');
}