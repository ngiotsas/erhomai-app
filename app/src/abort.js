// Combines a caller's AbortController signal with a timeout.
//
// AbortSignal.any / AbortSignal.timeout require Chrome 116+, Safari 17.4+,
// Firefox 124+. Older engines (e.g. long-unupdated Android WebViews inside
// the TWA) fall back to a manual AbortController so requests still time out
// instead of hanging.
export function signalWithTimeout(outerSignal, timeoutMs) {
  if (typeof AbortSignal.any === 'function' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.any([outerSignal, AbortSignal.timeout(timeoutMs)]);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  outerSignal.addEventListener('abort', () => {
    clearTimeout(timer);
    controller.abort();
  }, { once: true });
  return controller.signal;
}
