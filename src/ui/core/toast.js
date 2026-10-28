import { div, append } from './dom.js';
import { icon } from './icons.js';

/**
 * Brief confirmation that something was saved, or a warning worth noticing.
 *
 * Nothing important is ever communicated only by a toast: it confirms what the
 * user just did rather than telling them something new.
 */

const ICONS = { ok: 'check', warn: 'alert', error: 'alert' };
const DURATIONS = { ok: 2600, warn: 6000, error: 7000 };

export function showToast(message, { kind = 'ok', duration } = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return () => {};

  const node = div({ class: `toast toast--${kind}` });
  append(node, [icon(ICONS[kind] ?? 'check', { size: 18 }), div({ class: 'grow', text: message })]);

  root.append(node);

  const remove = () => node.remove();
  setTimeout(remove, duration ?? DURATIONS[kind] ?? 3000);
  return remove;
}

export const toastOk = (message) => showToast(message, { kind: 'ok' });
export const toastWarn = (message) => showToast(message, { kind: 'warn' });
export const toastError = (message) => showToast(message, { kind: 'error' });
