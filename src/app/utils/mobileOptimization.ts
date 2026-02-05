/**
 * 移动端体验优化工具
 * 
 * 功能：
 * - 触摸手势识别
 * - 移动端适配检测
 * - 触摸事件优化
 * - 滚动优化
 * - 虚拟键盘处理
 * - PWA支持
 */

import { useEffect, useRef, useState, useCallback } from 'react';

// ==================== 类型定义 ====================

interface TouchPoint {
  x: number;
  y: number;
  timestamp: number;
}

interface SwipeDirection {
  direction: 'up' | 'down' | 'left' | 'right';
  distance: number;
  duration: number;
  velocity: number;
}

interface PinchData {
  scale: number;
  center: { x: number; y: number };
}

interface DeviceInfo {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isTouchDevice: boolean;
  screenSize: 'small' | 'medium' | 'large';
  orientation: 'portrait' | 'landscape';
}

// ==================== 设备检测 ====================

/**
 * 获取设备信息
 */
export function getDeviceInfo(): DeviceInfo {
  const ua = navigator.userAgent;
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isTablet = /iPad|Android/i.test(ua) && !/Mobile/i.test(ua);
  const isMobile = isTouchDevice && !isTablet;
  const isDesktop = !isMobile && !isTablet;

  const width = window.innerWidth;
  let screenSize: 'small' | 'medium' | 'large' = 'large';
  if (width < 640) {
    screenSize = 'small';
  } else if (width < 1024) {
    screenSize = 'medium';
  }

  const orientation: 'portrait' | 'landscape' = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';

  return {
    isMobile,
    isTablet,
    isDesktop,
    isIOS,
    isAndroid,
    isTouchDevice,
    screenSize,
    orientation,
  };
}

/**
 * 检测是否为移动设备Hook
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => getDeviceInfo().isMobile);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(getDeviceInfo().isMobile);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
}

/**
 * 设备信息Hook
 */
export function useDeviceInfo(): DeviceInfo {
  const [deviceInfo, setDeviceInfo] = useState(() => getDeviceInfo());

  useEffect(() => {
    const handleResize = () => {
      setDeviceInfo(getDeviceInfo());
    };

    const handleOrientationChange = () => {
      setTimeout(() => {
        setDeviceInfo(getDeviceInfo());
      }, 100);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, []);

  return deviceInfo;
}

// ==================== 触摸手势 ====================

/**
 * 滑动手势Hook
 */
export function useSwipeGesture(
  onSwipe: (direction: SwipeDirection) => void,
  options: {
    threshold?: number; // 最小滑动距离
    timeout?: number; // 最大滑动时间
  } = {}
) {
  const { threshold = 50, timeout = 300 } = options;
  const startPoint = useRef<TouchPoint | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    startPoint.current = {
      x: touch.clientX,
      y: touch.clientY,
      timestamp: Date.now(),
    };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!startPoint.current) return;

    const touch = e.changedTouches[0];
    const endPoint: TouchPoint = {
      x: touch.clientX,
      y: touch.clientY,
      timestamp: Date.now(),
    };

    const deltaX = endPoint.x - startPoint.current.x;
    const deltaY = endPoint.y - startPoint.current.y;
    const duration = endPoint.timestamp - startPoint.current.timestamp;

    // 检查是否超时
    if (duration > timeout) {
      startPoint.current = null;
      return;
    }

    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // 检查是否达到阈值
    if (distance < threshold) {
      startPoint.current = null;
      return;
    }

    // 判断方向
    let direction: 'up' | 'down' | 'left' | 'right';
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      direction = deltaX > 0 ? 'right' : 'left';
    } else {
      direction = deltaY > 0 ? 'down' : 'up';
    }

    const velocity = distance / duration;

    onSwipe({
      direction,
      distance,
      duration,
      velocity,
    });

    startPoint.current = null;
  }, [onSwipe, threshold, timeout]);

  return {
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
  };
}

/**
 * 长按手势Hook
 */
export function useLongPress(
  onLongPress: () => void,
  options: {
    delay?: number; // 长按延迟时间
    moveThreshold?: number; // 移动阈值
  } = {}
) {
  const { delay = 500, moveThreshold = 10 } = options;
  const timerRef = useRef<NodeJS.Timeout>();
  const startPoint = useRef<{ x: number; y: number } | null>(null);

  const start = useCallback((x: number, y: number) => {
    startPoint.current = { x, y };
    timerRef.current = setTimeout(() => {
      onLongPress();
    }, delay);
  }, [onLongPress, delay]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    startPoint.current = null;
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    start(touch.clientX, touch.clientY);
  }, [start]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!startPoint.current) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - startPoint.current.x;
    const deltaY = touch.clientY - startPoint.current.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    if (distance > moveThreshold) {
      cancel();
    }
  }, [cancel, moveThreshold]);

  const handleTouchEnd = useCallback(() => {
    cancel();
  }, [cancel]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    start(e.clientX, e.clientY);
  }, [start]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!startPoint.current) return;

    const deltaX = e.clientX - startPoint.current.x;
    const deltaY = e.clientY - startPoint.current.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    if (distance > moveThreshold) {
      cancel();
    }
  }, [cancel, moveThreshold]);

  const handleMouseUp = useCallback(() => {
    cancel();
  }, [cancel]);

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onMouseDown: handleMouseDown,
    onMouseMove: handleMouseMove,
    onMouseUp: handleMouseUp,
  };
}

/**
 * 双击手势Hook
 */
export function useDoubleTap(
  onDoubleTap: () => void,
  options: {
    delay?: number; // 双击间隔时间
  } = {}
) {
  const { delay = 300 } = options;
  const lastTapRef = useRef<number>(0);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapRef.current;

    if (timeSinceLastTap < delay && timeSinceLastTap > 0) {
      onDoubleTap();
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  }, [onDoubleTap, delay]);

  return {
    onTouchEnd: handleTouchEnd,
  };
}

// ==================== 滚动优化 ====================

/**
 * 滚动到顶部时加载更多Hook
 */
export function useScrollToTop(
  onReachTop: () => void,
  options: {
    threshold?: number;
    enabled?: boolean;
  } = {}
) {
  const { threshold = 100, enabled = true } = options;
  const isLoadingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const handleScroll = () => {
      if (isLoadingRef.current) return;

      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

      if (scrollTop < threshold) {
        isLoadingRef.current = true;
        onReachTop();
        setTimeout(() => {
          isLoadingRef.current = false;
        }, 1000);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [onReachTop, threshold, enabled]);
}

/**
 * 滚动到底部时加载更多Hook
 */
export function useScrollToBottom(
  onReachBottom: () => void,
  options: {
    threshold?: number;
    enabled?: boolean;
  } = {}
) {
  const { threshold = 100, enabled = true } = options;
  const isLoadingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const handleScroll = () => {
      if (isLoadingRef.current) return;

      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight;

      if (scrollTop + clientHeight >= scrollHeight - threshold) {
        isLoadingRef.current = true;
        onReachBottom();
        setTimeout(() => {
          isLoadingRef.current = false;
        }, 1000);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [onReachBottom, threshold, enabled]);
}

// ==================== 虚拟键盘处理 ====================

/**
 * 监听虚拟键盘显示/隐藏Hook
 */
export function useVirtualKeyboard(
  onShow?: () => void,
  onHide?: () => void
) {
  useEffect(() => {
    const handleResize = () => {
      // 检测高度变化（虚拟键盘弹出会改变视口高度）
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      const windowHeight = window.innerHeight;

      if (viewportHeight < windowHeight * 0.75) {
        onShow?.();
      } else {
        onHide?.();
      }
    };

    window.visualViewport?.addEventListener('resize', handleResize);
    return () => window.visualViewport?.removeEventListener('resize', handleResize);
  }, [onShow, onHide]);
}

/**
 * 修复iOS输入框被键盘遮挡
 */
export function useIOSInputFix() {
  useEffect(() => {
    if (!getDeviceInfo().isIOS) return;

    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        setTimeout(() => {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    };

    document.addEventListener('focus', handleFocus, true);
    return () => document.removeEventListener('focus', handleFocus, true);
  }, []);
}

// ==================== PWA支持 ====================

/**
 * 检测PWA安装状态
 */
export function usePWAInstall() {
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const deferredPromptRef = useRef<any>(null);

  useEffect(() => {
    // 检测是否已安装
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    // 监听安装事件
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      setIsInstallable(true);
    };

    // 监听安装完成
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      deferredPromptRef.current = null;
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPromptRef.current) return;

    deferredPromptRef.current.prompt();
    const { outcome } = await deferredPromptRef.current.userChoice;

    if (outcome === 'accepted') {
      console.log('[PWA] User accepted the install prompt');
    } else {
      console.log('[PWA] User dismissed the install prompt');
    }

    deferredPromptRef.current = null;
    setIsInstallable(false);
  }, []);

  return {
    isInstallable,
    isInstalled,
    promptInstall,
  };
}

// ==================== 触摸事件优化 ====================

/**
 * 防止触摸穿透
 */
export function preventTouchThrough(e: React.TouchEvent) {
  e.stopPropagation();
}

/**
 * 禁用iOS双击缩放
 */
export function disableIOSDoubleTapZoom() {
  if (!getDeviceInfo().isIOS) return;

  let lastTouchEnd = 0;

  const preventZoom = (e: TouchEvent) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      e.preventDefault();
    }
    lastTouchEnd = now;
  };

  document.addEventListener('touchend', preventZoom, { passive: false });

  return () => {
    document.removeEventListener('touchend', preventZoom);
  };
}

/**
 * 禁用长按菜单
 */
export function disableLongPressMenu() {
  const preventContextMenu = (e: Event) => {
    e.preventDefault();
  };

  document.addEventListener('contextmenu', preventContextMenu);

  return () => {
    document.removeEventListener('contextmenu', preventContextMenu);
  };
}

// ==================== 性能优化 ====================

/**
 * 使用CSS硬件加速
 */
export function enableHardwareAcceleration(element: HTMLElement) {
  element.style.transform = 'translateZ(0)';
  element.style.willChange = 'transform';
}

/**
 * 禁用滚动链
 */
export function disableScrollChaining(element: HTMLElement) {
  element.style.overscrollBehavior = 'contain';
}

/**
 * 启用smooth滚动
 */
export function enableSmoothScroll() {
  document.documentElement.style.scrollBehavior = 'smooth';
}

// ==================== 工具函数 ====================

/**
 * 获取安全区域
 */
export function getSafeArea() {
  const style = getComputedStyle(document.documentElement);
  return {
    top: parseInt(style.getPropertyValue('--sat') || '0'),
    right: parseInt(style.getPropertyValue('--sar') || '0'),
    bottom: parseInt(style.getPropertyValue('--sab') || '0'),
    left: parseInt(style.getPropertyValue('--sal') || '0'),
  };
}

/**
 * 添加安全区域CSS变量
 */
export function applySafeAreaCSS() {
  const style = document.createElement('style');
  style.textContent = `
    :root {
      --sat: env(safe-area-inset-top);
      --sar: env(safe-area-inset-right);
      --sab: env(safe-area-inset-bottom);
      --sal: env(safe-area-inset-left);
    }
  `;
  document.head.appendChild(style);
}

/**
 * 初始化移动端优化
 */
export function initializeMobileOptimization() {
  const deviceInfo = getDeviceInfo();

  if (deviceInfo.isMobile || deviceInfo.isTablet) {
    // 添加安全区域支持
    applySafeAreaCSS();

    // 启用smooth滚动
    enableSmoothScroll();

    // iOS特殊处理
    if (deviceInfo.isIOS) {
      disableIOSDoubleTapZoom();
    }

    console.log('[MobileOptimization] ✅ Mobile optimizations initialized');
  }
}

console.log('[MobileOptimization] ✅ Mobile optimization utilities loaded');
