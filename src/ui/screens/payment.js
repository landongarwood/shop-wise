import { div, button, input, label, span, append, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toastOk } from '../core/toast.js';
import { openCustomerPicker } from '../widgets/pickers.js';
import { createSteps } from '../widgets/steps.js';

/**
 * Recording money received, as three numbered steps.
 *
 * Who paid, how much, and when — in that order, each in its own panel, with the
 * step to do next outlined and the answered ones ticked. Same shape as the sell
 * screen, so there is one thing to learn rather than two.
 *
 * Customers here settle up whenever they like, in whatever amount they like. A
 * payment is never tied to a particular sale, because the shop does not work
 * that way: it simply reduces what that customer owes. Paying more than the
 * balance is allowed and becomes credit, which is what happens in practice when
 * someone rounds up or pays in advance.
 */
export async function payment(ctx) {
  const { api, format, back, params, setSubtitle } = ctx;

  let customer = params.customer ?? null;

  const steps = createSteps([
    { key: 'who', title: 'Who is paying?', hint: 'Pick who handed over the money' },
    { key: 'amount', title: 'How much?', hint: 'Enter the amount' },
    { key: 'save', title: 'When, and save', hint: 'Not ready yet' },
  ]);

  const customerSlot = steps.body('who');
  const owedSlot = div({});

  const amount = input({
    class: 'input input--amount tnum',
    type: 'text',
    inputMode: 'decimal',
    placeholder: '0.00',
    ariaLabel: 'Amount paid',
  });

  const when = input({ class: 'input', type: 'date', value: format.dateInput(), ariaLabel: 'Date paid' });
  const note = input({ class: 'input', type: 'text', placeholder: 'e.g. cash, bank transfer' });

  const problem = div({ class: 'field__hint', style: { color: 'var(--debt)' } });

  const saveButton = button({ class: 'button button--primary button--block button--confirm' }, [
    icon('check', { size: 20 }),
    'Save payment',
  ]);

  const typedAmount = () => Number(amount.value.trim().replace(',', '.'));
  const hasAmount = () => amount.value.trim() !== '' && typedAmount() > 0;

  const refreshSteps = () => {
    steps.set('who', customer ? 'done' : 'active', customer ? `${customer.name} is paying` : 'Pick who is paying');

    steps.set(
      'amount',
      !customer ? 'waiting' : hasAmount() ? 'done' : 'active',
      !customer
        ? 'Choose someone first'
        : hasAmount()
          ? `${format.money(Math.round(typedAmount() * 100))} received`
          : 'Enter how much they handed over'
    );

    steps.set(
      'save',
      customer && hasAmount() ? 'active' : 'waiting',
      customer && hasAmount() ? 'Check the date, then save' : 'Not ready yet'
    );

    saveButton.disabled = !customer;
  };

  amount.addEventListener('input', refreshSteps);

  /* ---------- step 1: who ---------- */

  const chooseCustomer = async () => {
    const chosen = await openCustomerPicker({ api, format, title: 'Who paid?' });
    if (!chosen) return;

    customer = chosen;
    drawCustomer();
    amount.focus();
  };

  function drawCustomer() {
    clear(customerSlot);
    clear(owedSlot);
    setSubtitle(customer ? customer.name : 'Step 1 of 3');

    if (!customer) {
      append(
        customerSlot,
        button({ class: 'button button--primary button--block button--confirm', onclick: chooseCustomer }, [
          icon('people', { size: 20 }),
          'Choose customer',
        ])
      );
      refreshSteps();
      return;
    }

    const position = format.balance(customer.balance ?? 0);

    append(
      customerSlot,
      div({ class: 'chosen' }, [
        div({ class: 'grow' }, [
          div({ class: 'chosen__name', text: customer.name }),
          div({ class: 'chosen__note', text: position.text }),
        ]),
        button({ class: 'button', text: 'Change', onclick: chooseCustomer }),
      ])
    );

    // What they owe is overwhelmingly what they are paying, so it is one tap
    // away rather than something to read off and retype.
    if ((customer.balance ?? 0) > 0) {
      const fill = (minor) => {
        amount.value = format.moneyInput(minor);
        amount.focus();
        refreshSteps();
      };

      append(
        owedSlot,
        div({ class: 'chips', style: { marginBottom: 'var(--space-3)' } }, [
          button({ class: 'chip', text: `Pay all — ${format.money(customer.balance)}`, onclick: () => fill(customer.balance) }),
          button({
            class: 'chip',
            text: `Half — ${format.money(Math.round(customer.balance / 2))}`,
            onclick: () => fill(Math.round(customer.balance / 2)),
          }),
        ])
      );
    }

    refreshSteps();
  }

  /* ---------- saving ---------- */

  saveButton.addEventListener('click', async () => {
    problem.textContent = '';

    if (!customer) return chooseCustomer();

    const text = amount.value.trim().replace(',', '.');
    if (!text || !(Number(text) > 0)) {
      problem.textContent = 'Enter how much they paid, like 20.00';
      amount.focus();
      return undefined;
    }

    saveButton.disabled = true;
    try {
      await api.post('/payments', {
        customerId: customer.id,
        amount: text,
        at: when.value,
        note: note.value.trim(),
      });

      const paid = Math.round(Number(text) * 100);
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

  /* ---------- assembly ---------- */

  append(steps.body('amount'), [
    owedSlot,
    label({ class: 'field' }, [span({ class: 'field__label', text: 'Amount received' }), amount, problem]),
  ]);

  append(steps.body('save'), [
    label({ class: 'field' }, [span({ class: 'field__label', text: 'When was it paid?' }), when]),
    label({ class: 'field' }, [span({ class: 'field__label', text: 'Note (optional)' }), note]),
    saveButton,
  ]);

  drawCustomer();

  return {
    title: 'Take payment',
    subtitle: customer ? customer.name : 'Step 1 of 3',
    body: steps.node,
  };
}
