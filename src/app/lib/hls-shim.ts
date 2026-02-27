/**
 * hls.js CDN shim — avoids bundling the 1.3MB hls.js ESM via Rollup.
 * Loads hls.js dynamically from CDN on first use (lazy — zero impact on initial page load).
 * If CDN unavailable, Hls.isSupported() returns false → hooks fall back to native HLS / MP4.
 * v6.0.67
 */

const CDN_URL = 'https://cdn.jsdelivr.net/npm/hls.js@1.6.15/dist/hls.light.min.js';

let _real: any = typeof window !== 'undefined' ? (window as any).Hls : null;
let _loading: Promise<any> | null = null;

/**
 * Preload hls.js from CDN. Returns the real Hls class or null.
 * Safe to call multiple times — deduplicates.
 */
export function preloadHls(): Promise<any> {
  if (_real) return Promise.resolve(_real);
  if (_loading) return _loading;
  if (typeof window === 'undefined') return Promise.resolve(null);

  _loading = new Promise<any>((resolve) => {
    const script = document.createElement('script');
    script.src = CDN_URL;
    script.onload = () => {
      _real = (window as any).Hls || null;
      resolve(_real);
    };
    script.onerror = () => {
      console.warn('[hls-shim] CDN load failed, falling back to native HLS/MP4');
      _loading = null;         // allow retry
      resolve(null);
    };
    document.head.appendChild(script);
  });
  return _loading;
}

/**
 * Proxy that delegates to the real Hls class if loaded, else returns safe stubs.
 * Static methods like Hls.isSupported() work synchronously after preloadHls() resolves.
 * Construction (new Hls({...})) also works once loaded.
 */
const HlsProxy = new Proxy(function () {} as any, {
  get(_target, prop: string | symbol) {
    if (typeof prop === 'symbol') return undefined;
    // Allow checking load state
    if (prop === '__loaded') return !!_real;
    if (prop === '__preload') return preloadHls;
    // Delegate to real class if loaded
    if (_real) return _real[prop];
    // Safe stubs before CDN finishes
    if (prop === 'isSupported') return () => false;
    if (prop === 'Events') return {};
    if (prop === 'ErrorTypes') return {};
    // Introspection safety (React Refresh calls .toString())
    if (prop === 'toString') return () => 'function Hls() { [CDN shim] }';
    if (prop === 'valueOf') return () => HlsProxy;
    if (prop === 'prototype') return {};
    return undefined;
  },

  construct(_target, args) {
    if (_real) return new _real(...args);
    throw new Error('HLS.js not loaded yet — call preloadHls() first');
  },
});

export default HlsProxy;