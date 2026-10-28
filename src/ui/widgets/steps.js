import { el, div, append, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';

/**
 * A task broken into numbered panels.
 *
 * The screens a shopkeeper meets first are used by people who do not use
 * computers much, and a page of controls with no stated order is where they
 * stop. Numbering says what to do; outlining the current step says what to do
 * *now*; ticking a finished one says what is already dealt with. All three are
 * visible without reading a word.
 *
 * A step is only ever in one of three states:
 *   waiting — not its turn yet
 *   active  — the thing to do now
 *   done    — answered, and shown ticked
 *
 * A step can be pulled out into a sticky side column. That is for the one that
 * shows what has been built up so far — a running sale — which is worth having
 * in view while the earlier steps are still being worked through, rather than
 * off the bottom of a long product list.
 *
 * @param {Array<{key: string, title: string, hint?: string}>} definitions
 * @param {{aside?: string[]}} [options] keys to place in the side column
 */
export function createSteps(definitions, { aside = [] } = {}) {
  const entries = new Map();

  const nodes = definitions.map((definition, index) => {
    const number = index + 1;

    const mark = div({ class: 'step__number' });
    const hint = div({ class: 'step__hint', text: definition.hint ?? '' });
    const body = div({ class: 'step__body' });

    const node = div({ class: 'step' }, [
      div({ class: 'step__head' }, [
        mark,
        div({ class: 'grow' }, [div({ class: 'step__title', text: definition.title }), hint]),
      ]),
      body,
    ]);

    entries.set(definition.key, { number, node, mark, hint, body });
    return node;
  });

  const inAside = (index) => aside.includes(definitions[index].key);
  const main = nodes.filter((_, index) => !inAside(index));
  const side = nodes.filter((_, index) => inAside(index));

  /**
   * @param {string} key
   * @param {'waiting'|'active'|'done'} state
   * @param {string} [hintText] replaces the step's hint, for saying why
   */
  const set = (key, state, hintText) => {
    const entry = entries.get(key);
    if (!entry) throw new Error(`Unknown step: ${key}`);

    entry.node.classList.toggle('step--active', state === 'active');
    entry.node.classList.toggle('step--done', state === 'done');

    clear(entry.mark);
    append(entry.mark, state === 'done' ? icon('check', { size: 16, strokeWidth: 3 }) : String(entry.number));

    if (hintText !== undefined) entry.hint.textContent = hintText;
  };

  for (const key of entries.keys()) set(key, 'waiting');

  const node = side.length
    ? div({ class: 'steps steps--split' }, [
        div({ class: 'steps__main' }, main),
        el('aside', { class: 'steps__aside' }, side),
      ])
    : div({ class: 'steps' }, nodes);

  return {
    node,
    /** Where a step's content goes. */
    body: (key) => entries.get(key).body,
    set,
    count: definitions.length,
  };
}
