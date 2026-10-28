# ShopWise

A Windows app for a small shop or cafe that sells on account: record what went
out, record what customers pay, and always know who owes what.

Built to stay small. **Zero npm packages** — `dependencies` and
`devDependencies` are both empty and are meant to stay that way. Nothing to
install on the shop's PC: the installer carries its own Node runtime, and the
window is drawn by the Edge WebView engine already part of Windows. Ships as an
**MSI** with proper upgrade codes, so installing v0.2 replaces v0.1.

No login, no accounts, no cloud. One person, one PC.

## What it does

Two actions, each one tap from the home screen:

| | |
| --- | --- |
| **Sell** | Three numbered steps: who is buying, what they are taking, check and save. Products come from a searchable list; each pick asks how many and at what price — pre-filled with the usual price, editable because it varies. The running sale sits in a sticky column beside the list. |
| **Add stock** | A whole delivery at once: tap each product that arrived, set the amounts together, save once. The server takes it in a single write, so it is recorded or refused, never half-entered. |
| **Take payment** | Who paid, how much, when — same three-step shape. "Pay all" is one tap. Any date, any amount. |

And three screens to look things up on:

| | |
| --- | --- |
| **Stock** | Every product with price, taken in, sold, on hand and value. Search, filter to what is Low or Out, sort any column, and take a delivery in from the row itself. |
| **Customers** | Everyone with bought, paid and balance, biggest debt first, with a Take payment button on every row. |
| **One customer** | Balance as a headline, then sales and payments on one timeline with the balance as it stood after each — so a disputed total can be read down until you disagree. |
| **Sales report** | One ledger of every sale line: date, product, customer, quantity, price, total. Narrow it by period, by product, by customer, or all three, and sort any column. |

There is no separate "add stock" screen. A delivery changes a figure that lives
on the stock table, so it is entered there: one tap on the row's **+ Add**, a
quantity, done, without losing your place.

The lookup screens are built on one dense, sortable table
([src/ui/widgets/table.js](src/ui/widgets/table.js)): a sticky header, numbers
right-aligned on tabular figures so digits line up, light banding to keep a long
list scannable, and a coloured status dot so a shortage registers before
anything is read.

When picking a product to sell, it is a searchable list rather than a grid of
tiles, because a shop can easily carry hundreds. Typing filters as you go and Enter takes the top match,
so a sale can be entered without the hand leaving the keyboard. The list scrolls
in its own area, so the running total and the save button never get pushed off
the screen. Measured with a 500-product catalogue: 43 ms to open the sell screen
with every row rendered, 1 ms to filter.

## Two rules the whole app rests on

**Nothing is a stored counter.** Stock is `added − sold`. A customer's balance is
`charged − paid`. Both are computed from the movements every time they're read,
so no figure can drift away from the records that explain it, and deleting a
mis-keyed sale simply undoes its effect everywhere.

**Money is only ever integer cents.** Amounts are parsed from their decimal
string form and never summed as floats — a shop's books can't afford
`0.1 + 0.2`. Quantities allow three decimals so goods sold by weight work.

Two consequences worth knowing: a payment is never matched to a particular sale,
because the shop doesn't work that way; and paying more than the balance is
normal, not an error — it becomes credit.

A sale cannot take out more than the stock records hold: the sell screen marks
an empty product as unavailable and offers to take stock in instead, which is
both the fix and the record of what arrived. The server still only warns, so a
correction or an import is never blocked by it.

## Running it

```sh
npm run dev        # app window + live reload   <- use this while working
npm start          # app window, no watching
npm run serve      # server only, no window — open the printed URL yourself
npm run dev:serve  # watched server only, fixed port, no window
```

No build step: plain JavaScript on both sides of the wire.

`npm run dev` opens the window once and runs the server under Node's own
`--watch`, so **any** change under `src/` — a CSS token, a screen, a domain
service — restarts it and the window reloads itself. Nothing to press.

The mechanism is the connection rather than a file watcher in the browser: the
page holds an EventSource open against `/dev/events`, and coming back after the
stream drops is what means "there is new code". That endpoint sits outside
`/api` because EventSource cannot send the session token, so it is only ever
created when the app is started with `--dev` — a test asserts it is absent
otherwise. The dev port is fixed (4810, or `SHOPWISE_DEV_PORT`) because the
window's URL has to survive the restarts.

## Tests

```sh
npm test           # 263 unit, HTTP and asset tests, instant
npm run test:e2e   # drives the real UI in headless Edge, ~20s
npm run test:all   # both
```

`npm test` needs nothing but Node and covers every module on the server side:

| | |
| --- | --- |
| `test/domain/` | The rules — catalog, customers, inventory, sales, ledger, reports, overview, settings — over an in-memory store with a fixed clock and sequential ids, which the composition root accepts as parameters. See [test/support/fixture.js](test/support/fixture.js). |
| `test/persistence/` | The document store (atomic writes, transactional mutations, serialised concurrency, a corrupt file quarantined rather than replaced), daily backups, repositories and the stored schema. |
| `test/shared/` | Money, quantities, validation, day ranges, clock and ids. |
| `test/http/` | Router, session token, static files, dev reload, and every endpoint through the real server. |
| `test/ui/` | The module graph, the stylesheets against the markup, colour contrast, and the formatter. |

[test/e2e/flows.js](test/e2e/flows.js) clicks through a real sale, a partial
payment, the customer history and the report in headless Edge over the DevTools
protocol, then checks the books server-side. No driver library — Node's built-in
WebSocket is enough.

[test/ui/module-graph.test.js](test/ui/module-graph.test.js) exists because the
UI has no bundler: it walks every import from `index.html` and insists each file
exists and is served, since otherwise a typo'd path shows up as a blank window.

## Look and feel

The light theme is a white page with true neutral greys — a tinted page is what
makes an interface read as a generic admin template. Depth comes from hairlines
and shallow elevation rather than from washing everything in grey, and panels
sit at the same value as the page and are read by their border. Dark mode is
neutral and deep rather than blue-black, with each surface a clear step up from
the page so controls sit on it instead of sinking into it.

Colour is reserved: one indigo accent for the action most likely wanted, and
red/green/amber only for money going the wrong way, being paid, or stock
running out. [test/ui/contrast.test.js](test/ui/contrast.test.js) measures every
pair in both themes, grouped by what the ratio has to buy — 4.5:1 for text,
3:1 for anything carrying meaning by colour alone, lower bars for outlines and
dividers, which is roughly where shipping products sit.

The mark is a shopping bag with a smile — it says "shop" before anything is
read, which a chart or a receipt does not, those belonging to every analytics
tool ever made. One colour, nothing behind it, drawn so the silhouette and the
smile survive being shrunk to 16px.
[src/ui/assets/logo.svg](src/ui/assets/logo.svg) is the single source — it is
the favicon (and so the taskbar icon, since the window is an Edge app window),
the header brand, and the input to `npm run icon`, which renders it through
headless Edge at nine sizes and assembles `assets/shopwise.ico` for the
installer's shortcuts and the Apps & features entry.

## Building the installer

The MSI needs the WiX toolset — a folder of executables that run on the .NET
Framework already in Windows. No .NET SDK, no Visual Studio.

```sh
npm run tools:wix  # one-time: downloads WiX v3 into ./tools (gitignored)
npm run icon       # re-render assets/shopwise.ico from the logo
npm run msi        # -> dist/ShopWise-<version>-x64.msi
npm run build      # stage ./stage only, skip the MSI
```

To release, bump `version` in `package.json` and run `npm run msi`. The
`UpgradeCode` in [ShopWise.wxs](build/wix/ShopWise.wxs) must never change; the
`ProductCode` is regenerated every build, which is what lets Windows do an
in-place major upgrade.

Current output: **~24 MB MSI, ~85 MB installed**, almost all of it the Node runtime.

## How it fits together

```
ShopWise.exe  (a copy of node.exe, PE subsystem flipped to GUI so no console flashes)
   └─ src/main.js
        ├─ src/container.js    composition root — the only file that wires things
        ├─ src/http/           server, router, static files, session token
        ├─ src/domain/         the rules: catalog, customers, inventory, sales,
        │                      ledger, reports, overview, settings
        ├─ src/persistence/    JSON document store, repositories, daily backups
        ├─ src/shared/         money, quantity, clock, ids, validation, day ranges
        ├─ src/platform/       locates Edge and opens the window
        └─ src/ui/             core/ widgets/ screens/ styles/ — no framework
```

Services receive their repositories, clock and id source through their
constructors and never reach for globals, so [src/container.js](src/container.js)
is the only file that knows which concrete thing fills each dependency. Swapping
the JSON store for `node:sqlite` is a change to that one file.

Navigation is a **stack of tasks, not a tree of pages** — no sidebar. Home is the
root; starting a task pushes a screen, finishing or abandoning it pops back, so
there is always exactly one way out, in one place.

A few details worth knowing before changing things:

- **The API is token-guarded, and that is not a login.** The app serves itself
  over `http://127.0.0.1:<port>`, which any website the user has open could
  otherwise post to. The page receives a per-run token automatically; nobody
  types anything. See [src/http/session-token.js](src/http/session-token.js).
- **The runtime is patched, not compiled.** `build.js` copies `node.exe` and
  flips two bytes in its PE header from the console subsystem to the GUI
  subsystem, so no black window flashes on launch. The app therefore has no
  usable stdout, which is why it logs to a file.
- **Edge gets its own profile** under the data directory, so the shop's window
  stays out of the user's browsing session.
- **The page says whether the window is open**, by holding one event stream for
  as long as it is on screen; the app stops five seconds after that stream goes
  for good. The process Edge is launched with is not the window and cannot be
  asked: Edge moves the window to a browser process of its own and lets the
  launched one exit whenever it likes. See
  [src/platform/lifetime.js](src/platform/lifetime.js).
- **Names are snapshotted onto records.** A sale line keeps the product name and
  unit as they were. Renaming a product next month must not change what last
  month's sale says.
- **Products and customers are hidden, never deleted**, because past sales refer
  to them.
- **Deleting a movement marks it, never erases it.** A deleted delivery, sale or
  payment stops counting everywhere — stock, balances, reports, today's takings
  — and stays on the product's and the customer's history, struck through, as a
  record of what was taken off. There is no undo: putting it back means
  recording it again. The rule is kept in one place: `all()` on a repository
  leaves deleted records out, so every calculation is right by default, and the
  three history views ask for `withDeleted()` on purpose. See
  [src/persistence/collection-repository.js](src/persistence/collection-repository.js).
- **No module writes user data through innerHTML.** `el({ text })` always uses
  `textContent`; the single exception is `icons.js`, whose SVG is a literal in
  its own source. A test enforces this.

## Where data lives

| | Path |
| --- | --- |
| Installed | `%LOCALAPPDATA%\ShopWise\shop.json` |
| From source | `./.data/shop.json` (gitignored) |
| Backups | `<data>\backups\shop-YYYY-MM-DD.json` — one per day, 30 kept |
| Log | `<data>\shopwise.log` |

Writes are atomic (temp file, fsync, rename) and transactional: a mutation runs
against a clone and is committed only if it completes, so a rejected sale cannot
leave half of itself behind. An unreadable file is moved aside rather than
silently replaced with empty books.

Uninstalling deliberately leaves the data directory alone. Running from the repo
never touches the installed copy's data. Override with `--data-dir=<path>`.

## Requirements

- **Shop PC:** 64-bit Windows 8.1 or later, with Edge present (it is, on Windows 10 and 11).
- **Build PC:** Node 20+ and nothing else installed. There are no npm packages
  to fetch, and WiX v3 — downloaded by `npm run tools:wix`, which needs the
  internet once — runs on the .NET Framework that is already part of Windows.
  Edge is what `npm run test:e2e` and `npm run icon` drive, and the end-to-end
  harness uses Node's built-in WebSocket, so run those on Node 22.

  A clean clone on a stock Windows 11 machine with only Node 22: `npm install`
  (nothing to install), `npm test`, `npm run tools:wix`, `npm run msi`.
"# shop-wise" 
