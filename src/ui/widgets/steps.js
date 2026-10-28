import { div, append, clear } from '../core/dom.js';
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
 * @param {Array<{key: string, title: string, hint?: string}>} definitions
 */
export function createSteps(definitions) {
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

  return {
    node: div({ class: 'steps' }, nodes),
    /** Where a step's content goes. */
    body: (key) => entries.get(key).body,
    set,
    count: definitions.length,
  };
}
