import { div, button, append, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toastOk, toastWarn } from '../core/toast.js';
import { openCustomerPicker, productList } from '../widgets/pickers.js';
import { openNewProductSheet, openSaleLineSheet } from '../widgets/forms.js';
import { emptyState } from '../widgets/states.js';
import { createSteps } from '../widgets/steps.js';

/**
 * Recording a sale, as three numbered steps.
 *
 * Who, then what, then check and save. The numbering is not decoration: this
 * screen is used by people who do not use computers much, and a page of
 * controls with no stated order is where they stop. Each step is a panel of its
 * own, the one to do next is outlined, and a finished one is ticked — so the
 * answer to "what now?" is always visible without reading anything.
 *
 * Nothing is written until the button in step three, so a half-finished sale is
 * abandoned by going back. Each product tap asks only the two things that vary:
 * how many, and at what price today, pre-filled with the usual price.
 */
export async function sell(ctx) {
  const { api, format, back, params, setSubtitle } = ctx;

  const products = await api.get('/stock');

  let customer = params.customer ?? null;
  const lines = [];

  const steps = createSteps(
    [
      { key: 'who', title: 'Who is buying?', hint: 'Pick who is buying' },
      { key: 'what', title: 'What are they taking?', hint: 'Tap each product' },
      { key: 'save', title: 'Check and save', hint: 'Nothing to save yet' },
    ],
    // The running sale stays in view beside the product list rather than
    // sitting below it, where a long catalogue would push it off the screen.
    { aside: ['save'] }
  );

  const customerSlot = steps.body('who');
  const cartSlot = steps.body('save');
  let picker = null;

  const refreshSteps = () => {
    steps.set('who', customer ? 'done' : 'active', customer ? `${customer.name} is buying` : 'Pick who is buying');

    steps.set(
      'what',
      !customer ? 'waiting' : lines.length ? 'done' : 'active',
      lines.length
        ? `${lines.length} ${lines.length === 1 ? 'item' : 'items'} added`
        : 'Tap each product they are taking'
    );

    steps.set(
      'save',
      customer && lines.length ? 'active' : 'waiting',
      customer && lines.length ? 'Check it over, then save' : 'Nothing to save yet'
    );
  };

  /* ---------- step 1: who ---------- */

  const chooseCustomer = async () => {
    const chosen = await openCustomerPicker({ api, format });
    if (!chosen) return;

    customer = chosen;
    drawCustomer();
    drawCart();
    // The next thing to do is find a product, so put the cursor there.
    picker?.focusSearch();
  };

  function drawCustomer() {
    clear(customerSlot);
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
          div({ class: 'chosen__note', text: `Before this sale: ${position.text}` }),
        ]),
        button({ class: 'button', text: 'Change', onclick: chooseCustomer }),
      ])
    );
    refreshSteps();
  }

  /* ---------- step 2: what ---------- */

  const addLine = async (product) => {
    const result = await openSaleLineSheet({ product, format, onHand: product.onHand });
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

  /* ---------- step 3: check and save ---------- */

  const total = () => lines.reduce((sum, line) => sum + Math.round(line.unitPrice * line.quantity), 0);

  function drawCart() {
    clear(cartSlot);
    refreshSteps();

    if (!lines.length) {
      append(
        cartSlot,
        div({ class: 'step__empty' }, [
          div({ text: 'Nothing added yet.' }),
          div({ class: 'faint', text: 'Pick products in step 2 and they will appear here.' }),
        ])
      );
      return;
    }

    const rows = div(
      { class: 'rows' },
      lines.map((line, index) =>
        div({ class: 'row row--static' }, [
          button({ class: 'line-edit', onclick: () => editLine(index) }, [
            div({ class: 'row__title', text: line.name }),
            div({
              class: 'row__sub tnum',
              text: `${format.quantity(line.quantity)} ${line.unit ?? ''} × ${format.money(line.unitPrice)}`.replace(
                '  ',
                ' '
              ),
            }),
          ]),
          div(
            { class: 'row__end' },
            div({ class: 'row__amount tnum', text: format.money(Math.round(line.unitPrice * line.quantity)) })
          ),
          button({ class: 'icon-button', ariaLabel: `Remove ${line.name}`, onclick: () => removeLine(index) },
            icon('trash', { size: 18 })
          ),
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

  /*
   * Something with no stock recorded cannot be sold: the figures would say the
   * shop holds less than nothing, and the mistake only surfaces as a warning
   * after the sale is already saved.
   *
   * Tapping it says so and nothing else. This used to open the take-in-stock
   * sheet, on the reasoning that restocking is the way forward — but someone
   * halfway through a sale who taps a product and is handed a different job
   * has lost the thread, and may well take stock in without meaning to.
   * Taking in a delivery is its own screen; this one sells.
   */
  const sayItIsEmpty = (product) => {
    toastWarn(`${product.name} is out of stock. Add stock first, then sell it.`);
  };

  picker = productList({
    products,
    format,
    onPick: addLine,
    unavailable: (product) => product.onHand <= 0,
    onUnavailable: sayItIsEmpty,
    onNew: async () => {
      if (await openNewProductSheet({ api })) ctx.reload();
    },
  });

  append(steps.body('what'), picker.node);

  drawCustomer();
  drawCart();

  return {
    title: 'New sale',
    subtitle: customer ? customer.name : 'Step 1 of 3',
    body: steps.node,
  };
}
