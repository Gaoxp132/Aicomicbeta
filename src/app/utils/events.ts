/**
 * Simple global event bus for cross-component communication (no Context needed)
 * v6.0.96: quota exceeded events
 */

export interface QuotaExceededInfo {
  usedToday: number;
  freeLimit: number;
  paidCredits: number;
}

type QuotaExceededCallback = (info: QuotaExceededInfo) => void;

const quotaCallbacks: Set<QuotaExceededCallback> = new Set();

/** Register a listener — returns a cleanup function */
export function onQuotaExceeded(cb: QuotaExceededCallback): () => void {
  quotaCallbacks.add(cb);
  return () => quotaCallbacks.delete(cb);
}

/** Emit the quota-exceeded event to all registered listeners */
export function emitQuotaExceeded(info: QuotaExceededInfo): void {
  for (const cb of quotaCallbacks) {
    try { cb(info); } catch { /* ignore listener errors */ }
  }
}
