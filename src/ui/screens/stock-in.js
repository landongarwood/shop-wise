import { div } from '../core/dom.js';
import { toastOk } from '../core/toast.js';
import { productList } from '../widgets/pickers.js';
import { openAddStockSheet, openNewProductSheet } from '../widgets/forms.js';
import { emptyState } from '../widgets/states.js';

/**
 * Taking in a delivery.
 *
 * One tap per product, and the screen stays put afterwards so a whole delivery
 * can be entered one line at a time without going back and forth. Each entry
 * saves immediately, which means a long delivery cannot be lost half way
 * through.
 */
export async function stockIn(ctx) {
  const { api, format, reload } = ctx;

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
        message: 'Add what you sell first — you can enter how much you have at the same time.',
        actionLabel: 'Add a product',
        onAction: addNewProduct,
      }),
    };
  }

  const addStock = async (product) => {
    const entry = await openAddStockSheet({ api, product, format, onHand: product.onHand });
    if (!entry) return;

    toastOk(`${format.quantity(entry.quantity)} ${product.unit ?? ''} of ${product.name} added`.replace('  ', ' '));
    await reload();
  };

  const body = div({}, [
    div({ class: 'section' }, div({ class: 'faint', text: 'Find a product and say how much came in.' })),
    productList({ products, format, onPick: addStock, onNew: addNewProduct }).node,
  ]);

  return {
    title: 'Add stock',
    subtitle: 'A delivery came in',
    actions: [{ label: 'New product', icon: 'plus', onClick: addNewProduct }],
    body,
  };
}

