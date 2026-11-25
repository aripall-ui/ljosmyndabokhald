// In-page messages (the browser's alert/confirm are not used: they are blocked in some views)
let toasts = [];
const listeners = new Set();
export function notify(text, tone = 'info') {
  const t = { id: Date.now() + Math.random(), text, tone };
  toasts = [...toasts, t];
  listeners.forEach((f) => f(toasts));
  setTimeout(() => { toasts = toasts.filter((x) => x !== t); listeners.forEach((f) => f(toasts)); }, tone === 'error' ? 7000 : 4000);
}
export function onToasts(f) { listeners.add(f); return () => listeners.delete(f); }
export const getToasts = () => toasts;
