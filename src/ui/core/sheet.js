import { div, button, append } from './dom.js';
import { icon } from './icons.js';

/**
 * A panel that slides up for exactly one decision: how many, what price, which
 * customer, are you sure.
 *
 * One at a time, always dismissible, and the primary action is always on the
 * right of the two buttons at the bottom. Keeping every small decision in the
 * same shape means there is only one interaction to learn.
 */
export function openSheet({
  title,
  body,
  confirmLabel = 'Save',
  cancelLabel = 'Cancel',
  danger = false,
  wide = false,
  hideConfirm = false,
  onConfirm = null,
}) {
  const root = document.getElementById('sheet-root');

  return new Promise((resolve) => {
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeyDown);
      backdrop.remove();
      resolve(value);
    };

    const confirm = button(
      {
        class: `button ${danger ? 'button--danger' : 'button--primary'}`,
        text: confirmLabel,
        onclick: async () => {
          if (!onConfirm) return finish(true);

          confirm.disabled = true;
          try {
            const result = await onConfirm();
            // A handler returning false means "stay open", e.g. invalid input.
            if (result === false) confirm.disabled = false;
            else finish(result === undefined ? true : result);
          } catch (err) {
            confirm.disabled = false;
            throw err;
          }
        },
      },
      []
    );

    // A body given as a function receives `finish`, so a sheet whose content is
    // itself the choice — picking a customer from a list — can close with the
    // chosen value instead of needing a confirm button.
    const content = typeof body === 'function' ? body(finish) : body;

    const sheet = div({ class: `sheet${wide ? ' sheet--wide' : ''}`, role: 'dialog', ariaModal: 'true' }, [
      div({ class: 'sheet__head' }, [
        div({ class: 'sheet__title', text: title }),
        button(
          { class: 'icon-button', ariaLabel: 'Close', onclick: () => finish(null) },
          icon('close', { size: 20 })
        ),
      ]),
      div({ class: 'sheet__body' }, content),
      // A sheet with nothing to confirm needs no footer: the X in the corner
      // already closes it, and a second Close button is one more thing to read.
      hideConfirm
        ? null
        : div({ class: 'sheet__foot' }, [
            button({ class: 'button', text: cancelLabel, onclick: () => finish(null) }),
            confirm,
          ]),
    ]);

    const backdrop = div({
      class: 'sheet-backdrop',
      onclick: (event) => {
        if (event.target === backdrop) finish(null);
      },
    });
    append(backdrop, sheet);

    const onKeyDown = (event) => {
      if (event.key === 'Escape') finish(null);
      if (event.key === 'Enter' && !hideConfirm && event.target.tagName !== 'TEXTAREA') {
        const inSheet = sheet.contains(event.target);
        if (inSheet && event.target.tagName !== 'BUTTON') confirm.click();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    root.append(backdrop);

    // Put the cursor where the work is: the first field, or the safe button.
    const focusTarget = sheet.querySelector('input, select, textarea') ?? sheet.querySelector('.sheet__foot .button');
    focusTarget?.focus();
    focusTarget?.select?.();
  });
}

/** A yes/no question, for anything that removes data. */
export function confirmSheet({ title, message, confirmLabel = 'Delete', danger = true }) {
  return openSheet({
    title,
    body: div({ class: 'soft', text: message }),
    confirmLabel,
    cancelLabel: 'Keep it',
    danger,
  });
}
