/**
 * 无障碍React组件
 * 
 * 提供常用的无障碍组件
 */

import React from 'react';

// ==================== 组件定义 ====================

/**
 * 跳转到主内容链接
 * 用于键盘用户快速跳过导航
 */
export function SkipToContent({ targetId }: { targetId: string }) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded"
    >
      跳转到主内容
    </a>
  );
}

/**
 * 屏幕阅读器专用文本
 * 内容对屏幕阅读器可见，但在视觉上隐藏
 */
export function ScreenReaderOnly({ children }: { children: React.ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

/**
 * 视觉隐藏元素
 * 与ScreenReaderOnly类似，但使用div标签
 */
export function VisuallyHidden({ children, as: Component = 'div' }: { 
  children: React.ReactNode;
  as?: React.ElementType;
}) {
  return <Component className="sr-only">{children}</Component>;
}

/**
 * ARIA实时区域
 * 用于动态内容更新的公告
 */
export function LiveRegion({ 
  children, 
  politeness = 'polite',
  atomic = true,
}: { 
  children: React.ReactNode;
  politeness?: 'polite' | 'assertive' | 'off';
  atomic?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live={politeness}
      aria-atomic={atomic}
      className="sr-only"
    >
      {children}
    </div>
  );
}

/**
 * 可访问的按钮
 * 带有完整的ARIA属性
 */
export function AccessibleButton({
  children,
  onClick,
  disabled = false,
  ariaLabel,
  ariaDescribedBy,
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      className={className}
    >
      {children}
    </button>
  );
}

console.log('[A11yComponents] ✅ Accessibility components loaded');
