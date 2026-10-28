'use strict';

const path = require('node:path');
const fs = require('node:fs');

const pkg = require('../package.json');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const appRoot = path.resolve(__dirname, '..');

// Installed builds carry a marker file written by build/build.js. Without it we
// are running straight from the repo, so keep data beside the source instead of
// touching the user's real profile.
const installed = fs.existsSync(path.join(appRoot, 'build-info.json'));

const dataDir = option(
  'data-dir',
  installed
    ? path.join(process.env.LOCALAPPDATA || process.env.APPDATA || appRoot, pkg.productName)
    : path.join(appRoot, '.data')
);

module.exports = {
  appRoot,
  installed,
  productName: pkg.productName,
  version: pkg.version,

  dataDir,
  backupDir: path.join(dataDir, 'backups'),
  logFile: path.join(dataDir, 'shopwise.log'),

  uiDir: path.join(__dirname, 'ui'),

  // 0 lets the OS pick a free port; the window is told the real one afterwards.
  port: Number(option('port', 0)),
  host: '127.0.0.1',

  dev: flag('dev'),
  openWindow: !flag('no-window'),

  window: { width: 1180, height: 760 },
};
