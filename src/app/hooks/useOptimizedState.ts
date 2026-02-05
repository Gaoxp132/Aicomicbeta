/**
 * 优化的状态管理Hooks
 * 
 * 功能：
 * - 智能状态合并
 * - 状态持久化
 * - 状态历史记录
 * - 撤销/重做
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { setLocal, getLocal } from '@/app/utils';

// ==================== 持久化状态 ====================

export interface PersistentStateOptions<T> {
  key: string;
  defaultValue: T;
  serialize?: (value: T) => string;
  deserialize?: (value: string) => T;
  sync?: boolean; // 是否跨标签同步
}

/**
 * 持久化状态Hook
 */
export function usePersistentState<T>(
  options: PersistentStateOptions<T>
): [T, (value: T | ((prev: T) => T)) => void] {
  const {
    key,
    defaultValue,
    serialize = JSON.stringify,
    deserialize = JSON.parse,
    sync = false,
  } = options;

  // 从localStorage加载初始值
  const getInitialValue = (): T => {
    const stored = getLocal(key);
    if (stored !== null) {
      try {
        return deserialize(stored);
      } catch (error) {
        console.error(`[usePersistentState] Failed to parse stored value for ${key}:`, error);
      }
    }
    return defaultValue;
  };

  const [state, setState] = useState<T>(getInitialValue);

  // 保存到localStorage
  const setPersistentState = useCallback((value: T | ((prev: T) => T)) => {
    setState(prev => {
      const newValue = typeof value === 'function' ? (value as (prev: T) => T)(prev) : value;
      
      try {
        setLocal(key, serialize(newValue));
      } catch (error) {
        console.error(`[usePersistentState] Failed to save value for ${key}:`, error);
      }
      
      return newValue;
    });
  }, [key, serialize]);

  // 跨标签同步
  useEffect(() => {
    if (!sync) return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try {
          setState(deserialize(e.newValue));
        } catch (error) {
          console.error(`[usePersistentState] Failed to sync value for ${key}:`, error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key, deserialize, sync]);

  return [state, setPersistentState];
}

// ==================== 状态历史管理 ====================

export interface HistoryOptions {
  maxHistory?: number;
  debounce?: number;
}

/**
 * 带历史记录的状态Hook（支持撤销/重做）
 */
export function useStateWithHistory<T>(
  initialValue: T,
  options: HistoryOptions = {}
): {
  state: T;
  setState: (value: T | ((prev: T) => T)) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  history: T[];
  currentIndex: number;
  reset: () => void;
} {
  const { maxHistory = 50, debounce = 0 } = options;

  const [history, setHistory] = useState<T[]>([initialValue]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const state = history[currentIndex];

  const setState = useCallback((value: T | ((prev: T) => T)) => {
    // 清除之前的防抖定时器
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    const updateHistory = () => {
      setHistory(prev => {
        const current = prev[currentIndex];
        const newValue = typeof value === 'function' ? (value as (prev: T) => T)(current) : value;
        
        // 如果值没变，不更新历史
        if (JSON.stringify(newValue) === JSON.stringify(current)) {
          return prev;
        }

        // 删除当前索引之后的历史
        const newHistory = prev.slice(0, currentIndex + 1);
        
        // 添加新值
        newHistory.push(newValue);
        
        // 限制历史记录数量
        if (newHistory.length > maxHistory) {
          return newHistory.slice(-maxHistory);
        }
        
        return newHistory;
      });

      setCurrentIndex(prev => {
        const newIndex = prev + 1;
        return Math.min(newIndex, maxHistory - 1);
      });
    };

    // 如果有防抖，延迟更新
    if (debounce > 0) {
      debounceTimer.current = setTimeout(updateHistory, debounce);
    } else {
      updateHistory();
    }
  }, [currentIndex, maxHistory, debounce]);

  const undo = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      console.log('[StateHistory] ↶ Undo');
    }
  }, [currentIndex]);

  const redo = useCallback(() => {
    if (currentIndex < history.length - 1) {
      setCurrentIndex(prev => prev + 1);
      console.log('[StateHistory] ↷ Redo');
    }
  }, [currentIndex, history.length]);

  const reset = useCallback(() => {
    setHistory([initialValue]);
    setCurrentIndex(0);
    console.log('[StateHistory] 🔄 Reset');
  }, [initialValue]);

  return {
    state,
    setState,
    undo,
    redo,
    canUndo: currentIndex > 0,
    canRedo: currentIndex < history.length - 1,
    history,
    currentIndex,
    reset,
  };
}

// ==================== 异步状态管理 ====================

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export interface AsyncStateActions<T> {
  setData: (data: T) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: Error | null) => void;
  reset: () => void;
}

/**
 * 异步状态Hook
 */
export function useAsyncState<T>(
  initialData: T | null = null
): [AsyncState<T>, AsyncStateActions<T>] {
  const [data, setData] = useState<T | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const reset = useCallback(() => {
    setData(initialData);
    setLoading(false);
    setError(null);
  }, [initialData]);

  const state: AsyncState<T> = { data, loading, error };
  const actions: AsyncStateActions<T> = {
    setData,
    setLoading,
    setError,
    reset,
  };

  return [state, actions];
}

/**
 * 异步操作Hook（自动处理loading和error状态）
 */
export function useAsyncAction<T, Args extends any[]>(
  asyncFn: (...args: Args) => Promise<T>
): {
  execute: (...args: Args) => Promise<T | null>;
  data: T | null;
  loading: boolean;
  error: Error | null;
  reset: () => void;
} {
  const [state, actions] = useAsyncState<T>();

  const execute = useCallback(async (...args: Args): Promise<T | null> => {
    actions.setLoading(true);
    actions.setError(null);

    try {
      const result = await asyncFn(...args);
      actions.setData(result);
      actions.setLoading(false);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      actions.setError(error);
      actions.setLoading(false);
      return null;
    }
  }, [asyncFn, actions]);

  return {
    execute,
    data: state.data,
    loading: state.loading,
    error: state.error,
    reset: actions.reset,
  };
}

// ==================== 智能合并状态 ====================

/**
 * 深度合并状态Hook
 */
export function useMergedState<T extends Record<string, any>>(
  initialState: T
): [T, (partial: Partial<T>) => void, () => void] {
  const [state, setState] = useState<T>(initialState);

  const mergeState = useCallback((partial: Partial<T>) => {
    setState(prev => ({
      ...prev,
      ...partial,
    }));
  }, []);

  const resetState = useCallback(() => {
    setState(initialState);
  }, [initialState]);

  return [state, mergeState, resetState];
}

// ==================== 安全的状态更新 ====================

/**
 * 安全的状态更新Hook（组件卸载后不更新）
 */
export function useSafeState<T>(
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(initialValue);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setSafeState = useCallback((value: T | ((prev: T) => T)) => {
    if (mountedRef.current) {
      setState(value);
    }
  }, []);

  return [state, setSafeState];
}

// ==================== 批量状态更新 ====================

/**
 * 批量状态更新Hook（减少重渲染）
 */
export function useBatchState<T extends Record<string, any>>(
  initialState: T
): [T, (updates: Array<{ key: keyof T; value: any }>) => void] {
  const [state, setState] = useState<T>(initialState);

  const batchUpdate = useCallback((updates: Array<{ key: keyof T; value: any }>) => {
    setState(prev => {
      const newState = { ...prev };
      updates.forEach(({ key, value }) => {
        newState[key] = value;
      });
      return newState;
    });
  }, []);

  return [state, batchUpdate];
}

// ==================== Toggle状态 ====================

/**
 * Toggle状态Hook
 */
export function useToggle(
  initialValue: boolean = false
): [boolean, () => void, (value: boolean) => void] {
  const [value, setValue] = useState(initialValue);

  const toggle = useCallback(() => {
    setValue(v => !v);
  }, []);

  return [value, toggle, setValue];
}

// ==================== 计数器状态 ====================

/**
 * 计数器Hook
 */
export function useCounter(
  initialValue: number = 0,
  options: { min?: number; max?: number } = {}
): {
  count: number;
  increment: () => void;
  decrement: () => void;
  reset: () => void;
  set: (value: number) => void;
} {
  const [count, setCount] = useState(initialValue);

  const increment = useCallback(() => {
    setCount(prev => {
      const next = prev + 1;
      return options.max !== undefined ? Math.min(next, options.max) : next;
    });
  }, [options.max]);

  const decrement = useCallback(() => {
    setCount(prev => {
      const next = prev - 1;
      return options.min !== undefined ? Math.max(next, options.min) : next;
    });
  }, [options.min]);

  const reset = useCallback(() => {
    setCount(initialValue);
  }, [initialValue]);

  const set = useCallback((value: number) => {
    let newValue = value;
    if (options.min !== undefined) newValue = Math.max(newValue, options.min);
    if (options.max !== undefined) newValue = Math.min(newValue, options.max);
    setCount(newValue);
  }, [options.min, options.max]);

  return { count, increment, decrement, reset, set };
}

console.log('[useOptimizedState] ✅ Optimized state hooks loaded');
