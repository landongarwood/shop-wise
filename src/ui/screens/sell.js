import { div, button, append, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toastOk, toastWarn } from '../core/toast.js';
import { openCustomerPicker, productGrid } from '../widgets/pickers.js';
import { openNewProductSheet, openSaleLineSheet } from '../widgets/forms.js';
import { emptyState } from '../widgets/states.js';

/**
 * Recording a sale.
 *
 * Who, then what, then save — in that order, on one screen, with the running
 * total always visible. Nothing is written until the one big button at the
 * bottom is pressed, so a half-finished sale can be abandoned by going back.
 *
 * Each product tap asks the only two questions that vary: how many, and at what
 * price today. The price is pre-filled with the usual one, which is the answer
 * most of the time.
 */
export async function sell(ctx) {
  const { api, format, back, params, setSubtitle } = ctx;

  const products = await api.get('/stock');

  let customer = params.customer ?? null;
  const lines = [];

  const customerSlot = div({ class: 'section' });
  const cartSlot = div({ class: 'cart' });

  /* ---------- customer ---------- */

  const chooseCustomer = async () => {
    const chosen = await openCustomerPicker({ api, format });
    if (chosen) {
      customer = chosen;
      drawCustomer();
      drawCart();
    }
  };

  function drawCustomer() {
    clear(customerSlot);
    setSubtitle(customer ? customer.name : 'Choose a customer, then tap products');

    if (!customer) {
      append(
        customerSlot,
        button({ class: 'button button--primary button--block button--confirm', onclick: chooseCustomer }, [
          icon('people', { size: 20 }),
          'Choose customer',
        ])
      );
      return;
    }

    const position = format.balance(customer.balance ?? 0);

    append(
      customerSlot,
      div({ class: 'rows' }, [
        div({ class: 'row row--static' }, [
          div({ class: 'row__main' }, [
            div({ class: 'row__title', text: customer.name }),
            div({ class: 'row__sub', text: `Before this sale: ${position.text}` }),
          ]),
          button({ class: 'button button--quiet', text: 'Change', onclick: chooseCustomer }),
        ]),
      ])
    );
  }

  /* ---------- lines ---------- */

  const addLine = async (product) => {
    const result = await openSaleLineSheet({
      product,
      format,
      onHand: product.onHand,
    });
    if (!result) return;

    lines.push({
      productId: product.id,
      name: product.name,
      unit: product.unit,
      quantity: result.quantity,
      unitPrice: result.unitPrice,
    });
    drawCart();
  };

  const editLine = async (index) => {
    const line = lines[index];
    const product = products.find((candidate) => candidate.id === line.productId) ?? {
      id: line.productId,
      name: line.name,
      unit: line.unit,
      price: line.unitPrice,
    };

    const result = await openSaleLineSheet({ product, format, initial: line, onHand: product.onHand });
    if (!result) return;

    lines[index] = { ...line, quantity: result.quantity, unitPrice: result.unitPrice };
    drawCart();
  };

  const removeLine = (index) => {
    lines.splice(index, 1);
    drawCart();
  };

  const total = () => lines.reduce((sum, line) => sum + Math.round(line.unitPrice * line.quantity), 0);

  function drawCart() {
    clear(cartSlot);

    if (!lines.length) {
      append(
        cartSlot,
        div({ class: 'faint', style: { textAlign: 'center' }, text: 'Tap a product above to start the sale.' })
      );
      return;
    }

    const rows = div(
      { class: 'rows', style: { marginBottom: 'var(--space-3)' } },
      lines.map((line, index) =>
        div({ class: 'row row--static' }, [
          button({ class: 'row__main', style: { border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left' }, onclick: () => editLine(index) }, [
            div({ class: 'row__title', text: line.name }),
            div({
              class: 'row__sub tnum',
              text: `${format.quantity(line.quantity)} ${line.unit ?? ''} × ${format.money(line.unitPrice)}`.replace(
                '  ',
                ' '
              ),
            }),
          ]),
          div({ class: 'row__end' }, div({ class: 'row__amount tnum', text: format.money(Math.round(line.unitPrice * line.quantity)) })),
          button({ class: 'icon-button', ariaLabel: `Remove ${line.name}`, onclick: () => removeLine(index) }, icon('trash', { size: 18 })),
        ])
      )
    );

    const saveButton = button(
      {
        class: 'button button--primary button--block button--confirm',
        disabled: !customer,
        onclick: () => save(saveButton),
      },
      [icon('check', { size: 20 }), customer ? `Save sale — ${format.money(total())}` : 'Choose a customer first']
    );

    append(cartSlot, [
      rows,
      div({ class: 'cart__total' }, [
        div({ class: 'cart__total-label', text: 'Total' }),
        div({ class: 'cart__total-value tnum', text: format.money(total()) }),
      ]),
      saveButton,
    ]);
  }

  /* ---------- saving ---------- */

  async function save(saveButton) {
    if (!customer || !lines.length) return;

    saveButton.disabled = true;
    try {
      const { warnings } = await api.post('/sales', {
        customerId: customer.id,
        items: lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          // Sent as a decimal string: the server parses money from its text
          // form so no rounding happens in transit.
          unitPrice: format.moneyInput(line.unitPrice),
        })),
      });

      toastOk(`Sale saved — ${format.money(total())}`);
      for (const warning of warnings) toastWarn(warning.message);

      await back();
    } catch (err) {
      saveButton.disabled = false;
      throw err;
    }
  }

  /* ---------- assembly ---------- */

  if (!products.length) {
    return {
      title: 'New sale',
      body: emptyState({
        title: 'No products yet',
        message: 'Add what you sell, then you can record sales.',
        actionLabel: 'Add a product',
        onAction: async () => {
          if (await openNewProductSheet({ api })) ctx.reload();
        },
      }),
    };
  }

  drawCustomer();
  drawCart();

  const body = div({}, [
    customerSlot,
    div({ class: 'section' }, [
      div({ class: 'section__head' }, div({ class: 'section__title', text: 'What did they take?' })),
      productGrid({
        products,
        format,
        onPick: addLine,
        onNew: async () => {
          if (await openNewProductSheet({ api })) ctx.reload();
        },
      }),
    ]),
    cartSlot,
  ]);

  return {
    title: 'New sale',
    subtitle: customer ? customer.name : 'Choose a customer, then tap products',
    body,
  };
}
