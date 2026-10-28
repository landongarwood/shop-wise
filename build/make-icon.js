'use strict';

/**
 * Builds assets/shopwise.ico from the logo.
 *
 * There is no image library here and there is not going to be one, so the SVG
 * is rendered by the browser the app already depends on: headless Edge draws it
 * at each size the shell asks for, the frames come back as PNG over the
 * DevTools protocol, and this assembles them into an icon directory. Windows
 * has accepted PNG-compressed icon entries since Vista.
 *
 * Run with `npm run icon` after changing src/ui/assets/logo.svg.
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { findBrowser } = require('../src/platform/window');

const repoRoot = path.resolve(__dirname, '..');
const sourceSvg = path.join(repoRoot, 'src', 'ui', 'assets', 'logo.svg');
const outputIco = path.join(repoRoot, 'assets', 'shopwise.ico');

// The sizes Windows actually asks for: taskbar, Start menu, Explorer, and the
// 256 that Add/Remove Programs and large tiles use.
const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];

const DEBUG_PORT = Number(process.env.SHOPWISE_ICON_PORT ?? 9444);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Serves the logo scaled to fill whatever viewport the browser is given. */
function servePage(svg) {
  const html = `<!doctype html><meta charset="utf-8">
    <style>
      html,body{margin:0;height:100%;background:transparent}
      svg{display:block;width:100vw;height:100vh}
    </style>${svg}`;

  return new Promise((resolve) => {
    const server = http.createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(html);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function connect(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message.result);
      pending.delete(message.id);
    }
  });

  return (method, params = {}) =>
    new Promise((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });
}

/** ICONDIR + one ICONDIRENTRY per frame, then the PNG bytes themselves. */
function buildIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(frames.length, 4);

  const directory = Buffer.alloc(16 * frames.length);
  let offset = header.length + directory.length;

  frames.forEach((frame, index) => {
    const entry = index * 16;
    // 0 means 256: the field is a single byte, which is the whole reason the
    // format tops out where it does.
    directory.writeUInt8(frame.size >= 256 ? 0 : frame.size, entry);
    directory.writeUInt8(frame.size >= 256 ? 0 : frame.size, entry + 1);
    directory.writeUInt8(0, entry + 2); // palette size, 0 for truecolour
    directory.writeUInt8(0, entry + 3); // reserved
    directory.writeUInt16LE(1, entry + 4); // colour planes
    directory.writeUInt16LE(32, entry + 6); // bits per pixel
    directory.writeUInt32LE(frame.png.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);

    offset += frame.png.length;
  });

  return Buffer.concat([header, directory, ...frames.map((frame) => frame.png)]);
}

async function main() {
  const svg = await fsp.readFile(sourceSvg, 'utf8');
  const browser = await findBrowser();
  if (!browser) throw new Error('Microsoft Edge was not found, so the icon cannot be rendered.');

  const { server, port } = await servePage(svg);
  const profile = path.join(os.tmpdir(), `shopwise-icon-${Date.now()}`);
  fs.mkdirSync(profile, { recursive: true });

  const edge = spawn(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--hide-scrollbars',
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profile}`,
      `http://127.0.0.1:${port}/`,
    ],
    { stdio: 'ignore' }
  );

  try {
    let target = null;
    let lastSeen = 'nothing';
    for (let attempt = 0; attempt < 40 && !target; attempt += 1) {
      await wait(250);
      try {
        const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
        lastSeen = JSON.stringify(targets.map((entry) => `${entry.type} ${entry.url}`));
        target = targets.find((entry) => entry.type === 'page' && entry.url.includes('127.0.0.1'));
      } catch (err) {
        lastSeen = err.message;
      }
    }
    if (!target) throw new Error(`headless Edge never exposed a page (last seen: ${lastSeen})`);

    const send = await connect(target.webSocketDebuggerUrl);

    // Transparent outside the rounded badge, so the icon does not sit on a
    // white square in a dark taskbar. Done here rather than with a launch flag,
    // which stops the page target appearing at all.
    await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    await wait(500);

    const frames = [];
    for (const size of SIZES) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: size,
        height: size,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await wait(120);

      const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      frames.push({ size, png: Buffer.from(data, 'base64') });
      console.log(`  rendered ${size}x${size} (${frames.at(-1).png.length} bytes)`);
    }

    await fsp.mkdir(path.dirname(outputIco), { recursive: true });
    await fsp.writeFile(outputIco, buildIco(frames));

    console.log(`\nWrote ${outputIco} (${(fs.statSync(outputIco).size / 1024).toFixed(1)} KB, ${frames.length} sizes)`);
  } finally {
    edge.kill();
    server.close();
    try {
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      /* the OS will clear it out of temp */
    }
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
