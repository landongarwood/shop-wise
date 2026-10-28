/**
 * Element building.
 *
 * `text` always goes through textContent, never innerHTML, so a product named
 * by the shopkeeper can never be interpreted as markup. There is no escape
 * hatch here on purpose: the only place that writes markup is icons.js, and
 * everything it writes is a literal in that file.
 */

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;

    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'for') node.htmlFor = value;
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }

  append(node, children);
  return node;
}

export function append(parent, children) {
  for (const child of [children].flat(4)) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

/** Shorthands for the tags this app actually uses. */
export const div = (props, children) => el('div', props, children);
export const span = (props, children) => el('span', props, children);
export const p = (props, children) => el('p', props, children);
export const button = (props, children) => el('button', { type: 'button', ...props }, children);
export const input = (props) => el('input', props);
export const label = (props, children) => el('label', props, children);
export const h1 = (props, children) => el('h1', props, children);
export const h2 = (props, children) => el('h2', props, children);
export const section = (props, children) => el('section', props, children);

/** Debounce, for search boxes that filter as the user types. */
export function debounce(fn, delay = 120) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
