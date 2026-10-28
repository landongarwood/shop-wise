/**
 * Turning stored values into something readable.
 *
 * The server speaks in minor units (cents) and ISO instants; the screen speaks
 * in the shop's currency and in words like "Today". This is the only place that
 * converts between the two.
 */

export function createFormat(settings) {
  const currency = settings?.currency || '$';

  const amounts = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const quantities = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 3,
  });
  const dayMonth = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
  const dayMonthYear = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const timeOnly = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

  const money = (minor) => {
    const value = Number(minor ?? 0);
    return `${value < 0 ? '-' : ''}${currency}${amounts.format(Math.abs(value) / 100)}`;
  };

  /** The plain decimal an input field should start with: "12.50", no symbol. */
  const moneyInput = (minor) => (Number(minor ?? 0) / 100).toFixed(2);

  const quantity = (value) => quantities.format(Number(value ?? 0));

  const quantityWithUnit = (value, unit) => `${quantity(value)}${unit ? ` ${unit}` : ''}`;

  const day = (iso) => {
    const date = new Date(iso);
    return isThisYear(date) ? dayMonth.format(date) : dayMonthYear.format(date);
  };

  /** "Today", "Yesterday", then the date. What a shopkeeper actually wants. */
  const relativeDay = (iso) => {
    const date = new Date(iso);
    const days = daysBetween(startOfDay(new Date()), startOfDay(date));

    if (days === 0) return 'Today';
    if (days === -1) return 'Yesterday';
    return day(iso);
  };

  const dayAndTime = (iso) => `${relativeDay(iso)}, ${timeOnly.format(new Date(iso))}`;

  /** Value for an <input type="date">, in the browser's local day. */
  const dateInput = (iso) => {
    const date = iso ? new Date(iso) : new Date();
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };

  /** How a balance should read, and which colour it belongs in. */
  const balance = (minor) => {
    if (minor > 0) return { text: `owes ${money(minor)}`, amount: money(minor), tone: 'debt' };
    if (minor < 0) return { text: `${money(-minor)} in credit`, amount: money(-minor), tone: 'paid' };
    return { text: 'settled up', amount: money(0), tone: 'quiet' };
  };

  return { currency, money, moneyInput, quantity, quantityWithUnit, day, relativeDay, dayAndTime, dateInput, balance };
}

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const daysBetween = (from, to) => Math.round((to - from) / 86400000);
const isThisYear = (date) => date.getFullYear() === new Date().getFullYear();
