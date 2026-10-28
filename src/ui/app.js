import { ApiClient } from './core/api-client.js';
import { createFormat } from './core/format.js';
import { Navigator } from './core/navigator.js';
import { initTheme } from './core/theme.js';
import { connectDevReload } from './core/dev-reload.js';
import { announcePresence } from './core/presence.js';
import { toastError } from './core/toast.js';
import { div, append } from './core/dom.js';
import { routes } from './screens/index.js';

/**
 * Client composition root: builds the API client, loads the shop's settings so
 * money can be formatted, then hands both to the screens through one shared
 * context. Screens receive their dependencies; they never reach for globals.
 */
async function boot() {
  initTheme();
  announcePresence();
  connectDevReload();

  const api = new ApiClient();

  const meta = await api.get('/meta');

  const app = {
    api,
    product: meta.product,
    settings: null,
    format: null,

    /** Called after settings change so every screen reformats consistently. */
    async refreshSettings() {
      app.settings = await api.get('/settings');
      app.format = createFormat(app.settings);
      return app.settings;
    },
  };

  await app.refreshSettings();

  const navigator = new Navigator({
    appbar: document.getElementById('appbar'),
    host: document.getElementById('screen'),
    routes,
    app,
  });

  app.navigator = navigator;
  await navigator.root('home');
}

/** A failure during boot leaves a blank window, so say something useful. */
function showFatal(message) {
  const host = document.getElementById('screen');
  const bar = document.getElementById('appbar');

  if (bar) append(bar, div({ class: 'appbar__titles' }, div({ class: 'appbar__title', text: 'ShopWise' })));
  if (host) {
    append(
      host,
      div({ class: 'empty' }, [
        div({ class: 'empty__title', text: 'ShopWise could not start' }),
        div({ text: message }),
        div({ class: 'faint', text: 'Close the window and open ShopWise again.' }),
      ])
    );
  }
}

window.addEventListener('unhandledrejection', (event) => {
  toastError(event.reason?.message ?? 'Something went wrong.');
});

boot().catch((err) => showFatal(err.message));
