/**
 * Vendor-prefixed browser API type declarations
 * Eliminates `as any` for fullscreen / orientation vendor prefixes in useInfra.ts
 */

interface HTMLElement {
  mozRequestFullScreen?: () => Promise<void>;
  webkitRequestFullscreen?: () => Promise<void>;
  msRequestFullscreen?: () => Promise<void>;
}

interface Document {
  mozCancelFullScreen?: () => Promise<void>;
  webkitExitFullscreen?: () => Promise<void>;
  msExitFullscreen?: () => Promise<void>;
  fullscreenEnabled?: boolean;
  webkitFullscreenEnabled?: boolean;
  mozFullScreenEnabled?: boolean;
  msFullscreenEnabled?: boolean;
}

interface ScreenOrientation {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
}

/** Minimal hls.js class shape — covers usage in hls-shim.ts and viewer hooks */
interface HlsInstance {
  loadSource(src: string): void;
  attachMedia(media: HTMLMediaElement): void;
  destroy(): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
  readonly levels: Array<{ height?: number; width?: number; bitrate?: number }>;
  currentLevel: number;
  startLevel: number;
}

interface HlsConstructor {
  new (config?: Record<string, unknown>): HlsInstance;
  isSupported(): boolean;
  Events: Record<string, string>;
  ErrorTypes: Record<string, string>;
  /** Allow access to additional static properties from CDN build */
  [key: string]: unknown;
}

interface Window {
  /** hls.js CDN global — loaded dynamically by hls-shim.ts */
  Hls?: HlsConstructor;
}