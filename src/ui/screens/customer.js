import { div, button, span } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { confirmSheet, openSheet } from '../core/sheet.js';
import { toastOk } from '../core/toast.js';
import { field } from '../widgets/forms.js';
import { stat } from '../widgets/states.js';

/**
 * One customer's account.
 *
 * The balance is the headline, in words as well as figures, because "owes
 * $42.50" is understood instantly while a bare signed number is not. Below it,
 * sales and payments share one timeline with the balance as it stood after each
 * event, which is how someone checks a disputed total: read down until the two
 * of you disagree.
 */
export async function customer(ctx) {
  const { api, format, go, reload } = ctx;

  const statement = await api.get(`/customers/${ctx.params.id}/statement`);
  const person = statement.customer;
  const position = format.balance(statement.balance);

  const headline = div({ class: 'summary' }, [
    div({}, [
      div({
        class: 'stat__label',
        text: statement.balance === 0 ? 'Account' : statement.balance > 0 ? 'Owes you' : 'Paid ahead',
      }),
      div({
        class: `big-number tnum ${statement.balance > 0 ? 'money--debt' : statement.balance < 0 ? 'money--paid' : ''}`,
        text: position.amount,
      }),
      div({
        class: 'stat__hint',
        text:
          statement.balance === 0
            ? 'nothing outstanding'
            : `over ${statement.countedEntryCount} ${statement.countedEntryCount === 1 ? 'entry' : 'entries'}`,
      }),
    ]),
    stat({ label: 'Bought in total', value: format.money(statement.charged) }),
    stat({
      label: 'Paid in total',
      value: format.money(statement.paid),
      tone: statement.paid > 0 ? 'paid' : null,
    }),
  ]);

  const quickActions = div({ class: 'tiles' }, [
    button({ class: 'tile tile--primary', onclick: () => go('sell', { customer: withBalance(person, statement) }) }, [
      div({ class: 'tile__icon' }, icon('sell', { size: 24 })),
      div({ class: 'tile__label', text: 'New sale' }),
      div({ class: 'tile__hint', text: `Sell to ${person.name}` }),
    ]),
    button({ class: 'tile', onclick: () => go('payment', { customer: withBalance(person, statement) }) }, [
      div({ class: 'tile__icon' }, icon('money', { size: 24 })),
      div({ class: 'tile__label', text: 'Take payment' }),
      div({ class: 'tile__hint', text: statement.balance > 0 ? `Owes ${format.money(statement.balance)}` : 'Record money received' }),
    ]),
  ]);

  const history = div({ class: 'section' }, [
    div({ class: 'section__head' }, [
      div({ class: 'section__title', text: 'History' }),
      statement.entryCount > statement.entries.length
        ? div({ class: 'faint', text: `showing the latest ${statement.entries.length} of ${statement.entryCount}` })
        : null,
    ]),
    statement.entries.length
      ? div({ class: 'timeline' }, statement.entries.map((entry) => eventRow(entry, ctx, person)))
      : div({ class: 'card soft', text: 'Nothing recorded for this customer yet.' }),
  ]);

  return {
    title: person.name,
    subtitle: position.text,
    actions: [{ label: 'Edit customer', icon: 'edit', onClick: () => editCustomer({ api, person, reload }) }],
    body: div({}, [headline, quickActions, history]),
  };
}

/**
 * One line of the account.
 *
 * A deleted line stays here, crossed out and counting for nothing, because
 * "where did that payment go?" is a question the shopkeeper should be able to
 * answer from this screen. The same row offers to put it back.
 */
function eventRow(entry, { api, format, reload }, person) {
  const isSale = entry.kind === 'sale';
  const deleted = Boolean(entry.deletedAt);

  const description = isSale
    ? entry.items.map((item) => `${format.quantity(item.quantity)} × ${item.productName}`).join(', ')
    : entry.note || 'Payment received';

  const remove = async () => {
    const confirmed = await confirmSheet({
      title: isSale ? 'Delete this sale?' : 'Delete this payment?',
      message:
        (isSale
          ? `${format.money(entry.amount)} will be removed from ${person.name}'s account and the stock put back.`
          : `${format.money(entry.amount)} will be removed, so ${person.name} will owe that much again.`) +
        ' It stays on this history, crossed out, and you can put it back.',
    });
    if (!confirmed) return;

    await api.delete(isSale ? `/sales/${entry.id}` : `/payments/${entry.id}`);
    toastOk(isSale ? 'Sale deleted' : 'Payment deleted');
    await reload();
  };

  const restore = async () => {
    await api.post(isSale ? `/sales/${entry.id}/restore` : `/payments/${entry.id}/restore`, {});
    toastOk(isSale ? 'Sale put back' : 'Payment put back');
    await reload();
  };

  return div({ class: `event event--${entry.kind}${deleted ? ' event--deleted' : ''}` }, [
    div({ class: 'event__mark', text: isSale ? '+' : '−' }),
    div({ class: 'event__main' }, [
      div({ class: 'event__title' }, [
        isSale ? 'Sale' : 'Payment',
        deleted ? span({ class: 'tag--deleted', text: 'Deleted' }) : null,
      ]),
      div({ class: 'event__sub', text: `${format.dayAndTime(entry.at)} · ${description}` }),
    ]),
    div({ class: 'event__amount' }, [
      div({ class: `tnum ${isSale ? 'money--debt' : 'money--paid'}`, text: format.money(entry.amount) }),
      div({ class: 'faint tnum', text: `balance ${format.money(entry.balanceAfter)}` }),
    ]),
    deleted
      ? button({ class: 'icon-button', title: 'Put this back', ariaLabel: 'Put this back', onclick: restore }, icon('undo', { size: 18 }))
      : button({ class: 'icon-button', ariaLabel: 'Delete', onclick: remove }, icon('trash', { size: 18 })),
  ]);
}

async function editCustomer({ api, person, reload }) {
  const name = field({ labelText: 'Customer name', value: person.name });

  const saved = await openSheet({
    title: 'Edit customer',
    body: name.node,
    confirmLabel: 'Save changes',
    onConfirm: async () => {
      name.showProblem(null);
      if (!name.value) {
        name.showProblem('Give the customer a name.');
        return false;
      }
      try {
        return await api.patch(`/customers/${person.id}`, { name: name.value });
      } catch (err) {
        name.showProblem(err.message);
        return false;
      }
    },
  });

  if (saved) {
    toastOk('Customer updated');
    await reload();
  }
}

/** The sell and payment screens want the balance alongside the customer. */
const withBalance = (person, statement) => ({ ...person, balance: statement.balance });

