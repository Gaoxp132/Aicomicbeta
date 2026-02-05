/**
 * 可访问性优化工具（A11y）
 * 
 * 功能：
 * - ARIA属性管理
 * - 键盘导航
 * - 焦点管理
 * - 屏幕阅读器支持
 * - 颜色对比度检测
 * - 文本可读性
 */

import { useEffect, useRef, useCallback, useState } from 'react';

// ==================== 类型定义 ====================

interface FocusTrapOptions {
  autoFocus?: boolean;
  returnFocus?: boolean;
  allowOutsideClick?: boolean;
}

interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  handler: (e: KeyboardEvent) => void;
  description?: string;
}

// ==================== 焦点管理 ====================

/**
 * 焦点陷阱Hook - 用于模态框等
 */
export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement>,
  isActive: boolean,
  options: FocusTrapOptions = {}
) {
  const { autoFocus = true, returnFocus = true, allowOutsideClick = false } = options;
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    // 保存之前的焦点元素
    previousActiveElement.current = document.activeElement as HTMLElement;

    // 获取所有可聚焦元素
    const getFocusableElements = (): HTMLElement[] => {
      const selector = [
        'a[href]',
        'button:not([disabled])',
        'textarea:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
      ].join(',');

      return Array.from(containerRef.current!.querySelectorAll(selector));
    };

    const focusableElements = getFocusableElements();

    if (autoFocus && focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    // 处理Tab键
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusableElements = getFocusableElements();
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    // 处理外部点击
    const handleClickOutside = (e: MouseEvent) => {
      if (!allowOutsideClick && !containerRef.current?.contains(e.target as Node)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    if (!allowOutsideClick) {
      document.addEventListener('mousedown', handleClickOutside, true);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside, true);

      // 恢复焦点
      if (returnFocus && previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    };
  }, [isActive, containerRef, autoFocus, returnFocus, allowOutsideClick]);
}

/**
 * 焦点可见Hook - 只在键盘导航时显示焦点框
 */
export function useFocusVisible() {
  const [isFocusVisible, setIsFocusVisible] = useState(false);
  const hadKeyboardEventRef = useRef(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        hadKeyboardEventRef.current = true;
        setIsFocusVisible(true);
      }
    };

    const handleMouseDown = () => {
      hadKeyboardEventRef.current = false;
      setIsFocusVisible(false);
    };

    const handleFocus = () => {
      if (hadKeyboardEventRef.current) {
        setIsFocusVisible(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('focus', handleFocus, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('focus', handleFocus, true);
    };
  }, []);

  return isFocusVisible;
}

/**
 * 自动焦点Hook
 */
export function useAutoFocus<T extends HTMLElement>(): React.RefObject<T> {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.focus();
    }
  }, []);

  return ref;
}

// ==================== 键盘导航 ====================

/**
 * 键盘快捷键Hook
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const ctrlMatch = !shortcut.ctrl || e.ctrlKey;
        const shiftMatch = !shortcut.shift || e.shiftKey;
        const altMatch = !shortcut.alt || e.altKey;
        const metaMatch = !shortcut.meta || e.metaKey;
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();

        if (ctrlMatch && shiftMatch && altMatch && metaMatch && keyMatch) {
          e.preventDefault();
          shortcut.handler(e);
          return;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}

/**
 * 箭头键导航Hook
 */
export function useArrowKeyNavigation(
  itemsRef: React.RefObject<HTMLElement[]>,
  options: {
    wrap?: boolean;
    vertical?: boolean;
    horizontal?: boolean;
  } = {}
) {
  const { wrap = true, vertical = true, horizontal = true } = options;
  const currentIndexRef = useRef(0);

  const focusItem = useCallback((index: number) => {
    const items = itemsRef.current;
    if (!items || items.length === 0) return;

    let newIndex = index;

    if (wrap) {
      if (newIndex < 0) newIndex = items.length - 1;
      if (newIndex >= items.length) newIndex = 0;
    } else {
      if (newIndex < 0) newIndex = 0;
      if (newIndex >= items.length) newIndex = items.length - 1;
    }

    currentIndexRef.current = newIndex;
    items[newIndex]?.focus();
  }, [itemsRef, wrap]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (vertical && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const direction = e.key === 'ArrowDown' ? 1 : -1;
        focusItem(currentIndexRef.current + direction);
      }

      if (horizontal && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        const direction = e.key === 'ArrowRight' ? 1 : -1;
        focusItem(currentIndexRef.current + direction);
      }

      if (e.key === 'Home') {
        e.preventDefault();
        focusItem(0);
      }

      if (e.key === 'End') {
        e.preventDefault();
        const items = itemsRef.current;
        if (items) {
          focusItem(items.length - 1);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [focusItem, itemsRef, vertical, horizontal]);

  return { focusItem };
}

// ==================== ARIA属性 ====================

/**
 * 生成唯一ID
 */
let idCounter = 0;
export function useUniqueId(prefix = 'id'): string {
  const idRef = useRef<string>();

  if (!idRef.current) {
    idRef.current = `${prefix}-${++idCounter}`;
  }

  return idRef.current;
}

/**
 * ARIA实时区域Hook
 */
export function useAriaLive(
  message: string,
  options: {
    politeness?: 'polite' | 'assertive' | 'off';
    delay?: number;
  } = {}
) {
  const { politeness = 'polite', delay = 0 } = options;

  useEffect(() => {
    if (!message) return;

    const announcer = document.createElement('div');
    announcer.setAttribute('aria-live', politeness);
    announcer.setAttribute('aria-atomic', 'true');
    announcer.className = 'sr-only';
    document.body.appendChild(announcer);

    const timeoutId = setTimeout(() => {
      announcer.textContent = message;
    }, delay);

    return () => {
      clearTimeout(timeoutId);
      document.body.removeChild(announcer);
    };
  }, [message, politeness, delay]);
}

/**
 * ARIA描述Hook
 */
export function useAriaDescription(description: string) {
  const id = useUniqueId('aria-desc');

  useEffect(() => {
    const descElement = document.createElement('div');
    descElement.id = id;
    descElement.className = 'sr-only';
    descElement.textContent = description;
    document.body.appendChild(descElement);

    return () => {
      document.body.removeChild(descElement);
    };
  }, [id, description]);

  return id;
}

// ==================== 屏幕阅读器 ====================

/**
 * 屏幕阅读器公告
 */
export function announceToScreenReader(
  message: string,
  politeness: 'polite' | 'assertive' = 'polite'
): void {
  const announcer = document.createElement('div');
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', politeness);
  announcer.setAttribute('aria-atomic', 'true');
  announcer.className = 'sr-only';
  announcer.textContent = message;

  document.body.appendChild(announcer);

  setTimeout(() => {
    document.body.removeChild(announcer);
  }, 1000);
}

/**
 * 检测屏幕阅读器
 */
export function isScreenReaderActive(): boolean {
  // 创建一个隐藏元素来检测
  const testElement = document.createElement('div');
  testElement.setAttribute('role', 'alert');
  testElement.className = 'sr-only';
  testElement.textContent = 'Screen reader test';
  document.body.appendChild(testElement);

  const isActive = testElement.offsetParent === null;

  document.body.removeChild(testElement);

  return isActive;
}

// ==================== 颜色对比度 ====================

/**
 * 计算颜色亮度
 */
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const sRGB = c / 255;
    return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * 计算颜色对比度
 */
export function getContrastRatio(color1: string, color2: string): number {
  const parseColor = (color: string): [number, number, number] => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b];
  };

  const [r1, g1, b1] = parseColor(color1);
  const [r2, g2, b2] = parseColor(color2);

  const l1 = getLuminance(r1, g1, b1);
  const l2 = getLuminance(r2, g2, b2);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * 检查颜色对比度是否符合WCAG标准
 */
export function checkContrastCompliance(
  foreground: string,
  background: string,
  level: 'AA' | 'AAA' = 'AA',
  isLargeText = false
): {
  ratio: number;
  passes: boolean;
  level: 'AA' | 'AAA';
} {
  const ratio = getContrastRatio(foreground, background);
  const requiredRatio = isLargeText
    ? level === 'AAA' ? 4.5 : 3
    : level === 'AAA' ? 7 : 4.5;

  return {
    ratio,
    passes: ratio >= requiredRatio,
    level,
  };
}

// ==================== 文本可读性 ====================

/**
 * 获取跳过内容链接的属性
 */
export function getSkipToContentProps(targetId: string) {
  return {
    href: `#${targetId}`,
    className: 'sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded',
    children: '跳转到主内容',
  };
}

/**
 * 获取屏幕阅读器专用元素的属性
 */
export function getScreenReaderOnlyProps() {
  return {
    className: 'sr-only',
  };
}

// ==================== CSS类 ====================

/**
 * 添加无障碍CSS类
 */
export function addAccessibilityCSS() {
  const style = document.createElement('style');
  style.textContent = `
    /* 屏幕阅读器专用 */
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border-width: 0;
    }

    /* 焦点可见 */
    .focus-visible:focus {
      outline: 2px solid #3b82f6;
      outline-offset: 2px;
    }

    /* 减少动画（用户偏好） */
    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }

    /* 高对比度模式 */
    @media (prefers-contrast: high) {
      * {
        border-color: currentColor !important;
      }
    }

    /* 强制显示焦点框 */
    :focus-visible {
      outline: 2px solid #3b82f6;
      outline-offset: 2px;
    }
  `;
  document.head.appendChild(style);
}

// ==================== 工具函数 ====================

/**
 * 检查元素是否可聚焦
 */
export function isFocusable(element: HTMLElement): boolean {
  if (element.hasAttribute('disabled')) return false;
  if (element.hasAttribute('tabindex')) {
    const tabindex = parseInt(element.getAttribute('tabindex')!);
    return tabindex >= 0;
  }

  const focusableTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'];
  return focusableTags.includes(element.tagName);
}

/**
 * 获取所有可聚焦元素
 */
export function getFocusableElements(container: HTMLElement = document.body): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  return Array.from(container.querySelectorAll(selector));
}

/**
 * 设置页面语言
 */
export function setPageLanguage(lang: string): void {
  document.documentElement.lang = lang;
}

/**
 * 设置页面标题
 */
export function setPageTitle(title: string, appendSiteName = true): void {
  document.title = appendSiteName ? `${title} - AI漫剧创作平台` : title;
}

// ==================== 初始化 ====================

/**
 * 初始化无障碍功能
 */
export function initializeAccessibility() {
  // 添加无障碍CSS
  addAccessibilityCSS();

  // 设置页面语言
  setPageLanguage('zh-CN');

  // 检测屏幕阅读器
  if (isScreenReaderActive()) {
    document.body.classList.add('screen-reader-active');
    console.log('[A11y] Screen reader detected');
  }

  // 检测用户偏好
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    document.body.classList.add('reduced-motion');
    console.log('[A11y] Reduced motion preference detected');
  }

  const prefersHighContrast = window.matchMedia('(prefers-contrast: high)').matches;
  if (prefersHighContrast) {
    document.body.classList.add('high-contrast');
    console.log('[A11y] High contrast preference detected');
  }

  console.log('[A11y] ✅ Accessibility features initialized');
}

console.log('[AccessibilityOptimization] ✅ Accessibility utilities loaded');