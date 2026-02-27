/**
 * useVideoQuota — 获取当前用户今日视频生成配额
 * v6.0.98: ProfilePanel + StoryboardEditor 两处复用
 */
import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../utils';

export interface VideoQuotaInfo {
  usedToday: number;
  freeLimit: number;
  paidCredits: number;
  freeRemaining: number;
  totalRemaining: number;
  isAdmin: boolean;
}

export function useVideoQuota(userPhone: string | undefined) {
  const [quota, setQuota] = useState<VideoQuotaInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userPhone) { setQuota(null); return; }
    setIsLoading(true);
    try {
      const result = await apiGet(`/user/video-quota/${encodeURIComponent(userPhone)}`);
      if (result.success && result.data) {
        setQuota(result.data as VideoQuotaInfo);
      }
    } catch (err) {
      console.warn('[useVideoQuota] Failed to fetch quota:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userPhone]);

  useEffect(() => { refresh(); }, [refresh]);

  return { quota, isLoading, refresh };
}
