import { div, button, input, label, span, append, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toastOk } from '../core/toast.js';
import { productList } from '../widgets/pickers.js';
import { openNewProductSheet } from '../widgets/forms.js';
import { emptyState } from '../widgets/states.js';
import { createSteps } from '../widgets/steps.js';

/**
 * Taking in a delivery — several products at once.
 *
 * A delivery arrives as a van full of things, not as one product twelve times,
 * so this is built around the whole list: tap each product that came, set the
 * amounts together, save once. Tapping a product adds it straight to the
 * delivery with its quantity editable in place — no sheet per item, which is
 * the friction that made the one-at-a-time route painful.
 *
 * Tapping the same product again adds one more of it rather than listing it
 * twice, which is what someone counting a crate actually wants.
 *
 * Nothing is written until the button in step three, and the server takes the
 * whole delivery in one write: it is recorded or refused, never half-entered.
 */
export async function stockIn(ctx) {
  const { api, format, back, reload } = ctx;

  const products = await api.get('/stock');

  const addNewProduct = async () => {
    const created = await openNewProductSheet({ api });
    if (created) {
      toastOk(`${created.name} added`);
      await reload();
    }
  };

  if (!products.length) {
    return {
      title: 'Add stock',
      body: emptyState({
        title: 'No products yet',
        message: 'Add what you sell first — you can enter how much arrived at the same time.',
        actionLabel: 'Add a product',
        onAction: addNewProduct,
      }),
    };
  }

  /** productId -> quantity arriving. */
  const delivery = new Map();

  const steps = createSteps([
    { key: 'what', title: 'What arrived?', hint: 'Tap each product in the delivery' },
    { key: 'amounts', title: 'How many of each?', hint: 'Nothing added yet' },
    { key: 'save', title: 'Check and save', hint: 'Nothing to save yet' },
  ]);

  const amountsSlot = steps.body('amounts');
  const note = input({ class: 'input', type: 'text', placeholder: 'e.g. supplier or invoice number' });
  const when = input({ class: 'input', type: 'date', value: format.dateInput(), ariaLabel: 'Date it arrived' });
  const problem = div({ class: 'field__hint', style: { color: 'var(--debt)' } });

  const saveButton = button({ class: 'button button--primary button--block button--confirm' });

  const totals = () => {
    let items = 0;
    for (const quantity of delivery.values()) items += quantity;
    return { products: delivery.size, items: Number(items.toFixed(3)) };
  };

  const refreshSteps = () => {
    const { products: count, items } = totals();

    steps.set('what', count ? 'done' : 'active', count ? `${count} ${count === 1 ? 'product' : 'products'} picked` : 'Tap each product in the delivery');

    steps.set(
      'amounts',
      count ? 'active' : 'waiting',
      count ? `${format.quantity(items)} items in total` : 'Nothing added yet'
    );

    steps.set('save', count ? 'active' : 'waiting', count ? 'Check it over, then save' : 'Nothing to save yet');

    clear(saveButton);
    append(saveButton, [
      icon('check', { size: 20 }),
      count
        ? `Save delivery — ${count} ${count === 1 ? 'product' : 'products'}`
        : 'Add some products first',
    ]);
    saveButton.disabled = count === 0;
  };

  /* ---------- step 2: the delivery ---------- */

  const setQuantity = (productId, quantity) => {
    if (quantity > 0) delivery.set(productId, Number(quantity.toFixed(3)));
    else delivery.delete(productId);
    drawDelivery();
  };

  function drawDelivery() {
    clear(amountsSlot);
    refreshSteps();

    if (!delivery.size) {
      append(
        amountsSlot,
        div({ class: 'step__empty' }, [
          div({ text: 'Nothing added yet.' }),
          div({ class: 'faint', text: 'Tap products in step 1 and they will appear here.' }),
        ])
      );
      return;
    }

    const rows = [...delivery].map(([productId, quantity]) => {
      const product = products.find((candidate) => candidate.id === productId);

      const field = input({
        class: 'delivery__qty tnum',
        type: 'text',
        inputMode: 'decimal',
        value: String(quantity),
        ariaLabel: `Quantity of ${product.name}`,
        onchange: () => {
          const typed = Number(field.value.replace(',', '.'));
          setQuantity(productId, Number.isFinite(typed) ? typed : 0);
        },
      });

      return div({ class: 'delivery' }, [
        div({ class: 'grow' }, [
          div({ class: 'row__title', text: product.name }),
          div({
            class: 'row__sub tnum',
            text: `${format.quantity(product.onHand)} → ${format.quantity(product.onHand + quantity)} ${product.unit ?? ''}`.trim(),
          }),
        ]),
        div({ class: 'delivery__count' }, [
          button(
            { class: 'delivery__step', ariaLabel: `One less ${product.name}`, onclick: () => setQuantity(productId, quantity - 1) },
            icon('minus', { size: 18 })
          ),
          field,
          button(
            { class: 'delivery__step', ariaLabel: `One more ${product.name}`, onclick: () => setQuantity(productId, quantity + 1) },
            icon('plus', { size: 18 })
          ),
        ]),
        button(
          { class: 'icon-button', ariaLabel: `Remove ${product.name}`, onclick: () => setQuantity(productId, 0) },
          icon('trash', { size: 18 })
        ),
      ]);
    });

    append(amountsSlot, rows);
  }

  /* ---------- step 1: picking ---------- */

  const picker = productList({
    products,
    format,
    // Tapping again adds one more rather than listing the product twice.
    onPick: (product) => setQuantity(product.id, (delivery.get(product.id) ?? 0) + 1),
    onNew: addNewProduct,
  });

  /* ---------- step 3: saving ---------- */

  saveButton.addEventListener('click', async () => {
    problem.textContent = '';
    if (!delivery.size) return;

    saveButton.disabled = true;
    try {
      const { products: count, items } = totals();

      await api.post('/stock/batch', {
        lines: [...delivery].map(([productId, quantity]) => ({ productId, quantity })),
        note: note.value.trim(),
        at: when.value,
      });

      toastOk(`Delivery saved — ${format.quantity(items)} items across ${count} ${count === 1 ? 'product' : 'products'}`);
      await back();
    } catch (err) {
      saveButton.disabled = false;
      problem.textContent = err.message;
    }
  });

  /* ---------- assembly ---------- */

  append(steps.body('what'), picker.node);
  append(steps.body('save'), [
    label({ class: 'field' }, [span({ class: 'field__label', text: 'When did it arrive?' }), when]),
    label({ class: 'field' }, [span({ class: 'field__label', text: 'Note (optional)' }), note, problem]),
    saveButton,
  ]);

  drawDelivery();

  return {
    title: 'Add stock',
    subtitle: 'A delivery came in',
    body: steps.node,
  };
}
