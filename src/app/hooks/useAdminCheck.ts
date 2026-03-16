/**
 * useAdminCheck — v6.0.176
 * 
 * 从服务端验证当前用户是否为管理员，替代前端硬编码手机号比较。
 * 返回 { isAdmin, isSuperAdmin, isLoading }
 * 缓存结果到 sessionStorage，避免每次页面加载重复请求。
 */
import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../utils';

const SESSION_CACHE_KEY = 'admin_check_cache';

interface AdminCheckCache {
  phone: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  ts: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useAdminCheck(userPhone: string) {
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    // 从 sessionStorage 快速恢复，避免页面闪烁
    if (!userPhone) return false;
    try {
      const cached = sessionStorage.getItem(SESSION_CACHE_KEY);
      if (cached) {
        const parsed: AdminCheckCache = JSON.parse(cached);
        if (parsed.phone === userPhone && Date.now() - parsed.ts < CACHE_TTL) {
          return parsed.isAdmin;
        }
      }
    } catch {}
    return false;
  });
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(() => {
    if (!userPhone) return false;
    try {
      const cached = sessionStorage.getItem(SESSION_CACHE_KEY);
      if (cached) {
        const parsed: AdminCheckCache = JSON.parse(cached);
        if (parsed.phone === userPhone && Date.now() - parsed.ts < CACHE_TTL) {
          return parsed.isSuperAdmin;
        }
      }
    } catch {}
    return false;
  });
  const [isLoading, setIsLoading] = useState(false);

  const checkAdmin = useCallback(async () => {
    if (!userPhone) {
      setIsAdmin(false);
      setIsSuperAdmin(false);
      sessionStorage.removeItem(SESSION_CACHE_KEY);
      return;
    }

    // 先检查缓存是否仍然有效
    try {
      const cached = sessionStorage.getItem(SESSION_CACHE_KEY);
      if (cached) {
        const parsed: AdminCheckCache = JSON.parse(cached);
        if (parsed.phone === userPhone && Date.now() - parsed.ts < CACHE_TTL) {
          setIsAdmin(parsed.isAdmin);
          setIsSuperAdmin(parsed.isSuperAdmin);
          return;
        }
      }
    } catch {}

    setIsLoading(true);
    try {
      const result = await apiGet(`/admin/check/${encodeURIComponent(userPhone)}`);
      if (result.success && result.data) {
        const admin = !!result.data.isAdmin;
        const superAdmin = !!result.data.isSuperAdmin;
        setIsAdmin(admin);
        setIsSuperAdmin(superAdmin);
        // 缓存到 sessionStorage
        const cache: AdminCheckCache = {
          phone: userPhone,
          isAdmin: admin,
          isSuperAdmin: superAdmin,
          ts: Date.now(),
        };
        sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(cache));
      } else {
        setIsAdmin(false);
        setIsSuperAdmin(false);
      }
    } catch (err: unknown) {
      console.warn('[useAdminCheck] Failed to check admin status:', err);
      // 网络错误时不改变当前状态（允许用缓存）
    } finally {
      setIsLoading(false);
    }
  }, [userPhone]);

  useEffect(() => {
    checkAdmin();
  }, [checkAdmin]);

  /** 强制刷新管理员状态（例如管理员列表变更后） */
  const refresh = useCallback(async () => {
    sessionStorage.removeItem(SESSION_CACHE_KEY);
    await checkAdmin();
  }, [checkAdmin]);

  return { isAdmin, isSuperAdmin, isLoading, refresh };
}