import { div, append } from './dom.js';
import { icon } from './icons.js';

/**
 * Notifications: top right, solid colour, one line of plain language.
 *
 * Green means saved, amber means worth noticing, red means it did not work.
 * The colour has to carry the meaning before any of the words are read, since
 * these appear over whatever the user is looking at and then leave.
 *
 * Nothing important is communicated only here: a notification confirms what the
 * user just did rather than telling them something they would otherwise miss.
 * Warnings and errors stay up far longer, and any of them can be dismissed by
 * clicking it.
 */

const ICONS = { ok: 'check', warn: 'alert', error: 'alert' };
const DURATIONS = { ok: 3200, warn: 8000, error: 10000 };
const MAX_VISIBLE = 4;

export function showToast(message, { kind = 'ok', duration } = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return () => {};

  const node = div({ class: `toast toast--${kind}`, role: kind === 'ok' ? 'status' : 'alert' });
  append(node, [
    div({ class: 'toast__icon' }, icon(ICONS[kind] ?? 'check', { size: 15, strokeWidth: 2.6 })),
    div({ class: 'toast__message', text: message }),
  ]);

  let removed = false;
  const dismiss = () => {
    if (removed) return;
    removed = true;
    node.classList.add('toast--leaving');
    node.addEventListener('animationend', () => node.remove(), { once: true });
    // Belt and braces: if the animation never fires, still clean up.
    setTimeout(() => node.remove(), 400);
  };

  node.addEventListener('click', dismiss);
  root.append(node);

  // A burst of warnings should not fill the window; keep the newest few.
  while (root.children.length > MAX_VISIBLE) root.firstChild.remove();

  setTimeout(dismiss, duration ?? DURATIONS[kind] ?? 3200);
  return dismiss;
}

export const toastOk = (message) => showToast(message, { kind: 'ok' });
export const toastWarn = (message) => showToast(message, { kind: 'warn' });
export const toastError = (message) => showToast(message, { kind: 'error' });
