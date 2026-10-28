import { div, button, append, clear, h1, el } from './dom.js';
import { icon } from './icons.js';

/**
 * Navigation as a stack of tasks, not a tree of pages.
 *
 * The home screen is the root. Starting a task pushes a screen; finishing or
 * abandoning it pops back. There is therefore always exactly one way back, in
 * one place, and the user can never end up somewhere they cannot leave.
 */
export class Navigator {
  /**
   * @param {object} deps
   * @param {HTMLElement} deps.appbar
   * @param {HTMLElement} deps.host  where screen bodies are rendered
   * @param {Record<string, Function>} deps.routes
   * @param {object} deps.app shared application context given to every screen
   */
  constructor({ appbar, host, routes, app }) {
    this.appbar = appbar;
    this.host = host;
    this.routes = routes;
    this.app = app;
    this.stack = [];

    window.addEventListener('keydown', (event) => {
      // Escape backs out of a task, unless a sheet is open and handling it.
      if (event.key === 'Escape' && !document.querySelector('.sheet-backdrop') && this.stack.length > 1) {
        this.back();
      }
    });
  }

  get current() {
    return this.stack.at(-1) ?? null;
  }

  async go(name, params = {}, { replace = false } = {}) {
    if (!this.routes[name]) throw new Error(`Unknown screen: ${name}`);

    if (replace) this.stack.pop();
    this.stack.push({ name, params });
    return this.#render();
  }

  /** Replaces the whole stack: used when a task finishes and we go home. */
  async root(name = 'home', params = {}) {
    this.stack = [];
    return this.go(name, params);
  }

  async back() {
    if (this.stack.length <= 1) return undefined;
    this.stack.pop();
    return this.#render();
  }

  /** Re-runs the current screen, picking up whatever has just been saved. */
  async reload() {
    return this.#render();
  }

  async #render() {
    const entry = this.current;
    if (!entry) return;

    const context = {
      ...this.app,
      params: entry.params,
      go: (name, params, options) => this.go(name, params, options),
      back: () => this.back(),
      root: (name, params) => this.root(name, params),
      reload: () => this.reload(),
      // A task screen's subtitle changes as the task progresses — once a
      // customer is chosen it should say who, not keep asking.
      setSubtitle: (value) => {
        if (this.subtitleNode) this.subtitleNode.textContent = value ?? '';
      },
    };

    let screen;
    try {
      screen = await this.routes[entry.name](context);
    } catch (err) {
      screen = errorScreen(err, () => this.reload());
    }

    this.#renderAppbar(screen);

    clear(this.host);
    append(this.host, screen.body);
    this.host.scrollTop = 0;
  }

  #renderAppbar(screen) {
    clear(this.appbar);

    const canGoBack = this.stack.length > 1;

    // Always present, so setSubtitle has something to write into later.
    this.subtitleNode = div({ class: 'appbar__subtitle', text: screen.subtitle ?? '' });

    append(this.appbar, [
      canGoBack
        ? button(
            { class: 'appbar__back', ariaLabel: 'Back', onclick: () => this.back() },
            icon('back', { size: 18 })
          )
        : // At the root there is nowhere to go back to, so the mark sits there
          // instead and the header is never left with a bare title.
          div({ class: 'appbar__brand' }, el('img', { src: '/assets/logo.svg', alt: '', width: 36, height: 36 })),

      div({ class: 'appbar__titles' }, [
        h1({ class: 'appbar__title', text: screen.title }),
        this.subtitleNode,
      ]),

      div(
        { class: 'appbar__actions' },
        (screen.actions ?? []).map((action) =>
          button(
            {
              class: action.primary ? 'button button--primary' : 'icon-button',
              ariaLabel: action.label,
              title: action.label,
              onclick: action.onClick,
            },
            action.primary ? [icon(action.icon, { size: 18 }), action.label] : icon(action.icon, { size: 20 })
          )
        )
      ),
    ]);
  }
}

function errorScreen(err, retry) {
  return {
    title: 'Something went wrong',
    body: div({ class: 'empty' }, [
      div({ class: 'empty__title', text: 'This screen could not be loaded' }),
      div({ text: err.message }),
      button({ class: 'button', text: 'Try again', onclick: retry }),
    ]),
  };
}
