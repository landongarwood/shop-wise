import { api } from '/api.js';

/**
 * Views are registered here; each one renders into the main panel. Feature
 * screens get added to this list as they are built.
 */
const views = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    render: dashboard,
  },
];

const nav = document.getElementById('nav');
const panel = document.getElementById('view');
const title = document.getElementById('view-title');

let meta = null;

async function dashboard(host) {
  host.innerHTML = `
    <div class="grid">
      <div class="card">
        <h2>Today</h2>
        <div class="stat">—</div>
        <div class="muted">No entries yet</div>
      </div>
      <div class="card">
        <h2>This month</h2>
        <div class="stat">—</div>
        <div class="muted">No entries yet</div>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <h2>Build</h2>
      <dl class="kv">
        <dt>Version</dt><dd>${meta.version}</dd>
        <dt>Mode</dt><dd>${meta.installed ? 'installed' : 'running from source'}</dd>
        <dt>Data folder</dt><dd>${meta.dataDir}</dd>
        <dt>Storage</dt><dd>${meta.storage.adapter}${meta.storage.persistent ? '' : ' (not persistent yet)'}</dd>
      </dl>
    </div>

    <p class="notice" style="margin-top:16px">
      Scaffold only — the shell, local server, API router and installer pipeline are in place.
      Features and the storage backend come next.
    </p>
  `;
}

function buildNav() {
  nav.replaceChildren(
    ...views.map((view) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = view.title;
      button.dataset.view = view.id;
      button.addEventListener('click', () => show(view.id));
      item.append(button);
      return item;
    })
  );
}

async function show(id) {
  const view = views.find((v) => v.id === id) ?? views[0];

  for (const button of nav.querySelectorAll('button')) {
    if (button.dataset.view === view.id) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }

  title.textContent = view.title;
  location.hash = view.id;

  panel.replaceChildren();
  try {
    await view.render(panel);
  } catch (err) {
    panel.innerHTML = `<div class="card"><h2>Could not load this screen</h2><p class="muted"></p></div>`;
    panel.querySelector('p').textContent = err.message;
  }
}

function setupTheme() {
  const toggle = document.getElementById('theme-toggle');
  const stored = (() => {
    try {
      return localStorage.getItem('shopwise:theme');
    } catch {
      return null;
    }
  })();

  const apply = (theme) => {
    document.documentElement.dataset.theme = theme;
    toggle.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
  };

  apply(stored ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

  toggle.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    apply(next);
    try {
      localStorage.setItem('shopwise:theme', next);
    } catch {
      /* theme preference is a convenience, not required */
    }
  });
}

async function start() {
  setupTheme();
  meta = await api.get('/meta');
  document.getElementById('topbar-meta').textContent = `${meta.product} ${meta.version}`;
  buildNav();
  await show(location.hash.slice(1) || 'dashboard');
}

start().catch((err) => {
  panel.innerHTML = '<div class="card"><h2>ShopWise failed to start</h2><p class="muted"></p></div>';
  panel.querySelector('p').textContent = err.message;
});
