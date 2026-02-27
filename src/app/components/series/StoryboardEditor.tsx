import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, Plus, Wand2, Image as ImageIcon, 
  Play, Loader2, Download, CheckCircle2, RefreshCw,
  Cloud, CloudOff, AlertTriangle
} from 'lucide-react';
import { Button } from '../ui';
import { toast } from 'sonner';
import { StoryboardCard, StoryboardForm } from './StoryboardWidgets';
import { StoryboardVideoMerger } from './StoryboardVideoMerger';
import { clientMergeEpisode } from './ClientVideoMerger';
import { useStoryboardBatchGeneration } from './hooks';
import { useVideoQuota } from '../../hooks/useVideoQuota';
import type { Episode, Character, Storyboard } from '../../types';
import * as seriesVideoService from '../../services';
import * as seriesService from '../../services';
import { apiRequest, ASPECT_TO_RESOLUTION } from '../../utils';
import { getApiUrl, publicAnonKey } from '../../constants';

interface StoryboardEditorProps {
  episode: Episode;
  characters: Character[];
  style: string;
  seriesId: string;
  userPhone: string;
  aspectRatio?: string; // v6.0.80: 画面比例
  styleAnchorImageUrl?: string; // v6.0.120: 风格锚定图URL
  onBack: () => void;
  onUpdate: (storyboards: Storyboard[]) => void;
}

export function StoryboardEditor({ 
  episode, 
  characters, 
  style, 
  seriesId, 
  userPhone, 
  aspectRatio,
  styleAnchorImageUrl,
  onBack, 
  onUpdate 
}: StoryboardEditorProps) {
  const [storyboards, setStoryboards] = useState<Storyboard[]>(episode.storyboards || []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(episode.mergedVideoUrl || null);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false); // v6.0.92: AI分镜生成加载状态

  // ── v6.0.101: 自动合并状态 ────────────────────────────────────────
  type AutoMergeStatus = 'idle' | 'merging' | 'done' | 'error';
  const [autoMergeStatus, setAutoMergeStatus] = useState<AutoMergeStatus>('idle');
  const [autoMergePct, setAutoMergePct] = useState(0);
  const [autoMergeDetail, setAutoMergeDetail] = useState('');
  const [mergeBlobUrl, setMergeBlobUrl] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [pendingDownload, setPendingDownload] = useState(false);
  const autoMergeTriggered = useRef(false);
  const isMountedRef = useRef(true);
  useEffect(() => { isMountedRef.current = true; return () => { isMountedRef.current = false; }; }, []);
  // v6.0.126: OSS 持久化状态
  const [ossUploadStatus, setOssUploadStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [ossUploadPct, setOssUploadPct] = useState(0);
  // v6.0.131: 合并失败时记录过期场景号，用于显示"重新生成"按钮
  const [mergeExpiredScenes, setMergeExpiredScenes] = useState<number[]>([]);
  const [isRegeneratingScene, setIsRegeneratingScene] = useState<number | null>(null);
  // v6.0.111: 自动修复分辨率不一致——仅尝试一次，防止无限循环
  const hasAttemptedAutoFix = useRef(false);
  // v6.0.111: 自动修复限制——最多自动重新生成 4 个分镜
  const MAX_AUTO_REGEN_SCENES = 4;

  // ref 跟踪最新的 storyboards 状态，避免异步函数中闭包过期
  const storyboardsRef = useRef<Storyboard[]>(storyboards);
  useEffect(() => {
    storyboardsRef.current = storyboards;
  }, [storyboards]);

  // ref 跟踪最新的 onUpdate 回调
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  // 安全的状态更新 + 父组件通知
  const updateStoryboards = useCallback((updater: (prev: Storyboard[]) => Storyboard[]) => {
    setStoryboards(prev => {
      const next = updater(prev);
      storyboardsRef.current = next;
      return next;
    });
    queueMicrotask(() => {
      onUpdateRef.current(storyboardsRef.current);
    });
  }, []);

  // 批量视频生成 hook
  const { isBatchGenerating, batchProgress, handleBatchGenerate } = useStoryboardBatchGeneration({
    seriesId,
    userPhone,
    episodeNumber: episode.episodeNumber,
    storyboardsRef,
    updateStoryboards,
    styleAnchorImageUrl, // v6.0.120: 传递锚定图URL用于批量完成后提示
  });

  // v6.0.98: 配额信息（用于按钮旁提示）
  const { quota } = useVideoQuota(userPhone);

  // 同步外部 episode.storyboards 的变化到本地状态
  useEffect(() => {
    const externalSb = episode.storyboards || [];
    if (externalSb.length === 0) return;

    setStoryboards(prev => {
      let changed = false;
      const merged = prev.map(sb => {
        const ext = externalSb.find(e => e.id === sb.id);
        if (!ext) return sb;

        const extVideoUrl = ext.videoUrl || (ext as any).video_url;
        const localVideoUrl = sb.videoUrl || (sb as any).video_url;

        if (extVideoUrl && !localVideoUrl) {
          changed = true;
          return { ...sb, videoUrl: extVideoUrl, status: 'completed' as const };
        }

        const extThumb = ext.thumbnailUrl || (ext as any).thumbnail_url;
        const localThumb = sb.thumbnailUrl || (sb as any).thumbnail_url;
        if (extThumb && !localThumb) {
          changed = true;
          return { ...sb, thumbnailUrl: extThumb };
        }

        return sb;
      });
      if (changed) {
        storyboardsRef.current = merged;
      }
      return changed ? merged : prev;
    });
  }, [episode.storyboards]);

  // 计算统计数据
  const pendingStoryboards = storyboards.filter(sb => {
    const hasVideo = !!(sb.videoUrl || (sb as any).video_url);
    return !hasVideo && sb.status !== 'generating';
  });
  const completedCount = storyboards.filter(sb => !!(sb.videoUrl || (sb as any).video_url)).length;
  const generatingCount = storyboards.filter(sb => sb.status === 'generating').length;

  // ── v6.0.101: 所有分镜都已有视频时自动触发合并 ──────────────────
  const allVideosReady = storyboards.length > 0 && completedCount === storyboards.length && generatingCount === 0;

  // 切换集时重置自动合并状态
  useEffect(() => {
    autoMergeTriggered.current = false;
    hasAttemptedAutoFix.current = false; // v6.0.111: 切换集时重置自动修复标记
    setAutoMergeStatus('idle');
    setMergeExpiredScenes([]); // v6.0.131: 重置过期场景列表
    setAutoMergePct(0);
    setAutoMergeDetail('');
    setMergeBlobUrl(null);
    setPendingDownload(false);
    // v6.0.126: 切换集时重置 OSS 上传状态
    setOssUploadStatus('idle');
    setOssUploadPct(0);
  }, [episode.id]);

  // v6.0.111: 计算 preferredResolution（来自系列 aspectRatio → WxH 映射）
  const preferredResolution = aspectRatio ? ASPECT_TO_RESOLUTION[aspectRatio] : undefined;

  // 自动合并主逻辑：所有视频就绪 → 智能路由（>6分镜直接本地/≤6先服务器再回退本地）
  // v6.0.111: 合并检测到分辨率不匹配 → 自动 forceRegenerate 少数派分镜 → 重新合并
  useEffect(() => {
    if (!allVideosReady || mergedVideoUrl || autoMergeTriggered.current || autoMergeStatus !== 'idle') return;
    autoMergeTriggered.current = true;

    const doAutoMerge = async () => {
      if (!isMountedRef.current) return;
      setAutoMergeStatus('merging');
      setAutoMergePct(5);

      const sbCount = storyboardsRef.current.filter(sb => {
        const url = sb.videoUrl || (sb as any).video_url || '';
        return typeof url === 'string' && url.trim().startsWith('http');
      }).length;

      // v6.0.105: 智能由—>6 分镜直接走本地合并（避免服务器 OOM）
      const skipServer = sbCount > 6;
      if (skipServer) {
        console.log(`[AutoMerge] Ep${episode.episodeNumber}: ${sbCount} segments > 6, skipping server → direct client merge`);
      }

      // 1. 尝试服务器合并（≤6 分镜时，快速且有 CDN 加速）
      if (!skipServer) {
        setAutoMergeDetail('正在合并分集视频...');
        try {
          console.log(`[AutoMerge] Ep${episode.episodeNumber}: trying server merge (${sbCount} segments)...`);
          const result = await seriesVideoService.mergeEpisodeVideos(seriesId, episode.id, userPhone);

          // v6.0.105: 检查 useClientMerge 信号（服务器主动路由到本地）
          if (result.data?.useClientMerge) {
            console.log(`[AutoMerge] Server returned useClientMerge signal, falling back to client...`);
          } else if (result.success && result.videoUrl) {
            if (!isMountedRef.current) return;
            setMergedVideoUrl(result.videoUrl);
            setAutoMergeStatus('done');
            setAutoMergePct(100);
            setAutoMergeDetail('服务器合并完成');
            toast.success(`✅ 第${episode.episodeNumber}集已自动合并，点击下载！`, { duration: 5000 });
            return;
          } else {
            console.warn(`[AutoMerge] Server merge returned no URL:`, result.error);
          }
        } catch (serverErr: any) {
          console.warn(`[AutoMerge] Server merge failed (${serverErr.message}), falling back to client merge...`);
        }
      }

      // 2. 本地合并：纯 TS MP4 concat（无 Worker/WASM 依赖，兼容所有环境）
      if (!isMountedRef.current) return;
      setAutoMergeDetail(skipServer ? '本地合并中...' : '切换本地合并...');
      try {
        console.log(`[AutoMerge] Ep${episode.episodeNumber}: starting client-side MP4 concat (${sbCount} segments)...`);
        // v6.0.111: 传入 preferredResolution 使分辨率判定与服务端一致
        // v6.0.127: 传入 seriesId 用于批量刷新Volcengine TOS过期URL
        const mergeResult = await clientMergeEpisode(
          episode,
          storyboardsRef.current,
          (p) => {
            if (!isMountedRef.current) return;
            setAutoMergePct(p.overallPct);
            if (p.phase === 'fetching') setAutoMergeDetail(`下载分镜 ${p.fetchDone}/${p.fetchTotal}...`);
            else if (p.phase === 'merging') setAutoMergeDetail(`本地拼接 ${p.mergePct}%...`);
          },
          { preferredResolution, seriesId }
        );
        if (!isMountedRef.current) return;

        // v6.0.121: 移除分辨率不匹配自动修复逻辑——clientMergeEpisode已改为包容模式，
        // 所有分辨率段均会包含在合并中，excludedScenes始终为空
        const { blobUrl, sizeMB, warnings } = mergeResult;

        // ── 正常完成 ──────────────────────────────────────────────────
        setMergeBlobUrl(blobUrl);
        setAutoMergeStatus('done');
        setAutoMergePct(100);
        setAutoMergeDetail(`${sizeMB}MB`);
        if (warnings?.length) {
          toast.warning(`第${episode.episodeNumber}集合并完成但有警告:\n${warnings.join('\n')}`, { duration: 10000 });
        } else {
          toast.success(`✅ 第${episode.episodeNumber}集已合并（${sizeMB}MB），点击下载！`, { duration: 5000 });
        }

        // v6.0.126: 合并完成后异步上传到 OSS 持久化（不阻塞下载流程）
        uploadMergedToOSS(blobUrl, sizeMB);
      } catch (clientErr: any) {
        if (!isMountedRef.current) return;
        console.error(`[AutoMerge] Client merge also failed:`, clientErr);
        setAutoMergeStatus('error');
        setAutoMergeDetail(clientErr.message || '合并失败');
        autoMergeTriggered.current = false; // 允许重试
        // v6.0.131: 解析错误消息中的过期场景号，用于显示"重新生成"按钮
        const expiredMatch = (clientErr.message || '').match(/场景\s*([\d,\s]+)\s*的视频链接已永久过期/);
        if (expiredMatch) {
          const sceneNums = expiredMatch[1].split(/[,，\s]+/).map(Number).filter(Boolean);
          setMergeExpiredScenes(sceneNums);
        } else {
          setMergeExpiredScenes([]);
        }
      }
    };

    doAutoMerge();
  }, [allVideosReady, mergedVideoUrl, autoMergeStatus, preferredResolution]);

  // v6.0.126: 将客户端合并后的视频直传到 OSS，持久化 merged_video_url 到 DB
  // 使用预签名 PUT URL 直接从浏览器上传，绕过 Edge Function 请求体大小限制
  const uploadMergedToOSS = useCallback(async (blobUrl: string, sizeMB: string) => {
    if (!isMountedRef.current) return;
    setOssUploadStatus('uploading');
    setOssUploadPct(5);

    try {
      // Step 1: 获取预签名 PUT URL
      const tokenResp = await fetch(getApiUrl(`/episodes/${episode.id}/request-upload-token`), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userPhone, episodeNumber: episode.episodeNumber }),
      });
      if (!tokenResp.ok) {
        const tokenErr = await tokenResp.json().catch(() => ({})) as any;
        throw new Error(`获取上传令牌失败: ${tokenErr.error || tokenResp.status}`);
      }
      const tokenData = await tokenResp.json();
      const { uploadUrl, finalOssUrl } = tokenData.data || {};
      if (!uploadUrl || !finalOssUrl) throw new Error('上传令牌响应格式无效');

      if (!isMountedRef.current) return;
      setOssUploadPct(15);
      console.log(`[OSSUpload] Got presigned URL for ep${episode.episodeNumber}, uploading blob (${sizeMB}MB)...`);

      // Step 2: 从 blobUrl 读取 ArrayBuffer
      const blobResp = await fetch(blobUrl);
      if (!blobResp.ok) throw new Error(`读取本地视频失败: HTTP ${blobResp.status}`);
      const videoBuffer = await blobResp.arrayBuffer();
      if (!isMountedRef.current) return;
      setOssUploadPct(30);

      // Step 3: 直接 PUT 到 OSS 预签名 URL
      // 注意: 不带 Authorization header（预签名 URL 本身已包含认证信息）
      const ossResp = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'video/mp4' },
        body: videoBuffer,
      });
      if (!ossResp.ok) {
        const ossErr = await ossResp.text().catch(() => '');
        throw new Error(`OSS直传失败 (${ossResp.status}): ${ossErr.substring(0, 200)}`);
      }
      if (!isMountedRef.current) return;
      setOssUploadPct(90);
      console.log(`[OSSUpload] ✅ Uploaded to OSS: ${finalOssUrl.substring(0, 80)}`);

      // Step 4: 通知后端保存 merged_video_url 到 DB
      const saveResp = await fetch(getApiUrl(`/episodes/${episode.id}/save-merged-video`), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ossUrl: finalOssUrl, sizeMB, userPhone }),
      });
      if (!saveResp.ok) {
        const saveErr = await saveResp.json().catch(() => ({})) as any;
        throw new Error(`保存视频URL到数据库失败: ${saveErr.error || saveResp.status}`);
      }

      if (!isMountedRef.current) return;
      setOssUploadPct(100);
      setOssUploadStatus('done');
      // 更新本地 mergedVideoUrl，下次打开时可直接下载（无需重新合并）
      setMergedVideoUrl(finalOssUrl);
      console.log(`[OSSUpload] ✅ ep${episode.episodeNumber} merged video persisted to OSS+DB (${sizeMB}MB)`);
      toast.success(`☁️ 第${episode.episodeNumber}集视频已保存到云端，下次可直接下载`, { duration: 6000 });
    } catch (err: any) {
      if (!isMountedRef.current) return;
      console.error(`[OSSUpload] Failed:`, err.message);
      setOssUploadStatus('error');
      // 非阻塞：OSS 上传失败不影响本地下载
      toast.warning(`云端保存失败（不影响本次下载）: ${err.message}`, { duration: 8000 });
    }
  }, [episode.id, episode.episodeNumber, userPhone]);

  // 当合并完成且有待处理的下载请求时，自动触发下载
  useEffect(() => {
    if (autoMergeStatus === 'done' && pendingDownload) {
      setPendingDownload(false);
      handleDownloadEpisode();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMergeStatus, pendingDownload]);

  // 获取正在编辑的分镜对象
  const editingStoryboard = editingId ? storyboards.find(sb => sb.id === editingId) || null : null;

  const handleFormSubmit = (data: Partial<Storyboard>) => {
    if (!data.description) return;

    if (editingId) {
      // 更新模式
      updateStoryboards(prev => prev.map(sb =>
        sb.id === editingId ? { ...sb, ...data } as Storyboard : sb
      ));
    } else {
      // 新建模式
      const newStoryboard: Storyboard = {
        id: `sb-${Date.now()}`,
        episodeId: episode.id,
        sceneNumber: storyboards.length + 1,
        description: data.description,
        dialogue: data.dialogue,
        characters: data.characters || [],
        location: data.location || '',
        timeOfDay: data.timeOfDay as Storyboard['timeOfDay'],
        cameraAngle: data.cameraAngle as Storyboard['cameraAngle'],
        duration: data.duration || 10,
        status: 'draft',
      };
      updateStoryboards(prev => [...prev, newStoryboard]);
    }
    handleFormCancel();
  };

  const handleEdit = (storyboard: Storyboard) => {
    setEditingId(storyboard.id);
    setIsAdding(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('确定要删除这个分镜吗？')) {
      updateStoryboards(prev =>
        prev
          .filter(sb => sb.id !== id)
          .map((sb, index) => ({ ...sb, sceneNumber: index + 1 }))
      );
    }
  };

  const handleGenerate = async (storyboard: Storyboard) => {
    updateStoryboards(prev => prev.map(sb =>
      sb.id === storyboard.id ? { ...sb, status: 'generating' as const } : sb
    ));
    // v6.0.93: 持久化 generating 状态到 DB（支持跨导航保持进度可见）
    sessionGeneratingIds.current.add(storyboard.id);
    patchStoryboardStatus(storyboard.id, 'generating');

    try {
      const videoUrl = await seriesVideoService.generateStoryboardVideo(
        seriesId, userPhone, storyboard, episode.episodeNumber
      );
      
      console.log(`[StoryboardEditor] Video generated for scene ${storyboard.sceneNumber}: ${videoUrl.substring(0, 80)}...`);

      updateStoryboards(prev => prev.map(sb =>
        sb.id === storyboard.id 
          ? { ...sb, status: 'completed' as const, videoUrl: videoUrl } 
          : sb
      ));
      
      // 回写video_url到DB
      await apiRequest(`/series/${seriesId}/storyboards/${storyboard.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          videoUrl,
          status: 'completed',
          episodeNumber: episode.episodeNumber,
          sceneNumber: storyboard.sceneNumber,
        }),
      });
      
      toast.success('视频生成成功！');
    } catch (error: any) {
      console.error('[StoryboardEditor] Failed to generate video:', error);
      
      updateStoryboards(prev => prev.map(sb =>
        sb.id === storyboard.id 
          ? { ...sb, status: 'draft' as const, error: error.message } 
          : sb
      ));
      
      toast.error('视频生成失败：' + error.message);
    }
  };

  // v6.0.87: 强制重新生成视频（用于分辨率不一致修复）
  // v6.0.131: skipConfirm参数——从过期场景面板调用时跳过confirm弹窗
  const handleRegenerateVideo = async (storyboard: Storyboard, skipConfirm = false) => {
    if (!skipConfirm && !confirm(`确定要重新生成场景${storyboard.sceneNumber}的频吗？这将替换当前视频。`)) return;

    const prevVideoUrl = storyboard.videoUrl;
    updateStoryboards(prev => prev.map(sb =>
      sb.id === storyboard.id ? { ...sb, status: 'generating' as const, videoUrl: undefined } : sb
    ));
    // v6.0.93: 持久化 generating 状态到 DB
    sessionGeneratingIds.current.add(storyboard.id);
    patchStoryboardStatus(storyboard.id, 'generating');

    try {
      const videoUrl = await seriesVideoService.generateStoryboardVideo(
        seriesId, userPhone, storyboard, episode.episodeNumber, undefined, true // forceRegenerate=true
      );
      
      console.log(`[StoryboardEditor] Video regenerated for scene ${storyboard.sceneNumber}: ${videoUrl.substring(0, 80)}...`);

      updateStoryboards(prev => prev.map(sb =>
        sb.id === storyboard.id 
          ? { ...sb, status: 'completed' as const, videoUrl } 
          : sb
      ));
      
      await apiRequest(`/series/${seriesId}/storyboards/${storyboard.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          videoUrl, status: 'completed',
          episodeNumber: episode.episodeNumber,
          sceneNumber: storyboard.sceneNumber,
        }),
      });
      
      toast.success(`场景${storyboard.sceneNumber}视频重新生成成功！`);
    } catch (error: any) {
      console.error('[StoryboardEditor] Failed to regenerate video:', error);
      updateStoryboards(prev => prev.map(sb =>
        sb.id === storyboard.id 
          ? { ...sb, status: 'completed' as const, videoUrl: prevVideoUrl, error: error.message } 
          : sb
      ));
      toast.error('重新生成失败：' + error.message);
    }
  };

  // v6.0.88: 合并时自动修复分辨率不一致后，更新本地分镜状态（反映新的videoUrl）
  const handleStoryboardsUpdatedByMerger = useCallback((updates: Array<{ id: string; videoUrl: string }>) => {
    updateStoryboards(prev => prev.map(sb => {
      const update = updates.find(u => u.id === sb.id);
      if (update) {
        return { ...sb, videoUrl: update.videoUrl, status: 'completed' as const };
      }
      return sb;
    }));
    console.log(`[StoryboardEditor] 🔄 Auto-fix updated ${updates.length} storyboard(s) from merge resolution fix`);
  }, [updateStoryboards]);

  const handleFormCancel = () => {
    setIsAdding(false);
    setEditingId(null);
  };

  // ── v6.0.101: 智能下载——已合并直接下载，合并中则排队等待 ─────────
  const handleDownloadEpisode = useCallback(async () => {
    if (isDownloading) return;

    // 优先用 blob URL（来自本地合并）
    if (mergeBlobUrl) {
      const a = document.createElement('a');
      a.href = mergeBlobUrl;
      a.download = `第${episode.episodeNumber || 1}集-完整视频.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    // 使用服务器 URL
    if (mergedVideoUrl && mergedVideoUrl.startsWith('http')) {
      setIsDownloading(true);
      const toastId = toast.loading('正在下载视频...');
      try {
        const resp = await fetch(mergedVideoUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `第${episode.episodeNumber || 1}集-完整视频.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        const sizeMB = (blob.size / 1024 / 1024).toFixed(1);
        toast.success(`下载完成！(${sizeMB}MB)`, { id: toastId });
      } catch (err: any) {
        toast.error('下载失败：' + err.message, { id: toastId });
      } finally {
        setIsDownloading(false);
      }
      return;
    }

    // 合并中或未开始——排队等待
    if (autoMergeStatus === 'merging') {
      toast.info('正在合并中，合并完成后将自动下载...');
      setPendingDownload(true);
      return;
    }

    // 触发合并（idle/error 状态）
    autoMergeTriggered.current = false;
    setAutoMergeStatus('idle');
  }, [mergeBlobUrl, mergedVideoUrl, isDownloading, autoMergeStatus, episode.episodeNumber]);

  const handleGenerateAIScript = async () => {
    setIsGeneratingAI(true);
    try {
      toast.info('正在使用AI生成分镜...');
      
      const result = await seriesService.generateStoryboards(seriesId, episode.id);
      
      if (result.success && result.data) {
        // v6.0.92: 修复数据提取——generateStoryboards返回data为数组，非data.storyboards
        const newStoryboards = Array.isArray(result.data) ? result.data : ((result.data as any)?.storyboards || []);
        updateStoryboards(prev => [...prev, ...newStoryboards]);
        
        toast.success(`AI成功生成 ${newStoryboards.length} 个分镜！`);
      } else {
        toast.error('AI生成分镜失败：' + (result.error || '未知错误'));
      }
    } catch (error: any) {
      console.error('[StoryboardEditor] AI generation error:', error);
      toast.error('AI生成分镜失败：' + error.message);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // v6.0.93: 追踪哪些分镜由"本会话"发起了生成（用于区分本会话生成 vs 跨会话恢复）
  const sessionGeneratingIds = useRef<Set<string>>(new Set());
  // v6.0.94: 组件挂载时间——用于检测前次会话遗留的 generating 分镜是否已超时
  const mountTimeRef = useRef(Date.now());

  // v6.0.93+v6.0.94: 持久化 'generating' 状态到 DB，补充 episodeNumber/sceneNumber 备用路由
  const patchStoryboardStatus = useCallback(async (sbId: string, status: 'generating' | 'completed' | 'draft', extra?: { videoUrl?: string }) => {
    try {
      const sb = storyboardsRef.current.find(s => s.id === sbId);
      await apiRequest(`/series/${seriesId}/storyboards/${sbId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          episodeNumber: episode.episodeNumber,  // v6.0.94: 备用匹配键
          sceneNumber: sb?.sceneNumber,           // v6.0.94: 备用匹配键
          ...(extra?.videoUrl ? { videoUrl: extra.videoUrl } : {}),
        }),
      });
    } catch { /* non-blocking */ }
  }, [seriesId, episode.episodeNumber]);

  // v6.0.93+v6.0.94: 当有分镜处于 generating 状态时，轮询 DB 获取最新视频 URL
  // v6.0.94修复: 用 generatingIdsKey 字符串（而非 storyboards 数组）作为依赖，
  //             避免每次 updateStoryboards 调用都重置 interval（批量生成期间可能每秒多次重置）
  const generatingIdsKey = storyboards
    .filter(sb => sb.status === 'generating' && !(sb.videoUrl || (sb as any).video_url))
    .map(sb => sb.id)
    .sort()
    .join(',');

  useEffect(() => {
    if (!generatingIdsKey) return;

    const idCount = generatingIdsKey.split(',').length;
    console.log(`[StoryboardEditor] 🔄 Polling DB for ${idCount} generating storyboard(s)...`);
    const timerId = setInterval(async () => {
      try {
        const result = await seriesService.getSeries(seriesId);
        if (!result.success || !result.data) return;
        const freshSeries = result.data;
        const freshEpisode = freshSeries.episodes?.find((ep: any) => ep.id === episode.id);
        if (!freshEpisode?.storyboards) return;

        // v6.0.94: 计算距挂载时间（分钟），用于过期检测
        const minutesSinceMount = (Date.now() - mountTimeRef.current) / 60000;

        let anyUpdate = false;
        updateStoryboards(prev => {
          const updated = prev.map(sb => {
            if (sb.status !== 'generating') return sb;
            const fresh = freshEpisode.storyboards.find((f: any) => f.id === sb.id);
            const freshVideoUrl = fresh?.videoUrl || (fresh as any)?.video_url;
            const freshStatus = fresh?.status;
            if (freshVideoUrl && (freshVideoUrl.startsWith('http://') || freshVideoUrl.startsWith('https://'))) {
              anyUpdate = true;
              return { ...sb, videoUrl: freshVideoUrl, status: 'completed' as const };
            }
            // 如果 DB 中 status 已非 generating（如被其他端修改），同步过来
            if (freshStatus && freshStatus !== 'generating' && freshStatus !== sb.status) {
              anyUpdate = true;
              return { ...sb, status: freshStatus as any };
            }
            // v6.0.94: 过期自动重置——非本会话启动的 generating 分镜，挂载后超过20分钟仍未完成
            //         说明后端已失败但未更新 DB 状态（Edge Function 超时等），重置为 draft 以解除卡住
            const isFromPrevSession = !sessionGeneratingIds.current.has(sb.id);
            if (isFromPrevSession && minutesSinceMount > 20) {
              anyUpdate = true;
              console.log(`[StoryboardEditor] ⏱ Auto-reset stale generating scene ${sb.sceneNumber} → draft`);
              return { ...sb, status: 'draft' as const };
            }
            return sb;
          });
          return anyUpdate ? updated : prev;
        });
      } catch { /* non-blocking */ }
    }, 5000);

    return () => clearInterval(timerId);
  // v6.0.94: 依赖 generatingIdsKey（字符串）而非 storyboards（数组对），避免频繁重置
  }, [generatingIdsKey, seriesId, episode.id, updateStoryboards]);

  // v6.0.111: 重置卡住的分镜状态
  const handleResetStuck = useCallback((storyboard: Storyboard) => {
    if (!confirm(`确定要重置场景${storyboard.sceneNumber}的状态吗？这将清除当前视频。`)) return;

    updateStoryboards(prev => prev.map(sb =>
      sb.id === storyboard.id ? { ...sb, status: 'draft' as const, videoUrl: undefined } : sb
    ));
    // 从会话追踪集合中移除，并持久化 draft 状态到 DB
    sessionGeneratingIds.current.delete(storyboard.id);
    patchStoryboardStatus(storyboard.id, 'draft');

    toast.success(`场景${storyboard.sceneNumber}状态已重置！`);
  }, [updateStoryboards, patchStoryboardStatus]);

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button
            onClick={onBack}
            variant="ghost"
            size="sm"
            className="text-gray-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h2 className="text-xl font-bold text-white mb-1">
              第 {episode.episodeNumber} 集 - 分镜编辑
            </h2>
            <p className="text-sm text-gray-400">{storyboards.length} 个分镜</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {storyboards.length === 0 && (
            <Button
              onClick={handleGenerateAIScript}
              disabled={isGeneratingAI}
              className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:opacity-50"
            >
              {isGeneratingAI ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />生成中...</>
              ) : (
                <><Wand2 className="w-4 h-4 mr-2" />AI生成分镜</>
              )}
            </Button>
          )}
          {!isAdding && !editingId && (
            <>
              <Button
                onClick={() => setIsAdding(true)}
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
              >
                <Plus className="w-4 h-4 mr-2" />
                添加分镜
              </Button>
              {storyboards.length > 0 && (
                <Button
                  onClick={handleBatchGenerate}
                  disabled={isBatchGenerating || pendingStoryboards.length === 0}
                  className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:opacity-50"
                >
                  {isBatchGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      生成中 ({batchProgress.completed + batchProgress.failed}/{batchProgress.total})
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      {pendingStoryboards.length > 0 
                        ? `一键生成视频 (${pendingStoryboards.length})` 
                        : '全部已完成'}
                    </>
                  )}
                </Button>
              )}
              {/* v6.0.98: 配额徽章 — 当剩余配额不足时在按钮旁提示 */}
              {quota && !quota.isAdmin && !isBatchGenerating && pendingStoryboards.length > 0 && (
                <span className={`text-xs px-2 py-1 rounded-lg border ${
                  quota.totalRemaining === 0
                    ? 'bg-red-500/10 border-red-500/20 text-red-400'
                    : quota.totalRemaining < 3
                    ? 'bg-orange-500/10 border-orange-500/20 text-orange-400'
                    : 'bg-white/5 border-white/10 text-gray-400'
                }`}>
                  今日剩余 {quota.totalRemaining} 次
                </span>
              )}

              {/* v6.0.101: 智能下载按钮——替代原"合并分镜视频"手动按钮 */}
              {storyboards.length > 0 && (
                autoMergeStatus === 'merging' ? (
                  <Button
                    onClick={() => { toast.info('正在自动合并，完成后自动下载...'); setPendingDownload(true); }}
                    className="bg-purple-500/15 border border-purple-500/25 text-purple-300 hover:bg-purple-500/25"
                  >
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    合并中 {autoMergePct > 5 ? `${autoMergePct}%` : '...'}
                  </Button>
                ) : autoMergeStatus === 'done' || mergedVideoUrl || mergeBlobUrl ? (
                  <Button
                    onClick={handleDownloadEpisode}
                    disabled={isDownloading}
                    className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 disabled:opacity-50"
                  >
                    {isDownloading ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />下载中...</>
                    ) : (
                      <><Download className="w-4 h-4 mr-2" />下载分集视频</>
                    )}
                  </Button>
                ) : autoMergeStatus === 'error' ? (
                  <Button
                    onClick={() => { autoMergeTriggered.current = false; setAutoMergeStatus('idle'); }}
                    className="bg-orange-500/10 border border-orange-500/20 text-orange-300 hover:bg-orange-500/20"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    重试合并
                  </Button>
                ) : (
                  // 尚有视频未生成——灰色禁用（显示进度）
                  <Button
                    disabled
                    className="bg-white/5 border border-white/10 text-gray-500 cursor-not-allowed opacity-60"
                  >
                    <Download className="w-4 h-4 mr-2 opacity-40" />
                    下载分集视频
                    {storyboards.length > 0 && (
                      <span className="ml-1.5 text-[10px] opacity-70">({completedCount}/{storyboards.length})</span>
                    )}
                  </Button>
                )
              )}
              <StoryboardVideoMerger
                episode={episode}
                storyboards={storyboards}
                seriesId={seriesId}
                userPhone={userPhone}
                aspectRatio={aspectRatio}
                mode="button"
                mergedVideoUrl={mergedVideoUrl}
                onMergedVideoUrlChange={setMergedVideoUrl}
                onStoryboardsUpdated={handleStoryboardsUpdatedByMerger}
              />
            </>
          )}
        </div>
      </div>

      {/* 批量生成进度条 */}
      {isBatchGenerating && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-orange-500/15 to-red-500/15 border border-orange-500/30 rounded-xl p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-orange-400 animate-spin" />
              <span className="text-orange-300 text-sm font-medium">
                {batchProgress.currentScene > 0
                  ? `正在生成场景 ${batchProgress.currentScene}...`
                  : '批量生成视频中...'}
              </span>
            </div>
            <span className="text-orange-300/80 text-xs">
              {batchProgress.completed + batchProgress.failed}/{batchProgress.total}
              {batchProgress.failed > 0 && ` (${batchProgress.failed} 失败)`}
            </span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-orange-500 to-red-500"
              initial={{ width: 0 }}
              animate={{ width: `${batchProgress.total > 0 ? ((batchProgress.completed + batchProgress.failed) / batchProgress.total) * 100 : 0}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          {/* v6.0.92: 当前场景生成中的次级进度动画——给长时间轮询一个活跃感 */}
          {batchProgress.currentScene > 0 && (
            <div className="mt-2 w-full bg-white/5 rounded-full h-1 overflow-hidden">
              <motion.div
                className="h-full bg-orange-400/50 rounded-full w-1/3"
                animate={{ x: ['0%', '200%', '0%'] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
          )}
        </motion.div>
      )}

      {/* v6.0.101: 自动合并进度条（非侵入式，仅合并时显示） */}
      <AnimatePresence>
        {autoMergeStatus === 'merging' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl px-4 py-2.5 flex items-center gap-3">
              <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-purple-300 truncate">{autoMergeDetail || '正在自动合并分集视频...'}</span>
                  <span className="text-xs text-purple-400/60 ml-2 flex-shrink-0">{autoMergePct}%</span>
                </div>
                <div className="h-1 bg-purple-900/30 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                    animate={{ width: `${autoMergePct}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
        {autoMergeStatus === 'done' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="bg-green-500/8 border border-green-500/20 rounded-xl px-4 py-2 flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
              <span className="text-xs text-green-300 flex-1">
                {mergedVideoUrl ? '分集视频已合并（服务器）' : `分集视频已合并（本地 ${autoMergeDetail}）`}
                {pendingDownload && ' · 准备下载...'}
              </span>
              <button
                onClick={handleDownloadEpisode}
                disabled={isDownloading}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-300 transition-colors disabled:opacity-50 flex-shrink-0"
              >
                {isDownloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                下载
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* v6.0.131: 合并失败——过期场景"重新生成"操作面板 */}
      <AnimatePresence>
        {autoMergeStatus === 'error' && mergeExpiredScenes.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3 space-y-2.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-red-300 font-medium">
                    场景 {mergeExpiredScenes.join(', ')} 的视频链接已过期，无法下载合并
                  </p>
                  <p className="text-[11px] text-red-300/60 mt-0.5">
                    请重新生成这些场景的视频后再合并
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {mergeExpiredScenes.map((sceneNum) => {
                  const sb = storyboards.find(s => s.sceneNumber === sceneNum);
                  if (!sb) return null;
                  const isRegen = isRegeneratingScene === sceneNum;
                  return (
                    <button
                      key={sceneNum}
                      disabled={isRegen}
                      onClick={async () => {
                        setIsRegeneratingScene(sceneNum);
                        try {
                          await handleRegenerateVideo(sb, true);
                          // 重新生成成功后从列表移除
                          setMergeExpiredScenes(prev => prev.filter(n => n !== sceneNum));
                          toast.success(`场景 ${sceneNum} 视频已重新生成`);
                        } catch (err: any) {
                          toast.error(`场景 ${sceneNum} 重新生成失败: ${err.message}`);
                        } finally {
                          setIsRegeneratingScene(null);
                        }
                      }}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-300 transition-colors disabled:opacity-50 border border-red-500/20"
                    >
                      {isRegen ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      重新生成场景 {sceneNum}
                    </button>
                  );
                })}
                {mergeExpiredScenes.length > 1 && (
                  <button
                    disabled={isRegeneratingScene !== null}
                    onClick={async () => {
                      for (const sceneNum of mergeExpiredScenes) {
                        const sb = storyboards.find(s => s.sceneNumber === sceneNum);
                        if (!sb) continue;
                        setIsRegeneratingScene(sceneNum);
                        try {
                          await handleRegenerateVideo(sb);
                          setMergeExpiredScenes(prev => prev.filter(n => n !== sceneNum));
                        } catch (err: any) {
                          toast.error(`场景 ${sceneNum} 重新生成失败: ${err.message}`);
                          break;
                        } finally {
                          setIsRegeneratingScene(null);
                        }
                      }
                    }}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-orange-500/15 hover:bg-orange-500/25 text-orange-300 transition-colors disabled:opacity-50 border border-orange-500/20"
                  >
                    <Wand2 className="w-3 h-3" />
                    全部重新生成
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* v6.0.126: OSS 云端持久化状态指示器 */}
      <AnimatePresence>
        {ossUploadStatus === 'uploading' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="bg-gradient-to-r from-sky-500/10 to-blue-500/10 border border-sky-500/20 rounded-xl px-4 py-2.5 flex items-center gap-3">
              <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-sky-300 truncate flex items-center gap-1.5">
                    <Cloud className="w-3 h-3" />
                    正在保存到云端...
                  </span>
                  <span className="text-xs text-sky-400/60 ml-2 flex-shrink-0">{ossUploadPct}%</span>
                </div>
                <div className="h-1 bg-sky-900/30 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-sky-500 to-blue-500 rounded-full"
                    animate={{ width: `${ossUploadPct}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
        {ossUploadStatus === 'done' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="bg-sky-500/8 border border-sky-500/20 rounded-xl px-4 py-2 flex items-center gap-2">
              <Cloud className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
              <span className="text-xs text-sky-300 flex-1">
                已保存到云端，下次打开可直接下载
              </span>
              {mergedVideoUrl && mergedVideoUrl.startsWith('http') && (
                <button
                  onClick={handleDownloadEpisode}
                  disabled={isDownloading}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  {isDownloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                  云端下载
                </button>
              )}
            </div>
          </motion.div>
        )}
        {ossUploadStatus === 'error' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-2 flex items-center gap-2">
              <CloudOff className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <span className="text-xs text-amber-300 flex-1">
                云端保存失败（不影响本次下载）
              </span>
              <button
                onClick={() => {
                  if (mergeBlobUrl) {
                    setOssUploadStatus('idle');
                    setOssUploadPct(0);
                    uploadMergedToOSS(mergeBlobUrl, autoMergeDetail || '0');
                  }
                }}
                disabled={!mergeBlobUrl}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 transition-colors disabled:opacity-50 flex-shrink-0"
              >
                <RefreshCw className="w-3 h-3" />
                重试上传
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 视频生成统计 */}
      {storyboards.length > 0 && (
        <div className="flex gap-3 text-xs">
          <span className="px-3 py-1.5 bg-green-500/10 text-green-400 rounded-lg border border-green-500/20">
            已完成 {completedCount}/{storyboards.length}
          </span>
          {generatingCount > 0 && (
            <span className="px-3 py-1.5 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              生成中 {generatingCount}
            </span>
          )}
          {pendingStoryboards.length > 0 && (
            <span className="px-3 py-1.5 bg-gray-500/10 text-gray-400 rounded-lg border border-gray-500/20">
              待生成 {pendingStoryboards.length}
            </span>
          )}
        </div>
      )}

      {/* 添加/编辑表单 — 使用提取的 StoryboardForm 组件 */}
      {(isAdding || editingId) && (
        <StoryboardForm
          editingStoryboard={editingStoryboard}
          characters={characters}
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
        />
      )}

      {/* 分镜列表 */}
      {storyboards.length === 0 ? (
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-12 border border-white/10 text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <ImageIcon className="w-10 h-10 text-purple-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">开始创建分镜</h3>
          <p className="text-gray-400 mb-6">
            可以使用AI自动生成分镜脚本，或手动添加
          </p>
          <div className="flex justify-center gap-3">
            <Button
              onClick={handleGenerateAIScript}
              disabled={isGeneratingAI}
              className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:opacity-50"
            >
              {isGeneratingAI ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />生成中...</>
              ) : (
                <><Wand2 className="w-4 h-4 mr-2" />AI生成分镜</>
              )}
            </Button>
            <Button
              onClick={() => setIsAdding(true)}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              <Plus className="w-4 h-4 mr-2" />
              手动添加
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* 合并后的完整剧集视频展示 */}
          <StoryboardVideoMerger
            episode={episode}
            storyboards={storyboards}
            seriesId={seriesId}
            userPhone={userPhone}
            aspectRatio={aspectRatio}
            mode="player"
            mergedVideoUrl={mergedVideoUrl}
            onMergedVideoUrlChange={setMergedVideoUrl}
            onStoryboardsUpdated={handleStoryboardsUpdatedByMerger}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {storyboards.map((storyboard, index) => (
              <StoryboardCard
                key={storyboard.id}
                storyboard={storyboard}
                index={index}
                characters={characters}
                aspectRatio={aspectRatio}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onGenerate={handleGenerate}
                onRegenerate={handleRegenerateVideo}
                onResetStuck={handleResetStuck}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}