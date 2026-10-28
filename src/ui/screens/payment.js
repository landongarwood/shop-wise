import { div, button, input, label, span, append, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toastOk } from '../core/toast.js';
import { openCustomerPicker } from '../widgets/pickers.js';

/**
 * Recording money received.
 *
 * Customers here settle up whenever they like, in whatever amount they like, so
 * this screen asks only three things: who paid, how much, and when. It is never
 * tied to a particular sale, because the shop does not work that way — the
 * payment simply reduces what that customer owes.
 *
 * Paying more than the balance is allowed and becomes credit, which is what
 * happens in practice when someone rounds up or pays in advance.
 */
export async function payment(ctx) {
  const { api, format, back, params } = ctx;

  let customer = params.customer ?? null;

  const customerSlot = div({ class: 'section' });
  const owedSlot = div({ class: 'section' });

  const amount = input({
    class: 'input input--amount tnum',
    type: 'text',
    inputMode: 'decimal',
    placeholder: '0.00',
    ariaLabel: 'Amount paid',
  });

  const when = input({
    class: 'input',
    type: 'date',
    value: format.dateInput(),
    ariaLabel: 'Date paid',
  });

  const note = input({ class: 'input', type: 'text', placeholder: 'e.g. cash, bank transfer' });

  const problem = div({ class: 'field__hint', style: { color: 'var(--debt)' } });

  const saveButton = button({ class: 'button button--primary button--block button--confirm' }, [
    icon('check', { size: 20 }),
    'Save payment',
  ]);

  /* ---------- customer ---------- */

  const chooseCustomer = async () => {
    const chosen = await openCustomerPicker({ api, format, title: 'Who paid?' });
    if (chosen) {
      customer = chosen;
      drawCustomer();
    }
  };

  function drawCustomer() {
    clear(customerSlot);
    clear(owedSlot);

    if (!customer) {
      append(
        customerSlot,
        button({ class: 'button button--primary button--block button--confirm', onclick: chooseCustomer }, [
          icon('people', { size: 20 }),
          'Choose customer',
        ])
      );
      saveButton.disabled = true;
      return;
    }

    saveButton.disabled = false;

    const position = format.balance(customer.balance ?? 0);

    append(
      customerSlot,
      div({ class: 'rows' }, [
        div({ class: 'row row--static' }, [
          div({ class: 'row__main' }, [
            div({ class: 'row__title', text: customer.name }),
            div({ class: 'row__sub', text: position.text }),
          ]),
          button({ class: 'button button--quiet', text: 'Change', onclick: chooseCustomer }),
        ]),
      ])
    );

    // The amount they owe is overwhelmingly the amount they are paying, so it
    // is one tap away rather than something to read off and retype.
    if ((customer.balance ?? 0) > 0) {
      append(
        owedSlot,
        div({ class: 'chips' }, [
          button({
            class: 'chip',
            text: `Pay all — ${format.money(customer.balance)}`,
            onclick: () => {
              amount.value = format.moneyInput(customer.balance);
              amount.focus();
            },
          }),
          button({
            class: 'chip',
            text: `Half — ${format.money(Math.round(customer.balance / 2))}`,
            onclick: () => {
              amount.value = format.moneyInput(Math.round(customer.balance / 2));
              amount.focus();
            },
          }),
        ])
      );
    }
  }

  /* ---------- saving ---------- */

  saveButton.addEventListener('click', async () => {
    problem.textContent = '';

    if (!customer) return chooseCustomer();

    const text = amount.value.trim();
    if (!text || !(Number(text.replace(',', '.')) > 0)) {
      problem.textContent = 'Enter how much they paid, like 20.00';
      amount.focus();
      return undefined;
    }

    saveButton.disabled = true;
    try {
      await api.post('/payments', {
        customerId: customer.id,
        amount: text.replace(',', '.'),
        at: when.value,
        note: note.value.trim(),
      });

      const paid = Math.round(Number(text.replace(',', '.')) * 100);
      const left = (customer.balance ?? 0) - paid;

      toastOk(
        left > 0
          ? `${format.money(paid)} from ${customer.name} — ${format.money(left)} still owed`
          : left < 0
            ? `${format.money(paid)} from ${customer.name} — ${format.money(-left)} in credit`
            : `${format.money(paid)} from ${customer.name} — settled up`
      );

      return back();
    } catch (err) {
      saveButton.disabled = false;
      problem.textContent = err.message;
      return undefined;
    }
  });

  drawCustomer();

  const body = div({}, [
    customerSlot,
    owedSlot,
    label({ class: 'field' }, [span({ class: 'field__label', text: 'How much did they pay?' }), amount, problem]),
    label({ class: 'field' }, [span({ class: 'field__label', text: 'When?' }), when]),
    label({ class: 'field' }, [span({ class: 'field__label', text: 'Note (optional)' }), note]),
    saveButton,
  ]);

  return {
    title: 'Take payment',
    subtitle: customer ? customer.name : 'Who paid you?',
    body,
  };
}
