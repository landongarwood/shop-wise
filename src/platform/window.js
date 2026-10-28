'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');

const config = require('../config');
const log = require('../log');

const PROGRAM_FILES = [
  process.env['ProgramFiles(x86)'],
  process.env.ProgramFiles,
  process.env.LOCALAPPDATA,
].filter(Boolean);

// Forward slashes on purpose: path.join normalises them on Windows and they
// avoid a second layer of escaping.
const EDGE_SUBPATHS = [
  'Microsoft/Edge/Application/msedge.exe',
  'Microsoft/Edge Beta/Application/msedge.exe',
  'Microsoft/Edge Dev/Application/msedge.exe',
];

const EDGE_APP_PATHS_KEY = path.win32.join(
  'HKLM',
  'SOFTWARE',
  'Microsoft',
  'Windows',
  'CurrentVersion',
  'App Paths',
  'msedge.exe'
);

/** Ask the registry where Edge lives, in case it is installed somewhere unusual. */
function edgeFromRegistry() {
  return new Promise((resolve) => {
    execFile(
      'reg.exe',
      ['query', EDGE_APP_PATHS_KEY, '/ve'],
      { windowsHide: true },
      (err, stdout) => {
        if (err) return resolve(null);
        const match = stdout.match(/REG_SZ\s+(.+msedge\.exe)/i);
        resolve(match ? match[1].trim() : null);
      }
    );
  });
}

async function findBrowser() {
  for (const base of PROGRAM_FILES) {
    for (const sub of EDGE_SUBPATHS) {
      const candidate = path.join(base, sub);
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  const fromRegistry = await edgeFromRegistry();
  if (fromRegistry && fs.existsSync(fromRegistry)) return fromRegistry;

  return null;
}

async function openWindow(url) {
  const browser = await findBrowser();
  if (!browser) {
    throw Object.assign(
      new Error(
        'Microsoft Edge was not found. ShopWise uses the Edge WebView engine that ships with Windows. ' +
          `You can still use the app in any browser at ${url}`
      ),
      { expose: true }
    );
  }

  // A dedicated profile directory keeps the app out of the user's real Edge
  // profile and guarantees Edge starts its own process instead of handing the
  // window to an already-running Edge and exiting immediately.
  const profileDir = path.join(config.dataDir, 'window');
  fs.mkdirSync(profileDir, { recursive: true });

  const args = [
    `--app=${url}`,
    `--user-data-dir=${profileDir}`,
    `--window-size=${config.window.width},${config.window.height}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-extensions',
    '--disable-component-update',
    '--no-service-autorun',
  ];

  log.info(`opening window with ${browser}`);
  const child = spawn(browser, args, { stdio: 'ignore', windowsHide: false });
  child.on('error', (err) => log.error('window process error', err));
  return child;
}

module.exports = { openWindow, findBrowser };
