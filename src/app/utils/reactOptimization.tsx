/**
 * React组件性能优化工具
 * 
 * 功能：
 * - 智能memo包装
 * - useCallback/useMemo辅助函数
 * - 懒加载组件
 * - 虚拟滚动
 * - 性能监控组件
 */

import React, { ComponentType, LazyExoticComponent, Suspense, memo, useCallback, useMemo, useRef, useEffect } from 'react';

// ==================== 智能Memo ====================

/**
 * 智能memo - 自动优化组件渲染
 */
export function smartMemo<P extends object>(
  Component: ComponentType<P>,
  propsAreEqual?: (prevProps: Readonly<P>, nextProps: Readonly<P>) => boolean
): React.MemoExoticComponent<ComponentType<P>> {
  return memo(Component, propsAreEqual);
}

/**
 * 深度比较props
 */
export function deepCompareProps<P extends object>(
  prevProps: Readonly<P>,
  nextProps: Readonly<P>
): boolean {
  return JSON.stringify(prevProps) === JSON.stringify(nextProps);
}

/**
 * 浅比较props（推荐）
 */
export function shallowCompareProps<P extends object>(
  prevProps: Readonly<P>,
  nextProps: Readonly<P>
): boolean {
  const prevKeys = Object.keys(prevProps) as Array<keyof P>;
  const nextKeys = Object.keys(nextProps) as Array<keyof P>;

  if (prevKeys.length !== nextKeys.length) {
    return false;
  }

  for (const key of prevKeys) {
    if (prevProps[key] !== nextProps[key]) {
      return false;
    }
  }

  return true;
}

// ==================== 懒加载组件 ====================

interface LazyLoadOptions {
  fallback?: React.ReactNode;
  delay?: number;
  retryCount?: number;
}

/**
 * 创建懒加载组件
 */
export function createLazyComponent<T extends ComponentType<any>>(
  importFunc: () => Promise<{ default: T }>,
  options: LazyLoadOptions = {}
): LazyExoticComponent<T> {
  const { fallback = <div>Loading...</div>, delay = 0, retryCount = 3 } = options;

  let retries = 0;

  const loadWithRetry = async (): Promise<{ default: T }> => {
    try {
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      return await importFunc();
    } catch (error) {
      if (retries < retryCount) {
        retries++;
        console.warn(`[LazyLoad] Retry ${retries}/${retryCount} for component`);
        await new Promise((resolve) => setTimeout(resolve, 1000 * retries));
        return loadWithRetry();
      }
      throw error;
    }
  };

  return React.lazy(loadWithRetry);
}

/**
 * 懒加载组件包装器
 */
export function LazyLoadWrapper({
  component: Component,
  fallback = <div>Loading...</div>,
  ...props
}: {
  component: LazyExoticComponent<any>;
  fallback?: React.ReactNode;
  [key: string]: any;
}) {
  return (
    <Suspense fallback={fallback}>
      <Component {...props} />
    </Suspense>
  );
}

// ==================== useCallback辅助 ====================

/**
 * 稳定的回调函数 - 永远不会改变引用
 */
export function useStableCallback<T extends (...args: any[]) => any>(callback: T): T {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  });

  return useCallback(((...args) => callbackRef.current(...args)) as T, []);
}

/**
 * 批量useCallback
 */
export function useCallbacks<T extends Record<string, (...args: any[]) => any>>(
  callbacks: T,
  deps: React.DependencyList = []
): T {
  return useMemo(() => {
    const memoizedCallbacks = {} as T;
    for (const key in callbacks) {
      memoizedCallbacks[key] = callbacks[key];
    }
    return memoizedCallbacks;
  }, deps);
}

// ==================== useMemo辅助 ====================

/**
 * 深度memo - 基于深度比较的useMemo
 */
export function useDeepMemo<T>(factory: () => T, deps: React.DependencyList): T {
  const ref = useRef<{ deps: React.DependencyList; value: T }>();

  if (!ref.current || JSON.stringify(ref.current.deps) !== JSON.stringify(deps)) {
    ref.current = {
      deps,
      value: factory(),
    };
  }

  return ref.current.value;
}

/**
 * 条件memo - 只有条件满足时才重新计算
 */
export function useConditionalMemo<T>(
  factory: () => T,
  condition: boolean,
  deps: React.DependencyList
): T {
  const ref = useRef<T>();

  return useMemo(() => {
    if (condition) {
      ref.current = factory();
    }
    return ref.current!;
  }, [condition, ...deps]);
}

// ==================== 虚拟滚动 ====================

interface VirtualScrollOptions {
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
}

/**
 * 虚拟滚动Hook
 */
export function useVirtualScroll<T>(
  items: T[],
  options: VirtualScrollOptions
) {
  const { itemHeight, containerHeight, overscan = 3 } = options;
  const [scrollTop, setScrollTop] = React.useState(0);

  const visibleRange = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      items.length - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    );

    return {
      startIndex,
      endIndex,
      offsetY: startIndex * itemHeight,
    };
  }, [scrollTop, itemHeight, containerHeight, items.length, overscan]);

  const visibleItems = useMemo(() => {
    return items.slice(visibleRange.startIndex, visibleRange.endIndex + 1);
  }, [items, visibleRange.startIndex, visibleRange.endIndex]);

  const totalHeight = items.length * itemHeight;

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  return {
    visibleItems,
    totalHeight,
    offsetY: visibleRange.offsetY,
    handleScroll,
  };
}

// ==================== 图片懒加载 ====================

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  placeholder?: string;
  threshold?: number;
  rootMargin?: string;
}

/**
 * 懒加载图片组件
 */
export const LazyImage = memo(function LazyImage({
  src,
  placeholder = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"%3E%3Crect fill="%23f3f4f6" width="400" height="300"/%3E%3C/svg%3E',
  threshold = 0.01,
  rootMargin = '50px',
  alt = '',
  ...props
}: LazyImageProps) {
  const [imageSrc, setImageSrc] = React.useState(placeholder);
  const [isLoaded, setIsLoaded] = React.useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!imgRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setImageSrc(src);
            observer.disconnect();
          }
        });
      },
      {
        threshold,
        rootMargin,
      }
    );

    observer.observe(imgRef.current);

    return () => {
      observer.disconnect();
    };
  }, [src, threshold, rootMargin]);

  return (
    <img
      ref={imgRef}
      src={imageSrc}
      alt={alt}
      onLoad={() => setIsLoaded(true)}
      style={{
        opacity: isLoaded ? 1 : 0.5,
        transition: 'opacity 0.3s ease-in-out',
      }}
      {...props}
    />
  );
});

// ==================== 性能监控组件 ====================

interface PerformanceMonitorProps {
  componentName: string;
  children: React.ReactNode;
  logRenders?: boolean;
  logProps?: boolean;
}

/**
 * 性能监控组件 - 追踪渲染次数和时间
 */
export function PerformanceMonitor({
  componentName,
  children,
  logRenders = false,
  logProps = false,
}: PerformanceMonitorProps) {
  const renderCount = useRef(0);
  const renderTime = useRef<number>(0);

  useEffect(() => {
    renderCount.current += 1;
    const endTime = performance.now();
    const duration = endTime - renderTime.current;

    if (logRenders) {
      console.log(`[PerfMonitor] ${componentName} rendered ${renderCount.current} times`);
      console.log(`[PerfMonitor] ${componentName} render duration: ${duration.toFixed(2)}ms`);
    }
  });

  renderTime.current = performance.now();

  return <>{children}</>;
}

// ==================== 防抖Hook ====================

/**
 * 防抖值Hook
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * 防抖回调Hook
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<NodeJS.Timeout>();
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    ((...args) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    }) as T,
    [delay]
  );
}

// ==================== 节流Hook ====================

/**
 * 节流回调Hook
 */
export function useThrottledCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const lastRun = useRef(Date.now());
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    ((...args) => {
      const now = Date.now();

      if (now - lastRun.current >= delay) {
        callbackRef.current(...args);
        lastRun.current = now;
      }
    }) as T,
    [delay]
  );
}

// ==================== 窗口尺寸Hook ====================

/**
 * 窗口尺寸Hook - 带防抖
 */
export function useWindowSize(debounceDelay = 150) {
  const [size, setSize] = React.useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setSize({
          width: window.innerWidth,
          height: window.innerHeight,
        });
      }, debounceDelay);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
    };
  }, [debounceDelay]);

  return size;
}

// ==================== 元素可见性Hook ====================

/**
 * 元素可见性Hook
 */
export function useIntersectionObserver(
  ref: React.RefObject<Element>,
  options: IntersectionObserverInit = {}
): boolean {
  const [isIntersecting, setIsIntersecting] = React.useState(false);

  useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
    }, options);

    observer.observe(ref.current);

    return () => {
      observer.disconnect();
    };
  }, [ref, options.threshold, options.root, options.rootMargin]);

  return isIntersecting;
}

// ==================== 前一个值Hook ====================

/**
 * 前一个值Hook - 用于比较
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}

// ==================== 批量更新Hook ====================

/**
 * 批量更新Hook - 减少setState调用
 */
export function useBatchedState<T extends Record<string, any>>(
  initialState: T
): [T, (updates: Partial<T>) => void] {
  const [state, setState] = React.useState<T>(initialState);

  const updateState = useCallback((updates: Partial<T>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  return [state, updateState];
}

// ==================== 导出工具类型 ====================

export type MemoComponent<P> = React.MemoExoticComponent<ComponentType<P>>;
export type LazyComponent<P> = LazyExoticComponent<ComponentType<P>>;

console.log('[ReactOptimization] ✅ React optimization utilities initialized');
