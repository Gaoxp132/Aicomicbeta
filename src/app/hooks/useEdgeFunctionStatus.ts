import { useState, useEffect, useRef } from 'react';
import { getApiUrl } from '../constants/api';
import { publicAnonKey } from '/utils/supabase/info';

export function useEdgeFunctionStatus() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [showError, setShowError] = useState(false); // 🔥 默认不显示错误
  const consecutiveFailures = useRef(0);
  const maxConsecutiveFailures = 5; // 🔥 提高到5次，避免过早显示错误
  const retryTimeoutRef = useRef<NodeJS.Timeout>();
  const hasCheckedOnce = useRef(false); // 🔥 只检查一次

  useEffect(() => {
    // 🔥 只在首次加载时检查一次，避免频繁检查
    if (!hasCheckedOnce.current) {
      checkConnection();
      hasCheckedOnce.current = true;
    }
    
    // 清理定时器
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  const checkConnection = async () => {
    setIsChecking(true);
    
    try {
      const controller = new AbortController();
      // 🔥 减少到10秒，更快失败
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(getApiUrl('/health'), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        if (consecutiveFailures.current > 0) {
          console.log('[Edge Function] ✅ 连接恢复成功');
        }
        consecutiveFailures.current = 0;
        setIsConnected(true);
        setShowError(false);
      } else {
        consecutiveFailures.current++;
        console.error(`[Edge Function] ❌ 响应错误 (${consecutiveFailures.current}/${maxConsecutiveFailures}):`, response.status);
        setIsConnected(false);
        
        // 只有连续失败多次才显示错误
        if (consecutiveFailures.current >= maxConsecutiveFailures) {
          setShowError(true);
        } else {
          // 自动重试
          scheduleRetry();
        }
      }
    } catch (error: any) {
      consecutiveFailures.current++;
      
      // 只在第一次失败时记录详细错误
      if (consecutiveFailures.current === 1) {
        if (error.name === 'AbortError') {
          console.warn('[Edge Function] ⏰ 连接超时 (30秒) - 将自动重试');
        } else if (error.message === 'Failed to fetch') {
          console.warn('[Edge Function] 🔌 网络连接失败 - 将自动重试');
        } else {
          console.error('[Edge Function] ❌ 连接失败:', error.message);
        }
      }
      
      setIsConnected(false);
      
      // 只有连续失败多次才显示错误
      if (consecutiveFailures.current >= maxConsecutiveFailures) {
        setShowError(true);
      } else {
        // 自动重试
        scheduleRetry();
      }
    } finally {
      setIsChecking(false);
    }
  };

  // 计划自动重试
  const scheduleRetry = () => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
    
    // 指数退避：2秒、4秒、8秒
    const delay = Math.min(2000 * Math.pow(2, consecutiveFailures.current - 1), 8000);
    console.log(`[Edge Function] 🔄 将在 ${delay}ms 后重试 (尝试 ${consecutiveFailures.current}/${maxConsecutiveFailures})`);
    
    retryTimeoutRef.current = setTimeout(() => {
      checkConnection();
    }, delay);
  };

  const dismissError = () => {
    setShowError(false);
    consecutiveFailures.current = 0;
    // 清除重试计时器
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
  };

  return {
    isConnected,
    isChecking,
    showError,
    dismissError,
    retry: checkConnection,
  };
}