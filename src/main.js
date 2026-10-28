'use strict';

const fs = require('node:fs');

const config = require('./config');
const { createServer } = require('./server');
const { openWindow } = require('./window');
const log = require('./log');

async function main() {
  fs.mkdirSync(config.dataDir, { recursive: true });

  log.info(`${config.productName} ${config.version} starting`);
  log.info(`data directory: ${config.dataDir}`);

  const server = await createServer();
  const { port } = server.address();
  const url = `http://${config.host}:${port}/`;

  log.info(`listening on ${url}`);

  if (!config.openWindow) {
    console.log(`ShopWise is serving at ${url} (press Ctrl+C to stop)`);
    return;
  }

  const window = await openWindow(url);

  // The window owns the lifetime of the app: close it and the server goes too.
  window.on('exit', () => {
    log.info('window closed, shutting down');
    server.close(() => process.exit(0));
    // Don't let a lingering keep-alive socket hold the process open.
    setTimeout(() => process.exit(0), 2000).unref();
  });
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
