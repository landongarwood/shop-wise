import { div, button } from '../core/dom.js';
import { icon } from '../core/icons.js';

/**
 * What a screen shows when there is nothing yet.
 *
 * An empty screen is where a new user starts, so it carries the next step
 * rather than just reporting emptiness.
 */
export function emptyState({ title, message = '', actionLabel = null, actionIcon = 'plus', onAction = null }) {
  return div({ class: 'empty' }, [
    div({ class: 'empty__title', text: title }),
    message ? div({ text: message }) : null,
    actionLabel
      ? button({ class: 'button button--primary', onclick: onAction }, [icon(actionIcon, { size: 18 }), actionLabel])
      : null,
  ]);
}

/** A labelled figure, as used across the home and customer screens. */
export function stat({ label, value, hint = null, tone = null }) {
  return div({ class: `stat${tone ? ` stat--${tone}` : ''}` }, [
    div({ class: 'stat__label', text: label }),
    div({ class: 'stat__value tnum', text: value }),
    hint ? div({ class: 'stat__hint', text: hint }) : null,
  ]);
}

/** The small coloured pill used for balances and stock status. */
export function badge(text, tone = 'quiet') {
  return div({ class: `badge badge--${tone}`, text });
}
