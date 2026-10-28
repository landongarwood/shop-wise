'use strict';

/**
 * Development runner.
 *
 * Opens the app window once, then runs the server under Node's own `--watch`
 * so any change under src/ restarts it. The window survives the restarts: the
 * page is holding a stream open against /dev/events, and reconnecting after
 * the drop is what tells it to reload.
 *
 * The port is fixed here, unlike a normal run which takes whatever the OS
 * gives, because the window's URL has to stay valid across restarts.
 */

const path = require('node:path');
const { spawn } = require('node:child_process');

const { openWindow } = require('../src/platform/window');

const repoRoot = path.resolve(__dirname, '..');
const port = Number(process.env.SHOPWISE_DEV_PORT ?? 4810);
const url = `http://127.0.0.1:${port}/`;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return true;
    } catch {
      /* not listening yet */
    }
    await wait(150);
  }
  return false;
}

async function main() {
  console.log(`ShopWise dev — watching src/, serving on ${url}\n`);

  const server = spawn(
    process.execPath,
    [
      '--watch',
      // Only src/. Without this Node would also watch the data directory and
      // restart the server every time a sale is saved.
      '--watch-path',
      path.join(repoRoot, 'src'),
      path.join(repoRoot, 'src', 'main.js'),
      '--dev',
      '--no-window',
      `--port=${port}`,
    ],
    { cwd: repoRoot, stdio: 'inherit' }
  );

  let shuttingDown = false;
  const shutDown = (code = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.kill();
    process.exit(code);
  };

  server.on('exit', (code) => shutDown(code ?? 0));
  process.on('SIGINT', () => shutDown(0));
  process.on('SIGTERM', () => shutDown(0));

  if (!(await waitForServer())) {
    console.error('The dev server did not come up. Is something already using port ' + port + '?');
    return shutDown(1);
  }

  const window = await openWindow(url);
  console.log('\nWindow open. Edit anything under src/ and it reloads itself.');
  console.log('Press Ctrl+C here to stop.\n');

  window.on('exit', () => shutDown(0));
  return undefined;
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
