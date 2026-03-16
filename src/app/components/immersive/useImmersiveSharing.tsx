/**
 * useImmersiveSharing hook - Share, download, copy link
 * Split from consolidated immersive/index.tsx (v6.0.67)
 */

import { useState } from 'react';
import { toast } from 'sonner';

interface UseImmersiveSharingOptions { work: any; }

export function useImmersiveSharing({ work }: UseImmersiveSharingOptions) {
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const handleShare = async () => { setShowShareMenu(!showShareMenu); };
  const handleDownload = async () => {
    try {
      const videoUrl = work.videoUrl || work.video_url;
      const a = document.createElement('a'); a.href = videoUrl; a.download = `${work.title || 'video'}.mp4`; a.target = '_blank'; a.rel = 'noopener noreferrer';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } catch (error: unknown) { console.error('Failed to download video:', error); window.open(work.videoUrl || work.video_url, '_blank'); }
  };
  const handleCopyLink = async () => {
    const url = window.location.href;
    if (navigator.clipboard?.writeText) { try { await navigator.clipboard.writeText(url); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); return; } catch {} }
    const textArea = document.createElement('textarea'); textArea.value = url; textArea.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
    document.body.appendChild(textArea); textArea.focus(); textArea.select();
    try { if (document.execCommand('copy')) { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); document.body.removeChild(textArea); return; } } catch {}
    document.body.removeChild(textArea);
    // Fallback: show toast with URL for manual copy
    toast.info(`请手动复制链接：${url}`);
  };
  const handleWeChatShare = async () => {
    if (navigator.share) { try { await navigator.share({ title: work.title || '精彩视频', text: work.prompt || '快来看看这个精彩视频！', url: window.location.href }); } catch {} }
  };

  return { showShareMenu, setShowShareMenu, linkCopied, handleShare, handleDownload, handleCopyLink, handleWeChatShare };
}