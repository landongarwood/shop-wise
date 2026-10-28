# ShopWise

Lightweight Windows accounting app for a small shop or cafe.

- **No npm packages.** `dependencies` and `devDependencies` are both empty, and they are meant to stay that way.
- **Nothing to install on the shop's PC.** The installer carries its own Node runtime, and the window is drawn by the Edge WebView engine that is already part of Windows.
- **Ships as an MSI** with proper upgrade codes, so installing v0.2 replaces v0.1 instead of sitting beside it.

## Status

Scaffold. The shell, local server, API router, installer pipeline and tests work end to end. The feature screens and the storage backend are not written yet — see [Open decisions](#open-decisions).

## Running it

```sh
npm start          # open the app window
npm run dev        # same, with logs echoed to the terminal
npm run serve      # server only, no window (open the printed URL yourself)
npm test           # smoke tests
```

No build step is involved — it is plain JavaScript on both sides of the wire.

## Building the installer

The MSI needs the WiX toolset, which is a folder of executables that run on the
.NET Framework already present in Windows. No .NET SDK, no Visual Studio.

```sh
npm run tools:wix  # one-time: downloads WiX v3 into ./tools (gitignored)
npm run msi        # -> dist/ShopWise-<version>-x64.msi
npm run build      # stage ./stage only, skip the MSI
```

To release a new version, bump `version` in `package.json` and run `npm run msi`.
The `UpgradeCode` in [ShopWise.wxs](build/wix/ShopWise.wxs) must never change;
the `ProductCode` is regenerated on every build, which is what lets Windows
perform a major upgrade in place.

Current output: **~24 MB MSI, ~85 MB installed**, nearly all of which is the Node runtime.

## How it fits together

```
ShopWise.exe  (a copy of node.exe, PE subsystem flipped to GUI so no console flashes)
   └─ src/main.js
        ├─ src/server.js   local HTTP server on 127.0.0.1, random free port
        │    ├─ src/ui/    static files: plain HTML, CSS, ES modules
        │    └─ src/api/   JSON endpoints under /api
        │         └─ src/store/   persistence boundary
        └─ src/window.js   launches msedge.exe --app=<url> in its own profile
```

The window owns the app's lifetime: closing it shuts the server down.

A few details worth knowing before changing things:

- **The API is token-guarded.** A loopback server is reachable by any page the
  user has open in a browser, so every `/api` call must carry the per-run token
  that `server.js` templates into `index.html`. See [src/server.js](src/server.js).
- **The runtime is patched, not compiled.** `build.js` copies `node.exe` and
  flips two bytes in its PE header from the console subsystem to the GUI
  subsystem. The app therefore has no usable stdout, which is why it logs to a
  file. See `makeWindowless` in [build/build.js](build/build.js).
- **Edge gets its own profile** under the data directory. Without that, Edge
  would hand the window to an already-running Edge process and exit
  immediately, taking our server's lifetime signal with it.
- **Data outlives uninstall.** The installer deliberately does not remove the
  data directory. A shop's books must survive a bad upgrade.

## Where data lives

| | Path |
| --- | --- |
| Installed | `%LOCALAPPDATA%\ShopWise` |
| From source | `./.data` (gitignored) |
| Log | `<data>\shopwise.log` |

Running from the repo never touches the installed copy's data. Override with
`--data-dir=<path>` if you need to.

## Open decisions

Two things are deliberately unresolved, both flagged in the code:

1. **Feature scope** — what the app tracks. The candidates were a plain cash
   book; cash book plus products and sales; the same plus stock levels; or full
   double-entry books. Views are registered in one list in
   [src/ui/app.js](src/ui/app.js).
2. **Storage backend** — [src/store/index.js](src/store/index.js) defines the
   interface and currently resolves to a non-persistent in-memory adapter so
   the app boots. The real options are a JSON file with atomic writes and
   backups, or `node:sqlite` (built into Node 22+, so still zero packages —
   and the bundled runtime here is already Node 22).

## Requirements

- **Shop PC:** 64-bit Windows 8.1 or later, with Edge present (it is, on Windows 10 and 11).
- **Build PC:** Node 20+ and the WiX toolset fetched by `npm run tools:wix`.
