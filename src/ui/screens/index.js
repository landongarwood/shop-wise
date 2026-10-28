import { home } from './home.js';
import { sell } from './sell.js';
import { payment } from './payment.js';
import { customers } from './customers.js';
import { customer } from './customer.js';
import { stock } from './stock.js';
import { reports } from './reports.js';
import { settings } from './settings.js';

/**
 * The screen map the navigator works from.
 *
 * Two actions — sell and take payment — and the screens they look things up
 * on. Taking in stock lives on the stock screen itself, beside the figure it
 * changes. Adding a screen means adding a module and one line here.
 */
export const routes = {
  home,
  sell,
  payment,
  customers,
  customer,
  stock,
  reports,
  settings,
};
