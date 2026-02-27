/**
 * useAdminPaymentPoller — v6.0.102
 *
 * 管理员付款通知轮询器:
 *  - 每 60 秒轮询一次 /admin/pending-count（轻量端点，仅返回数量）
 *  - 首次获取建立基线（不触发通知，避免打开 App 就弹窗）
 *  - 后续如果 pending 数量增加 → 触发浏览器 OS 通知 + toast
 *  - 基线持久化到 localStorage，刷新页面不重复提醒
 *  - 通知点击 → 聚焦窗口 + 回调（可打开 AdminPanel 到付款 tab）
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { apiGet } from '../utils';

const POLL_INTERVAL_MS = 60_000; // 60 秒

export type NotifPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export interface UseAdminPaymentPollerReturn {
  /** 当前待审核付款数量 */
  pendingCount: number;
  /** 当前 Notification 权限状态 */
  notifPermission: NotifPermission;
  /** 手动请求通知权限（需要用户交互触发，否则浏览器拦截） */
  requestPermission: () => Promise<NotifPermission>;
}

export function useAdminPaymentPoller(
  adminPhone: string | null,
  /** 当有新付款到达时回调（count = 新增数量） */
  onNewPayments?: (count: number) => void
): UseAdminPaymentPollerReturn {
  const [pendingCount, setPendingCount] = useState(0);
  const [notifPermission, setNotifPermission] = useState<NotifPermission>(() => {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission as NotifPermission;
  });

  // 基线 ref：-1 表示尚未初始化，防止首次打开就推送旧通知
  const baselineRef = useRef<number>(-1);
  const storageKey = adminPhone ? `admin_pay_baseline_${adminPhone}` : null;

  // 从 localStorage 还原基线（避免刷新后重复提醒）
  useEffect(() => {
    if (!storageKey) return;
    const stored = localStorage.getItem(storageKey);
    if (stored !== null) {
      baselineRef.current = parseInt(stored, 10);
    }
  }, [storageKey]);

  /** 核心：拉取 pending 数量并决定是否触发通知 */
  const poll = useCallback(async () => {
    if (!adminPhone) return;
    try {
      const result = await apiGet(`/admin/pending-count?adminPhone=${adminPhone}`, { silent: true });
      if (!result.success) return;
      const newCount: number = (result.data as any)?.pendingCount ?? 0;
      setPendingCount(newCount);

      if (baselineRef.current === -1) {
        // 第一次拉取：只建立基线，不推送
        baselineRef.current = newCount;
        if (storageKey) localStorage.setItem(storageKey, String(newCount));
        return;
      }

      const diff = newCount - baselineRef.current;
      if (diff <= 0) return; // 没有新增

      // 有新付款 —— 更新基线
      baselineRef.current = newCount;
      if (storageKey) localStorage.setItem(storageKey, String(newCount));

      // 1. OS 级通知（需要权限）
      const currentPerm = typeof Notification !== 'undefined' ? Notification.permission : 'denied';
      if (currentPerm === 'granted') {
        try {
          const notif = new Notification('💰 新付款待审核', {
            body: `有 ${diff} 笔新付款记录需要处理，点击进入管理面板`,
            icon: '/vite.svg',
            tag: 'admin-payment-notify', // 同 tag 自动替换旧通知，不堆叠
            requireInteraction: true,    // 停留直到用户交互（Chrome/Edge 支持）
          });
          notif.onclick = () => {
            window.focus();
            onNewPayments?.(diff);
            notif.close();
          };
        } catch (e) {
          console.warn('[PaymentPoller] Notification error:', e);
        }
      }

      // 2. In-App Toast（权限 granted/default/denied 都触发）
      toast(`💰 有 ${diff} 笔新付款待审核`, {
        description: '请前往管理面板 → 付款记录处理',
        duration: 12000,
        action: {
          label: '立即查看',
          onClick: () => onNewPayments?.(diff),
        },
      });
    } catch (err) {
      // 网络失败不影响体验，静默忽略
    }
  }, [adminPhone, storageKey, onNewPayments]);

  // 轮询定时器
  useEffect(() => {
    if (!adminPhone) return;

    poll(); // 立即执行一次建立基线
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [adminPhone, poll]);

  /** 手动请求通知权限（必须由用户手势触发，才能弹出系统授权弹窗） */
  const requestPermission = useCallback(async (): Promise<NotifPermission> => {
    if (typeof Notification === 'undefined') return 'unsupported';
    if (Notification.permission === 'granted') {
      setNotifPermission('granted');
      return 'granted';
    }
    try {
      const result = await Notification.requestPermission();
      setNotifPermission(result as NotifPermission);
      return result as NotifPermission;
    } catch {
      return 'denied';
    }
  }, []);

  // 同步外部权限变化（用户在系统设置中修改后）
  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    const sync = () => setNotifPermission(Notification.permission as NotifPermission);
    // 每 10s 检查一次权限状态（有些浏览器不提供 change 事件）
    const t = setInterval(sync, 10_000);
    return () => clearInterval(t);
  }, []);

  return { pendingCount, notifPermission, requestPermission };
}