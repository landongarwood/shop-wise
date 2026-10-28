import { div, label, input, button, span } from '../core/dom.js';
import { openSheet } from '../core/sheet.js';
import { createStepper } from './stepper.js';

/**
 * The small forms that appear in a sheet: adding a product, adding a customer,
 * putting a line on a sale, taking in stock.
 *
 * Every one of them asks the fewest questions that make the action meaningful,
 * shows the resulting figure while it is being typed, and reports a problem
 * next to the field rather than by closing and complaining.
 */

const UNIT_SUGGESTIONS = ['pcs', 'kg', 'g', 'L', 'ml', 'box', 'bag', 'pack'];

/** Text/decimal field with a label and a place to put an error. */
function field({ labelText, hint = null, ...attributes }) {
  const control = input({ class: 'input', type: 'text', ...attributes });
  const problem = div({ class: 'field__hint', style: { color: 'var(--debt)' } });

  const node = label({ class: 'field' }, [
    span({ class: 'field__label', text: labelText }),
    control,
    hint ? div({ class: 'field__hint', text: hint }) : null,
    problem,
  ]);

  return {
    node,
    control,
    get value() {
      return control.value.trim();
    },
    showProblem(message) {
      problem.textContent = message ?? '';
    },
  };
}

/** Chips that fill in a field, for values that are nearly always one of a few. */
function suggestions(values, onPick) {
  return div(
    { class: 'chips', style: { marginTop: 'var(--space-2)' } },
    values.map((value) => button({ class: 'chip', text: value, onclick: () => onPick(value) }))
  );
}

/* ------------------------------------------------------------------ */

export async function openNewProductSheet({ api }) {
  const name = field({ labelText: 'Product name', placeholder: 'e.g. Coffee beans', autocomplete: 'off' });
  const unit = field({ labelText: 'Sold by', value: 'pcs', hint: 'pieces, kilos, litres — whatever you count in' });
  const price = field({ labelText: 'Usual price', inputMode: 'decimal', placeholder: '0.00' });
  const opening = createStepper({ value: 0, step: 1, min: 0 });

  const body = div({}, [
    name.node,
    unit.node,
    suggestions(UNIT_SUGGESTIONS, (value) => {
      unit.control.value = value;
    }),
    div({ style: { height: 'var(--space-4)' } }),
    price.node,
    label({ class: 'field' }, [
      span({ class: 'field__label', text: 'How many do you have now?' }),
      opening.node,
      div({ class: 'field__hint', text: 'Leave at 0 if you want to add stock later.' }),
    ]),
  ]);

  return openSheet({
    title: 'New product',
    body,
    confirmLabel: 'Add product',
    onConfirm: async () => {
      name.showProblem(null);
      price.showProblem(null);

      if (!name.value) {
        name.showProblem('Give the product a name.');
        return false;
      }

      try {
        const product = await api.post('/products', {
          name: name.value,
          unit: unit.value || 'pcs',
          price: price.value || '0',
        });

        // Opening stock is part of adding the product: a shopkeeper adding
        // "20 kg of coffee" means both things at once.
        if (opening.value > 0) {
          await api.post('/stock', { productId: product.id, quantity: opening.value, note: 'Opening stock' });
        }
        return product;
      } catch (err) {
        (err.status === 409 ? name : price).showProblem(err.message);
        return false;
      }
    },
  });
}

export async function openNewCustomerSheet({ api }) {
  const name = field({ labelText: 'Customer name', placeholder: 'e.g. Alice', autocomplete: 'off' });

  return openSheet({
    title: 'New customer',
    body: name.node,
    confirmLabel: 'Add customer',
    onConfirm: async () => {
      name.showProblem(null);
      if (!name.value) {
        name.showProblem('Give the customer a name.');
        return false;
      }

      try {
        return await api.post('/customers', { name: name.value });
      } catch (err) {
        name.showProblem(err.message);
        return false;
      }
    },
  });
}

/**
 * One line of a sale: how many, and at what price this time.
 *
 * The price starts at the product's usual price because that is what it usually
 * is, and stays editable because the whole point is that it varies.
 */
export async function openSaleLineSheet({ product, format, initial = null, onHand = null }) {
  // Not more than is on the shelf. Stock that the books have not caught up
  // with is taken in on the stock screen, where it leaves a record, rather
  // than conjured by a sale that makes the figures impossible.
  const limit = typeof onHand === 'number' ? onHand : Infinity;
  const quantity = createStepper({ value: Math.min(initial?.quantity ?? 1, limit), step: 1, min: 0, max: limit });
  const price = field({
    labelText: `Price per ${product.unit || 'item'}`,
    inputMode: 'decimal',
    value: format.moneyInput(initial?.unitPrice ?? product.price),
    hint: `Usually ${format.money(product.price)}`,
  });

  const total = div({ class: 'cart__total' }, [
    div({ class: 'cart__total-label', text: 'Line total' }),
    div({ class: 'cart__total-value tnum', text: format.money(0) }),
  ]);
  const totalValue = total.lastChild;

  const recalculate = () => {
    const minor = Math.round(Number(price.value.replace(',', '.')) * 100);
    const amount = Number.isFinite(minor) ? Math.round(minor * quantity.value) : 0;
    totalValue.textContent = format.money(amount);
  };

  quantity.field.addEventListener('input', recalculate);
  price.control.addEventListener('input', recalculate);

  const body = div({}, [
    div({ class: 'section' }, [
      div({ class: 'field__label', text: `How many ${product.unit || 'items'}?` }),
      quantity.node,
      onHand === null
        ? null
        : div({ class: 'field__hint', text: `${format.quantity(onHand)} ${product.unit ?? ''} in stock`.trim() }),
    ]),
    price.node,
    total,
  ]);

  recalculate();

  return openSheet({
    title: product.name,
    body,
    confirmLabel: initial ? 'Update line' : 'Add to sale',
    onConfirm: () => {
      price.showProblem(null);

      if (!(quantity.value > 0)) return false;

      if (quantity.value > limit) {
        price.showProblem(
          `Only ${format.quantity(limit)} ${product.unit ?? ''} in stock. Take in more on the stock screen first.`.replace(
            '  ',
            ' '
          )
        );
        return false;
      }

      const minor = Math.round(Number(price.value.replace(',', '.')) * 100);
      if (!Number.isFinite(minor) || minor < 0) {
        price.showProblem('Enter a price like 12.50.');
        return false;
      }

      return { quantity: quantity.value, unitPrice: minor };
    },
  });
}

/** Taking in a delivery. */
export async function openAddStockSheet({ api, product, format, onHand = 0 }) {
  const quantity = createStepper({ value: 1, step: 1, min: 0 });
  const note = field({ labelText: 'Note (optional)', placeholder: 'e.g. from the wholesaler' });

  const after = div({ class: 'field__hint' });
  const describeAfter = () => {
    after.textContent = `In stock now: ${format.quantity(onHand)} → ${format.quantity(onHand + quantity.value)} ${
      product.unit || ''
    }`.trim();
  };
  quantity.field.addEventListener('input', describeAfter);

  const body = div({}, [
    div({ class: 'section' }, [
      div({ class: 'field__label', text: `How many ${product.unit || 'items'} are you adding?` }),
      quantity.node,
      after,
    ]),
    note.node,
  ]);

  describeAfter();

  return openSheet({
    title: `Add stock — ${product.name}`,
    body,
    confirmLabel: 'Add to stock',
    onConfirm: async () => {
      note.showProblem(null);
      if (!(quantity.value > 0)) return false;

      try {
        return await api.post('/stock', {
          productId: product.id,
          quantity: quantity.value,
          note: note.value,
        });
      } catch (err) {
        note.showProblem(err.message);
        return false;
      }
    },
  });
}

/** Changing a product's name, unit or usual price. */
export async function openEditProductSheet({ api, product, format }) {
  const name = field({ labelText: 'Product name', value: product.name });
  const unit = field({ labelText: 'Sold by', value: product.unit ?? 'pcs' });
  const price = field({
    labelText: 'Usual price',
    inputMode: 'decimal',
    value: format.moneyInput(product.price),
    hint: 'Changing this does not change any sale already recorded.',
  });

  return openSheet({
    title: 'Edit product',
    body: div({}, [name.node, unit.node, price.node]),
    confirmLabel: 'Save changes',
    onConfirm: async () => {
      name.showProblem(null);
      if (!name.value) {
        name.showProblem('Give the product a name.');
        return false;
      }

      try {
        return await api.patch(`/products/${product.id}`, {
          name: name.value,
          unit: unit.value || 'pcs',
          price: price.value || '0',
        });
      } catch (err) {
        name.showProblem(err.message);
        return false;
      }
    },
  });
}

export { field };
