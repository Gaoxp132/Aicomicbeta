/**
 * useAutoMerge — Auto-merge + OSS upload + download logic
 * Extracted from StoryboardEditor.tsx for maintainability
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { clientMergeEpisode } from './ClientVideoMerger';
import * as seriesVideoService from '../../services';
import { getApiUrl, publicAnonKey } from '../../constants';
import type { Episode, Storyboard } from '../../types';
import { sbVideoUrl } from '../../utils';
import { getErrorMessage } from '../../utils';

interface UseAutoMergeOptions {
  episode: Episode;
  storyboardsRef: React.MutableRefObject<Storyboard[]>;
  isMountedRef: React.MutableRefObject<boolean>;
  seriesId: string;
  userPhone: string;
  preferredResolution?: string;
  allVideosReady: boolean;
  completedCount: number;
  mergedVideoUrl: string | null;
  setMergedVideoUrl: (url: string | null) => void;
}

export function useAutoMerge({
  episode,
  storyboardsRef,
  isMountedRef,
  seriesId,
  userPhone,
  preferredResolution,
  allVideosReady,
  completedCount,
  mergedVideoUrl,
  setMergedVideoUrl,
}: UseAutoMergeOptions) {
  type AutoMergeStatus = 'idle' | 'merging' | 'done' | 'error';
  const [autoMergeStatus, setAutoMergeStatus] = useState<AutoMergeStatus>('idle');
  const [autoMergePct, setAutoMergePct] = useState(0);
  const [autoMergeDetail, setAutoMergeDetail] = useState('');
  const [mergeBlobUrl, setMergeBlobUrl] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [pendingDownload, setPendingDownload] = useState(false);
  const autoMergeTriggered = useRef(false);

  // v6.0.126: OSS upload state
  const [ossUploadStatus, setOssUploadStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [ossUploadPct, setOssUploadPct] = useState(0);

  // v6.0.131: expired scenes for re-generation prompt
  const [mergeExpiredScenes, setMergeExpiredScenes] = useState<number[]>([]);
  const [isRegeneratingScene, setIsRegeneratingScene] = useState<number | null>(null);

  // v6.0.111: auto-fix resolution mismatch — only attempt once
  const hasAttemptedAutoFix = useRef(false);
  const MAX_AUTO_REGEN_SCENES = 4;

  // Reset on episode change
  const resetForEpisode = useCallback(() => {
    autoMergeTriggered.current = false;
    hasAttemptedAutoFix.current = false;
    setAutoMergeStatus('idle');
    setMergeExpiredScenes([]);
    setAutoMergePct(0);
    setAutoMergeDetail('');
    setMergeBlobUrl(null);
    setPendingDownload(false);
    setOssUploadStatus('idle');
    setOssUploadPct(0);
  }, []);

  // v6.0.126: upload merged video to OSS
  const uploadMergedToOSS = useCallback(async (blobUrl: string, sizeMB: string) => {
    if (!isMountedRef.current) return;
    setOssUploadStatus('uploading');
    setOssUploadPct(5);

    try {
      // Step 1: Get presigned PUT URL
      const tokenResp = await fetch(getApiUrl(`/episodes/${episode.id}/request-upload-token`), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userPhone, episodeNumber: episode.episodeNumber }),
      });
      if (!tokenResp.ok) {
        const tokenErr = await tokenResp.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error(`获取上传令牌失败: ${tokenErr.error || tokenResp.status}`);
      }
      const tokenData = await tokenResp.json();
      const { uploadUrl, finalOssUrl } = tokenData.data || {};
      if (!uploadUrl || !finalOssUrl) throw new Error('上传令牌响应格式无效');

      if (!isMountedRef.current) return;
      setOssUploadPct(15);
      console.log(`[OSSUpload] Got presigned URL for ep${episode.episodeNumber}, uploading blob (${sizeMB}MB)...`);

      // Step 2: Read ArrayBuffer from blobUrl
      const blobResp = await fetch(blobUrl);
      if (!blobResp.ok) throw new Error(`读取本地视频失败: HTTP ${blobResp.status}`);
      const videoBuffer = await blobResp.arrayBuffer();
      if (!isMountedRef.current) return;
      setOssUploadPct(30);

      // Step 3: PUT directly to OSS presigned URL
      let ossResp: Response | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 120_000);
          ossResp = await fetch(uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'video/mp4' },
            body: videoBuffer,
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (ossResp.ok) break;
          const ossErr = await ossResp.text().catch(() => '');
          if (attempt === 0) {
            console.warn(`[OSSUpload] PUT attempt 1 failed (${ossResp.status}), retrying in 3s...`);
            await new Promise(r => setTimeout(r, 3000));
          } else {
            throw new Error(`OSS直传失败 (${ossResp.status}): ${ossErr.substring(0, 200)}`);
          }
        } catch (putErr: unknown) {
          if (putErr instanceof Error && putErr.name === 'AbortError') {
            if (attempt === 0) {
              console.warn(`[OSSUpload] PUT timeout (120s) on attempt 1, retrying...`);
              await new Promise(r => setTimeout(r, 2000));
            } else {
              throw new Error('OSS直传超时 (120s)，视频文件较大，请检查网络连接');
            }
          } else if (attempt === 1 || (putErr instanceof Error && putErr.message?.includes('OSS直传失败'))) {
            throw putErr;
          } else {
            console.warn(`[OSSUpload] PUT attempt 1 error: ${getErrorMessage(putErr)}, retrying in 3s...`);
            await new Promise(r => setTimeout(r, 3000));
          }
        }
      }
      if (!ossResp?.ok) throw new Error('OSS直传失败: 所有尝试均失败');
      if (!isMountedRef.current) return;
      setOssUploadPct(90);
      console.log(`[OSSUpload] Uploaded to OSS: ${finalOssUrl.substring(0, 80)}`);

      // Step 4: Notify backend to save merged_video_url to DB
      const saveResp = await fetch(getApiUrl(`/episodes/${episode.id}/save-merged-video`), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${publicAnonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ossUrl: finalOssUrl, sizeMB, userPhone }),
      });
      if (!saveResp.ok) {
        const saveErr = await saveResp.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error(`保存视频URL到数据库失败: ${saveErr.error || saveResp.status}`);
      }

      if (!isMountedRef.current) return;
      setOssUploadPct(100);
      setOssUploadStatus('done');
      setMergedVideoUrl(finalOssUrl);
      console.log(`[OSSUpload] ep${episode.episodeNumber} merged video persisted to OSS+DB (${sizeMB}MB)`);
      toast.success(`第${episode.episodeNumber}集视频已保存到云端，下次可直接下载`, { duration: 6000 });
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      console.error(`[OSSUpload] Failed:`, getErrorMessage(err));
      setOssUploadStatus('error');
      toast.warning(`云端保存失败（不影响本次下载）: ${getErrorMessage(err)}`, { duration: 8000 });
    }
  }, [episode.id, episode.episodeNumber, userPhone, isMountedRef, setMergedVideoUrl]);

  // Auto-merge main logic
  useEffect(() => {
    if (!allVideosReady || mergedVideoUrl || autoMergeTriggered.current || autoMergeStatus !== 'idle') return;
    autoMergeTriggered.current = true;

    const doAutoMerge = async () => {
      if (!isMountedRef.current) return;
      setAutoMergeStatus('merging');
      setAutoMergePct(5);

      const sbCount = storyboardsRef.current.filter(sb => {
        const url = sbVideoUrl(sb);
        return url.startsWith('http');
      }).length;

      // v6.0.105: Smart routing — >6 segments go directly to client merge
      const skipServer = sbCount > 6;
      if (skipServer) {
        console.log(`[AutoMerge] Ep${episode.episodeNumber}: ${sbCount} segments > 6, skipping server → direct client merge`);
      }

      // 1. Try server merge (<=6 segments)
      if (!skipServer) {
        setAutoMergeDetail('正在合并分集视频...');
        try {
          console.log(`[AutoMerge] Ep${episode.episodeNumber}: trying server merge (${sbCount} segments)...`);
          const result = await seriesVideoService.mergeEpisodeVideos(seriesId, episode.id, userPhone);

          if (result.data?.useClientMerge) {
            console.log(`[AutoMerge] Server returned useClientMerge signal, falling back to client...`);
          } else if (result.success && result.videoUrl) {
            if (!isMountedRef.current) return;
            setMergedVideoUrl(result.videoUrl);
            setAutoMergeStatus('done');
            setAutoMergePct(100);
            setAutoMergeDetail('服务器合并完成');
            toast.success(`第${episode.episodeNumber}集已自动合并，点击下载！`, { duration: 5000 });
            return;
          } else {
            console.warn(`[AutoMerge] Server merge returned no URL:`, result.error);
          }
        } catch (serverErr: unknown) {
          console.warn(`[AutoMerge] Server merge failed (${getErrorMessage(serverErr)}), falling back to client merge...`);
        }
      }

      // 2. Client merge: pure TS MP4 concat
      if (!isMountedRef.current) return;
      setAutoMergeDetail(skipServer ? '本地合并中...' : '切换本地合并...');
      try {
        console.log(`[AutoMerge] Ep${episode.episodeNumber}: starting client-side MP4 concat (${sbCount} segments)...`);
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

        const { blobUrl, sizeMB, warnings } = mergeResult;

        setMergeBlobUrl(blobUrl);
        setAutoMergeStatus('done');
        setAutoMergePct(100);
        setAutoMergeDetail(`${sizeMB}MB`);
        if (warnings?.length) {
          toast.warning(`第${episode.episodeNumber}集合并完成但有警告:\n${warnings.join('\n')}`, { duration: 10000 });
        } else {
          toast.success(`第${episode.episodeNumber}集已合并（${sizeMB}MB），点击下载！`, { duration: 5000 });
        }

        // Upload to OSS asynchronously
        uploadMergedToOSS(blobUrl, sizeMB);
      } catch (clientErr: unknown) {
        if (!isMountedRef.current) return;
        console.error(`[AutoMerge] Client merge also failed:`, clientErr);
        setAutoMergeStatus('error');
        setAutoMergeDetail(getErrorMessage(clientErr) || '合并失败');
        autoMergeTriggered.current = false;
        const errMsg = getErrorMessage(clientErr);
        const expiredMatch = errMsg.match(
          /场景[（(]?\s*([\d,，\s]+)\s*[）)]?.*?视频(?:链接)?已过期|另有场景\s*([\d,，\s]+)\s*视频链接已过期/
        );
        if (expiredMatch) {
          const raw = (expiredMatch[1] || expiredMatch[2] || '');
          const sceneNums = raw.split(/[,，\s]+/).map(Number).filter(Boolean);
          setMergeExpiredScenes(sceneNums);
        } else {
          setMergeExpiredScenes([]);
        }
      }
    };

    doAutoMerge();
  }, [allVideosReady, mergedVideoUrl, autoMergeStatus, preferredResolution, episode, storyboardsRef, isMountedRef, seriesId, userPhone, setMergedVideoUrl, uploadMergedToOSS]);

  // Auto-download when merge completes with pending download
  useEffect(() => {
    if (autoMergeStatus === 'done' && pendingDownload) {
      setPendingDownload(false);
      handleDownloadEpisode();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMergeStatus, pendingDownload]);

  // Download handler
  const handleDownloadEpisode = useCallback(async () => {
    if (isDownloading) return;

    // Prefer blob URL (from client merge)
    if (mergeBlobUrl) {
      const a = document.createElement('a');
      a.href = mergeBlobUrl;
      a.download = `第${episode.episodeNumber || 1}集-完整视频.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    // Use server URL
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
      } catch (err: unknown) {
        toast.error('下载失败：' + getErrorMessage(err), { id: toastId });
      } finally {
        setIsDownloading(false);
      }
      return;
    }

    // Merge in progress or not started — queue
    if (autoMergeStatus === 'merging') {
      toast.info('正在合并中，合并完成后将自动下载...');
      setPendingDownload(true);
      return;
    }

    // Trigger merge (idle/error state)
    autoMergeTriggered.current = false;
    setAutoMergeStatus('idle');
  }, [mergeBlobUrl, mergedVideoUrl, isDownloading, autoMergeStatus, episode.episodeNumber]);

  // Retry OSS upload (exposed for UI retry button)
  const retryOssUpload = useCallback(() => {
    if (mergeBlobUrl) {
      setOssUploadStatus('idle');
      setOssUploadPct(0);
      uploadMergedToOSS(mergeBlobUrl, autoMergeDetail || '0');
    }
  }, [mergeBlobUrl, autoMergeDetail, uploadMergedToOSS]);

  return {
    autoMergeStatus,
    autoMergePct,
    autoMergeDetail,
    mergeBlobUrl,
    isDownloading,
    pendingDownload,
    setPendingDownload,
    ossUploadStatus,
    ossUploadPct,
    mergeExpiredScenes,
    setMergeExpiredScenes,
    isRegeneratingScene,
    setIsRegeneratingScene,
    hasAttemptedAutoFix,
    MAX_AUTO_REGEN_SCENES,
    autoMergeTriggered,
    resetForEpisode,
    handleDownloadEpisode,
    retryOssUpload,
    setAutoMergeStatus,
    setAutoMergePct,
  };
}