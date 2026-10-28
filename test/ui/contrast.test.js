'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, describe } = require('node:test');

const config = require('../../src/config');

/**
 * Contrast is measurable, so it is measured rather than eyeballed.
 *
 * The pairs are grouped by what the ratio actually has to buy, because one
 * blanket threshold is wrong in both directions — it lets bad text through and
 * forces heavy, dated borders:
 *
 *  - Text must be readable: WCAG AA, 4.5:1, no argument.
 *  - Anything that carries state on its own — a status dot, a primary button,
 *    the focus ring — is non-text information under WCAG 1.4.11, so 3:1.
 *  - A control's outline is supplementary: the control is already identified by
 *    its fill, its label and its elevation. Shipping products sit around
 *    1.2-1.5 here (GitHub ~1.4, Stripe and Tailwind ~1.2) and demanding 3:1
 *    would mean grey slabs around every button.
 *  - A divider only has to be seen. A hover fill only has to be felt.
 *
 * Both themes are checked, because a palette is easy to fix in one and forget
 * in the other.
 */

const READABLE = 4.5;
const STATEFUL = 3;
const OUTLINE = 1.4;
const DIVIDER = 1.2;
const FILL_SHIFT = 1.05;

const TEXT_PAIRS = [
  ['--text', '--bg', 'body text on the page'],
  ['--text', '--surface', 'body text on a panel'],
  ['--text', '--surface-sunken', 'body text on a sunken surface'],
  ['--text', '--surface-hover', 'body text on a hovered row'],
  ['--text-soft', '--bg', 'secondary text on the page'],
  ['--text-soft', '--surface', 'secondary text on a panel'],
  ['--text-soft', '--surface-sunken', 'secondary text on a sunken surface'],
  ['--text-faint', '--bg', 'tertiary text on the page'],
  ['--text-faint', '--surface', 'tertiary text on a panel'],
  ['--accent-text', '--accent', 'the label on a primary button'],
  ['--accent', '--accent-soft', 'an accent label on its soft fill'],
  ['--accent', '--surface', 'an accent label on a panel'],
  ['--debt', '--bg', 'a debt figure on the page'],
  ['--debt', '--surface', 'a debt figure on a panel'],
  ['--debt', '--debt-soft', 'the text of a debt badge'],
  ['--paid', '--bg', 'a paid figure on the page'],
  ['--paid', '--surface', 'a paid figure on a panel'],
  ['--paid', '--paid-soft', 'the text of a paid badge'],
  ['--warn', '--bg', 'a warning figure on the page'],
  ['--warn', '--warn-soft', 'the text of a warning badge'],
  ['--notice-text', '--notice-ok', 'the saved notification'],
  ['--notice-text', '--notice-warn', 'the warning notification'],
  ['--notice-text', '--notice-error', 'the error notification'],
];

/** Non-text information: meaning would be lost if these were not distinct. */
const STATEFUL_PAIRS = [
  ['--accent', '--bg', 'a primary button against the page'],
  ['--debt', '--surface', 'the out-of-stock dot'],
  ['--paid', '--surface', 'the in-stock dot'],
  ['--warn', '--surface', 'the running-low dot'],
];

const OUTLINE_PAIRS = [
  ['--border-strong', '--surface', "a control's outline against its own fill"],
  ['--border-strong', '--bg', "a control's outline against the page"],
];

const DIVIDER_PAIRS = [
  ['--border', '--bg', 'a table row divider on the page'],
  ['--border', '--surface', 'a divider on a panel'],
];

const FILL_PAIRS = [
  ['--surface-sunken', '--bg', 'a sunken fill against the page'],
  ['--surface-hover', '--surface', 'a hovered row against a panel'],
  ['--surface-active', '--surface-sunken', 'a pressed control against its resting fill'],
];

function parseThemes(css) {
  const block = (marker) => {
    const start = css.indexOf(marker);
    if (start === -1) return {};

    const open = css.indexOf('{', start);
    const close = css.indexOf('}', open);

    return Object.fromEntries(
      [...css.slice(open + 1, close).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)].map((match) => [
        match[1],
        match[2].trim(),
      ])
    );
  };

  const light = block(':root {');
  return { light, dark: { ...light, ...block(":root[data-theme='dark']") } };
}

function toRgb(value) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(value).trim());
  assert.ok(match, `not a six-digit hex colour: ${value}`);

  const number = parseInt(match[1], 16);
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}

function luminance(rgb) {
  const channel = (value) => {
    const fraction = value / 255;
    return fraction <= 0.03928 ? fraction / 12.92 : ((fraction + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function contrast(foreground, background) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

const themes = parseThemes(fs.readFileSync(path.join(config.uiDir, 'styles', 'tokens.css'), 'utf8'));

describe('colour contrast', () => {
  for (const [name, tokens] of Object.entries(themes)) {
    describe(`${name} theme`, () => {
      const ratioFor = (foreground, background) => {
        assert.ok(tokens[foreground], `missing token ${foreground}`);
        assert.ok(tokens[background], `missing token ${background}`);
        return contrast(toRgb(tokens[foreground]), toRgb(tokens[background]));
      };

      const expectAll = (pairs, minimum, description) => {
        const failures = pairs
          .map(([foreground, background, what]) => {
            const ratio = ratioFor(foreground, background);
            return ratio >= minimum ? null : `${what}: ${ratio.toFixed(2)}:1 (${foreground} on ${background})`;
          })
          .filter(Boolean);

        assert.deepEqual(failures, [], `${description} — wanted ${minimum}:1`);
      };

      test('text is readable on every surface it sits on', () => {
        expectAll(TEXT_PAIRS, READABLE, 'unreadable text');
      });

      test('anything that carries meaning by colour alone stands out', () => {
        expectAll(STATEFUL_PAIRS, STATEFUL, 'state not distinguishable');
      });

      test('control outlines are visible against both their fill and the page', () => {
        expectAll(OUTLINE_PAIRS, OUTLINE, 'invisible control edges');
      });

      test('dividers can be seen', () => {
        expectAll(DIVIDER_PAIRS, DIVIDER, 'invisible dividers');
      });

      test('fills shift enough to register', () => {
        expectAll(FILL_PAIRS, FILL_SHIFT, 'fills indistinguishable');
      });
    });
  }
});
