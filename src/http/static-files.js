'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
});

/**
 * Serves the UI from one directory and nothing outside it.
 *
 * HTML is passed through a tiny placeholder substitution on the way out, which
 * is how the session token reaches the page: the browser can obtain it only
 * from this server.
 */
class StaticFileHandler {
  /**
   * @param {object} deps
   * @param {string} deps.rootDir
   * @param {() => Record<string, string>} deps.templateValues
   */
  constructor({ rootDir, templateValues = () => ({}) }) {
    this.rootDir = path.resolve(rootDir);
    this.templateValues = templateValues;
  }

  /** @returns {Promise<{status:number, type?:string, body?:string, stream?:ReadStream, size?:number}>} */
  async resolve(pathname) {
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const target = path.resolve(this.rootDir, relative);

    // Resolve first, then confirm the result is still inside the root: this is
    // what stops ../ from walking out of the UI directory.
    if (target !== this.rootDir && !target.startsWith(this.rootDir + path.sep)) {
      return { status: 403 };
    }

    let stats;
    try {
      stats = await fsp.stat(target);
    } catch {
      return { status: 404 };
    }
    if (!stats.isFile()) return { status: 404 };

    const extension = path.extname(target).toLowerCase();
    const type = MIME_TYPES[extension] ?? 'application/octet-stream';

    if (extension === '.html') {
      return { status: 200, type, body: this.#template(await fsp.readFile(target, 'utf8')) };
    }

    return { status: 200, type, stream: fs.createReadStream(target), size: stats.size };
  }

  #template(html) {
    return Object.entries(this.templateValues()).reduce(
      (text, [key, value]) => text.replaceAll(`{{${key}}}`, value),
      html
    );
  }
}

module.exports = { StaticFileHandler, MIME_TYPES };
