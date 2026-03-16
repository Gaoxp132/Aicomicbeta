/**
 * Consolidated hooks - Group B: Media/Series (v6.0.67)
 * Re-export barrel — split into usePlayback.ts and useSeriesMedia.ts for maintainability.
 * All original imports from './media' or '../hooks/media' continue to work.
 */

export { useHlsPlayer } from './usePlayback';
export type { PlaylistVideo, Playlist } from './usePlayback';
export { usePlaylistLoader, usePlaylistPlayback } from './usePlayback';
export { useSeries, useTaskRecovery, useVideoGeneration } from './useSeriesMedia';
