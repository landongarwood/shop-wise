'use strict';

/**
 * End-to-end check: drives the real UI in headless Edge over the DevTools
 * protocol, clicking through a sale, a payment, the customer history and the
 * sales report, then verifying the books server-side afterwards.
 *
 * Run with `npm run test:e2e`. It is kept out of `npm test` because it needs a
 * browser and takes a few seconds; the unit tests stay instant.
 *
 * No test framework and no driver library: Node's built-in WebSocket plus
 * Runtime.evaluate is enough to click a button and read the screen.
 */

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const dataDir = path.join(os.tmpdir(), `shopwise-e2e-${Date.now()}`);
process.argv.push(`--data-dir=${dataDir}`, '--no-window');

const { createContainer } = require('../../src/container');
const { findBrowser } = require('../../src/platform/window');

const DEBUG_PORT = Number(process.env.SHOPWISE_E2E_PORT ?? 9333);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const silentLogger = { info() {}, warn() {}, error() {} };

/* ------------------------------------------------------------------ */
/* A minimal DevTools-protocol page handle                             */
/* ------------------------------------------------------------------ */

class Page {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.pageErrors = [];

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);

      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
        return;
      }

      if (message.method === 'Runtime.exceptionThrown') {
        this.pageErrors.push(message.params.exceptionDetails.exception?.description ?? 'exception');
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        this.pageErrors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '));
      }
    });
  }

  static async attach(webSocketUrl) {
    const socket = new WebSocket(webSocketUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });

    const page = new Page(socket);
    await page.send('Runtime.enable');
    return page;
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? 'evaluate failed');
    }
    return result.result.value;
  }

  /** Re-injected after every navigation, since each render replaces the DOM. */
  async installHelpers() {
    await this.evaluate(`
      window.__find = (selector, text) =>
        [...document.querySelectorAll(selector)].find((node) => node.textContent.includes(text)) ?? null;

      window.__click = (selector, text) => {
        const node = text ? window.__find(selector, text) : document.querySelector(selector);
        if (!node) throw new Error('not found: ' + selector + (text ? ' containing "' + text + '"' : ''));
        node.click();
        return true;
      };

      window.__fill = (selector, value) => {
        const node = document.querySelector(selector);
        if (!node) throw new Error('not found: ' + selector);
        node.value = value;
        node.dispatchEvent(new Event('input', { bubbles: true }));
        return node.value;
      };

      window.__text = () => document.body.innerText.replace(/\\s+/g, ' ').trim();
      window.__sheetOpen = () => Boolean(document.querySelector('.sheet-backdrop'));
      true;
    `);
  }

  async click(selector, text = null) {
    const expression = text
      ? `window.__click(${JSON.stringify(selector)}, ${JSON.stringify(text)})`
      : `window.__click(${JSON.stringify(selector)})`;
    await this.evaluate(expression);
    await wait(450);
    await this.installHelpers();
  }

  text() {
    return this.evaluate('window.__text()');
  }
}

/* ------------------------------------------------------------------ */

const results = [];

function check(label, passed, detail = '') {
  results.push({ label, passed });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}${passed || !detail ? '' : `\n      ${detail}`}`);
}

async function launchBrowser(url) {
  const browser = await findBrowser();
  if (!browser) throw new Error('Microsoft Edge was not found, so the UI cannot be driven.');

  const profile = path.join(dataDir, 'browser-profile');
  fs.mkdirSync(profile, { recursive: true });

  const child = spawn(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profile}`,
      '--window-size=1280,900',
      url,
    ],
    { stdio: 'ignore' }
  );

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await wait(300);
    try {
      const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
      const target = targets.find((entry) => entry.type === 'page' && entry.url.includes('127.0.0.1'));
      if (target) return { child, target };
    } catch {
      /* not listening yet */
    }
  }

  child.kill();
  throw new Error('headless Edge never exposed a page');
}

async function seed(services) {
  const coffee = await services.catalog.create({ name: 'Coffee beans', unit: 'kg', price: '12.00' });
  await services.catalog.create({ name: 'Paper cups', unit: 'pcs', price: '0.15' });
  const alice = await services.customers.create({ name: 'Alice Mwangi', phone: '0700 111 222' });
  await services.customers.create({ name: 'Bob Otieno' });

  await services.inventory.addStock({ productId: coffee.id, quantity: 20 });
  await services.settings.update({ shopName: 'Corner Cafe' });

  return { coffee, alice };
}

async function main() {
  const container = createContainer({ logger: silentLogger });
  await container.server.listen();

  const { services } = container;
  const { coffee, alice } = await seed(services);

  const { child, target } = await launchBrowser(container.server.url);
  const page = await Page.attach(target.webSocketDebuggerUrl);

  await wait(1200);
  await page.installHelpers();

  let text = await page.text();
  check('home shows the shop name', text.includes('Corner Cafe'), text.slice(0, 160));

  /* ---------------- sell ---------------- */

  await page.click('.tile', 'Sell');
  text = await page.text();
  check('sell screen asks for a customer first', text.includes('Choose customer'));
  check('sell screen lists the products', text.includes('Coffee beans'));

  await page.click('.button', 'Choose customer');
  check('customer picker opens', await page.evaluate('window.__sheetOpen()'));

  text = await page.text();
  check('picker shows each customer with their balance', text.includes('Alice Mwangi') && text.includes('settled up'));

  await page.click('.row', 'Alice Mwangi');
  check('choosing a customer closes the picker', !(await page.evaluate('window.__sheetOpen()')));

  await page.click('.picker__rows .row', 'Coffee beans');
  check('tapping a product asks how many', await page.evaluate('window.__sheetOpen()'));

  text = await page.text();
  check('the usual price is pre-filled', text.includes('Usually $12.00'), text.slice(0, 220));
  check('stock on hand is shown while selling', text.includes('20 in stock'));

  // 3 kg at a negotiated 11.50 rather than the usual 12.00.
  await page.evaluate(`window.__fill('.sheet .stepper__input', '3')`);
  await page.evaluate(`window.__fill('.sheet .input', '11.50')`);
  await wait(200);

  text = await page.text();
  check('the line total follows what is typed', text.includes('$34.50'), text.slice(0, 260));

  await page.click('.sheet__foot .button--primary');
  text = await page.text();
  check('the line reaches the sale at the agreed price', text.includes('$34.50') && text.includes('3 kg'), text.slice(0, 300));

  await page.click('.button--confirm', 'Save sale');

  // Read the notification before it expires: top right, green, plain language.
  const notice = await page.evaluate(`
    (() => {
      const node = document.querySelector('.toast');
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return {
        text: node.innerText,
        background: getComputedStyle(node).backgroundColor,
        fromRight: Math.round(window.innerWidth - box.right),
        fromTop: Math.round(box.top),
      };
    })()
  `);
  check('a notification confirms the sale', Boolean(notice) && notice.text.includes('Sale saved'), JSON.stringify(notice));
  check('the notification sits in the top right', notice && notice.fromTop < 160 && notice.fromRight < 90, JSON.stringify(notice));
  // Asserted as "a green", not as a pinned hex, so retuning the palette is
  // free but going back to a grey pill is not.
  const noticeRgb = notice ? notice.background.match(/\d+/g).map(Number) : [];
  check(
    'the notification is a solid green, not a grey pill',
    noticeRgb.length >= 3 && noticeRgb[1] > noticeRgb[0] + 40 && noticeRgb[1] > noticeRgb[2] + 20,
    notice?.background
  );

  await wait(400);
  await page.installHelpers();

  text = await page.text();
  check('saving returns home', text.includes('Take payment') && text.includes('Sales report'));

  // Scoped to the screen, since the confirmation notification is still on top
  // of it and does quote the amount.
  const homeBody = await page.evaluate(`document.getElementById('screen').innerText.replace(/\s+/g, ' ').trim()`);
  check('home carries no figures of its own', !homeBody.includes('$'), homeBody.slice(0, 300));

  /* ---------------- payment ---------------- */

  await page.click('.tile', 'Take payment');
  await page.click('.button', 'Choose customer');
  await page.click('.row', 'Alice Mwangi');

  text = await page.text();
  check('payment screen shows what is owed', text.includes('owes $34.50'), text.slice(0, 260));

  await page.click('.chip', 'Pay all');
  const filled = await page.evaluate(`document.querySelector('.input--amount').value`);
  check('"pay all" fills in the exact balance', filled === '34.50', `got "${filled}"`);

  // Pay part of it, to prove the remainder stays owing.
  await page.evaluate(`window.__fill('.input--amount', '20')`);
  await page.click('.button--confirm', 'Save payment');
  await wait(400);
  await page.installHelpers();

  text = await page.text();
  check('saving the payment returns home', text.includes('Take payment'), text.slice(0, 200));

  /* ---------------- customer history ---------------- */

  await page.click('.tile', 'Customers');
  text = await page.text();
  check('the customer table shows the remaining balance', text.includes('$14.50'), text.slice(0, 300));
  check('the customer table has sortable column headings', (await page.evaluate(
    `document.querySelectorAll('.table__th--sortable').length`
  )) >= 4);

  await page.click('tbody tr', 'Alice Mwangi');
  text = await page.text();
  check('the customer page headlines the balance', text.includes('$14.50'), text.slice(0, 220));
  check('the history holds both the sale and the payment', text.includes('Sale') && text.includes('Payment'));
  check('the history carries a running balance', text.includes('balance'), text.slice(0, 400));

  /* ---------------- report ---------------- */

  await page.click('.appbar__back');
  await page.click('.appbar__back');
  await page.click('.tile', 'Sales report');

  text = await page.text();
  check('the ledger totals the period', text.includes('$34.50'), text.slice(0, 300));
  check('one table, with the product and the customer on the same row', text.includes('Coffee beans') && text.includes('Alice Mwangi'));
  check(
    'it really is a single table',
    (await page.evaluate(`document.querySelectorAll('.screen table').length`)) === 1
  );

  // Headers of numeric columns must sit on the same right edge as the figures
  // under them; CSS specificity silently broke this once.
  const alignment = await page.evaluate(`
    (() => {
      const table = document.querySelector('.screen table');
      const heads = [...table.querySelectorAll('th')];
      const index = heads.findIndex((th) => th.textContent.trim().startsWith('Total'));
      const th = heads[index];
      const td = table.querySelector('tbody tr').children[index];
      return {
        headerAlign: getComputedStyle(th).textAlign,
        cellAlign: getComputedStyle(td).textAlign,
        headerRight: Math.round(th.getBoundingClientRect().right),
        cellRight: Math.round(td.getBoundingClientRect().right),
      };
    })()
  `);
  check(
    'a numeric header is right-aligned like its figures',
    alignment.headerAlign === 'right' && alignment.cellAlign === 'right',
    JSON.stringify(alignment)
  );
  check(
    'the header and its column share a right edge',
    Math.abs(alignment.headerRight - alignment.cellRight) <= 1,
    JSON.stringify(alignment)
  );

  const headings = await page.evaluate(
    `JSON.stringify([...document.querySelectorAll('.screen th')].map((th) => th.textContent.replace(/[▲▼]/g, '').trim()))`
  );
  check(
    'the columns are date, product, customer, qty, price, total',
    JSON.parse(headings).join(',') === 'Date,Product,Customer,Qty,Price,Total',
    headings
  );

  // Narrowing to a customer who bought nothing should empty the table.
  const bobOption = await page.evaluate(`
    (() => {
      const select = [...document.querySelectorAll('select')].find((node) => node.options[0].text === 'All customers');
      const option = [...select.options].find((candidate) => candidate.text.startsWith('Bob'));
      return option ? option.value : null;
    })()
  `);
  check('the customer filter lists who bought in the period', bobOption === null, 'Bob bought nothing, so he is not offered');

  const aliceOption = await page.evaluate(`
    (() => {
      const select = [...document.querySelectorAll('select')].find((node) => node.options[0].text === 'All customers');
      const option = [...select.options].find((candidate) => candidate.text.startsWith('Alice'));
      if (!option) return null;
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return option.value;
    })()
  `);
  check('the customer filter offers Alice', Boolean(aliceOption));

  await wait(700);
  await page.installHelpers();
  text = await page.text();
  check('filtering by customer keeps her line', text.includes('Coffee beans') && text.includes('$34.50'), text.slice(0, 300));
  check('and offers a way back out', text.includes('Clear filters'));

  await page.click('.chip', 'Today');
  text = await page.text();
  check('changing the period re-queries', text.includes('$34.50') && text.includes('Today'), text.slice(0, 220));

  /* ---------------- theme ---------------- */

  await page.click('.appbar__back');
  await page.click('.icon-button');
  const theme = await page.evaluate('document.documentElement.dataset.theme');
  check('the theme toggle switches to dark', theme === 'dark', `theme is "${theme}"`);

  // Compared against the token rather than a pinned colour, so retuning the
  // palette does not break the test — only failing to repaint does.
  const repaint = await page.evaluate(`
    (() => {
      const root = getComputedStyle(document.documentElement);
      const body = getComputedStyle(document.body).backgroundColor;
      const token = root.getPropertyValue('--bg').trim();
      const rgb = body.match(/\\d+/g).map(Number);
      return { body, token, dark: rgb.reduce((a, b) => a + b, 0) < 120 };
    })()
  `);
  check('the dark theme actually repaints the page', repaint.dark, JSON.stringify(repaint));

  /* ---------------- the books agree ---------------- */

  const position = services.ledger.positionFor(alice.id);
  check('ledger: 34.50 charged', position.charged === 3450, String(position.charged));
  check('ledger: 20.00 paid', position.paid === 2000, String(position.paid));
  check('ledger: 14.50 still owed', position.balance === 1450, String(position.balance));
  check('stock fell by the 3 kg sold', services.inventory.onHand(coffee.id) === 17, String(services.inventory.onHand(coffee.id)));

  check('no uncaught errors in the page', page.pageErrors.length === 0, page.pageErrors.join(' | '));

  child.kill();
  await container.server.close();

  // Edge takes a moment to let go of its profile, and a leftover temp folder
  // must never turn a passing run into a failure.
  try {
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* the OS will clear it out of the temp folder */
  }

  const failed = results.filter((entry) => !entry.passed).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`\nharness failed: ${err.message}`);
  process.exit(2);
});
