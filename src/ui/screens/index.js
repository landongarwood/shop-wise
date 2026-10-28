import { home } from './home.js';
import { sell } from './sell.js';
import { stockIn } from './stock-in.js';
import { payment } from './payment.js';
import { customers } from './customers.js';
import { customer } from './customer.js';
import { stock } from './stock.js';
import { reports } from './reports.js';
import { settings } from './settings.js';

/**
 * The screen map the navigator works from.
 *
 * Three actions — sell, take in a delivery, take payment — and the screens
 * they look things up on. A single top-up still lives on the stock table,
 * beside the figure it changes; this is for a whole delivery at once. Adding a
 * screen means adding a module and one line here.
 */
export const routes = {
  home,
  sell,
  'stock-in': stockIn,
  payment,
  customers,
  customer,
  stock,
  reports,
  settings,
};
