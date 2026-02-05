/**
 * 自定义Hooks统一导出
 */

export { useComments } from './useComments';
export { useFullscreen } from './useFullscreen';
export { useLike } from './useLike';
export { useVideoPlayer } from './useVideoPlayer';
export { useAuth } from './useAuth';
export { useVideoGeneration } from './useVideoGeneration';
export { useCommunityWorks } from './useCommunityWorks';
export { useCommunityInteractions } from './useCommunityInteractions';
export type { WorkInteractions } from './useCommunityWorks';

// ==================== 优化的状态管理Hooks ====================
export {
  usePersistentState,
  useStateWithHistory,
  useAsyncState,
  useAsyncAction,
  useMergedState,
  useSafeState,
  useBatchState,
  useToggle,
  useCounter,
  type PersistentStateOptions,
  type HistoryOptions,
  type AsyncState,
  type AsyncStateActions,
} from './useOptimizedState';