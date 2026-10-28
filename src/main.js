'use strict';

const fs = require('node:fs');

const config = require('./config');
const log = require('./log');
const { createContainer } = require('./container');
const { openWindow } = require('./platform/window');
const { WindowLifetime } = require('./platform/lifetime');

async function main() {
  fs.mkdirSync(config.dataDir, { recursive: true });

  log.info(`${config.productName} ${config.version} starting`);
  log.info(`data directory: ${config.dataDir}`);

  const { server, presence } = createContainer();
  await server.listen();
  log.info(`listening on ${server.url}`);

  if (!config.openWindow) {
    console.log(`ShopWise is serving at ${server.url} (press Ctrl+C to stop)`);
    return;
  }

  const window = await openWindow(server.url);

  // Not a shutdown signal: Edge hands the window to a browser process of its
  // own and lets this one go. Whether anyone is still looking is the page's
  // answer to give — see platform/lifetime.js.
  window.on('exit', () => log.info('browser launcher exited; the window may well still be open'));

  // The window owns the lifetime of the app: close it and the server goes too.
  new WindowLifetime({
    presence,
    logger: log,
    onGone: (reason) => shutDown(server, reason),
  }).start();
}

function shutDown(server, reason) {
  log.info(`${reason}, shutting down`);
  server.close().then(() => process.exit(0));
  // Don't let a lingering keep-alive socket hold the process open.
  setTimeout(() => process.exit(0), 2000).unref();
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    log.info(`received ${signal}, exiting`);
    process.exit(0);
  });
}

process.on('uncaughtException', (err) => {
  log.error('uncaught exception', err);
  process.exit(1);
});

main().catch((err) => {
  log.error('failed to start', err);
  process.exit(1);
});
