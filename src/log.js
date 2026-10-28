'use strict';

const fs = require('node:fs');
const path = require('node:path');

const config = require('./config');

let stream = null;

function sink() {
  if (stream) return stream;
  try {
    fs.mkdirSync(path.dirname(config.logFile), { recursive: true });
    stream = fs.createWriteStream(config.logFile, { flags: 'a' });
  } catch {
    stream = { write() {} }; // logging must never take the app down
  }
  return stream;
}

function write(level, parts) {
  const text = parts
    .map((p) => (p instanceof Error ? `${p.message}\n${p.stack}` : typeof p === 'string' ? p : JSON.stringify(p)))
    .join(' ');
  const line = `${new Date().toISOString()} ${level} ${text}\n`;
  sink().write(line);

  // The installed launcher runs on the Windows GUI subsystem, where there is no
  // console and stderr may be an invalid handle.
  if (config.dev || level === 'ERROR') {
    try {
      process.stderr.write(line);
    } catch {}
  }
}

module.exports = {
  info: (...parts) => write('INFO', parts),
  warn: (...parts) => write('WARN', parts),
  error: (...parts) => write('ERROR', parts),
};
