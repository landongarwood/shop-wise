import { div, button, input } from '../core/dom.js';
import { icon } from '../core/icons.js';

/**
 * A number with a big minus and a big plus either side.
 *
 * Typing works, but nobody has to: counting up a few units is the common case
 * and tapping is faster and harder to get wrong than selecting text and
 * retyping it.
 */
export function createStepper({ value = 1, step = 1, min = 0, max = 1e9, onChange = null } = {}) {
  const field = input({
    class: 'stepper__input tnum',
    type: 'text',
    inputMode: 'decimal',
    value: String(value),
    ariaLabel: 'Quantity',
  });

  const read = () => {
    const parsed = Number(field.value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const set = (next) => {
    const clamped = Math.min(max, Math.max(min, Number(next.toFixed(3))));
    field.value = String(clamped);
    onChange?.(clamped);
  };

  const nudge = (direction) => {
    set(read() + direction * step);
    field.focus();
    field.select();
  };

  field.addEventListener('change', () => set(read()));

  const node = div({ class: 'stepper' }, [
    button({ class: 'stepper__button', ariaLabel: 'Less', onclick: () => nudge(-1) }, icon('minus', { size: 24 })),
    field,
    button({ class: 'stepper__button', ariaLabel: 'More', onclick: () => nudge(1) }, icon('plus', { size: 24 })),
  ]);

  return {
    node,
    field,
    get value() {
      return read();
    },
    set value(next) {
      set(Number(next));
    },
  };
}
