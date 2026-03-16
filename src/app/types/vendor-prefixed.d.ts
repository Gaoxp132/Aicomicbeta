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

interface Window {
  /** hls.js CDN global — loaded dynamically by hls-shim.ts */
  Hls?: any;
}