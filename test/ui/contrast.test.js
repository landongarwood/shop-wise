'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, describe } = require('node:test');

const config = require('../../src/config');

/**
 * Contrast is measurable, so it is measured rather than eyeballed.
 *
 * Every pair below is something the user has to tell apart: a word from what it
 * sits on, a control's edge from its fill, a divider from the page. The targets
 * are the WCAG ones — 4.5:1 for body text, 3:1 for interface boundaries — and
 * dividers get a lower bar because they only have to be seen, not read.
 *
 * Both themes are checked, because a palette is easy to fix in one and forget
 * in the other.
 */

const TEXT_MIN = 4.5;
const UI_MIN = 3;

const TEXT_PAIRS = [
  ['--text', '--bg', 'body text on the page'],
  ['--text', '--surface', 'body text on a panel'],
  ['--text', '--surface-sunken', 'body text on a sunken surface'],
  ['--text', '--surface-hover', 'body text on a hovered row'],
  ['--text-soft', '--bg', 'secondary text on the page'],
  ['--text-soft', '--surface', 'secondary text on a panel'],
  ['--text-faint', '--bg', 'tertiary text on the page'],
  ['--text-faint', '--surface', 'tertiary text on a panel'],
  ['--accent-text', '--accent', 'label on a primary button'],
  ['--accent', '--accent-soft', 'accent label on its soft fill'],
  ['--accent', '--surface', 'accent label on a panel'],
  ['--debt', '--bg', 'debt figure on the page'],
  ['--debt', '--surface', 'debt figure on a panel'],
  ['--debt', '--debt-soft', 'debt badge text'],
  ['--paid', '--bg', 'paid figure on the page'],
  ['--paid', '--surface', 'paid figure on a panel'],
  ['--paid', '--paid-soft', 'paid badge text'],
  ['--warn', '--bg', 'warning figure on the page'],
  ['--warn', '--warn-soft', 'warning badge text'],
  ['--notice-text', '--notice-ok', 'saved notification'],
  ['--notice-text', '--notice-warn', 'warning notification'],
  ['--notice-text', '--notice-error', 'error notification'],
];

const UI_PAIRS = [
  ['--border-strong', '--surface', "a control's outline against its own fill"],
  ['--border-strong', '--bg', "a control's outline against the page"],
  ['--accent', '--bg', 'a primary button against the page'],
  ['--debt', '--surface', 'the out-of-stock dot'],
  ['--paid', '--surface', 'the in-stock dot'],
  ['--warn', '--surface', 'the running-low dot'],
];

/** Separation only has to be visible, so these bars are lower but not absent. */
const SEPARATORS = [
  ['--border', '--bg', 1.35, 'a table row divider on the page'],
  ['--border', '--surface', 1.35, 'a divider on a panel'],
  ['--surface', '--bg', 1.06, 'a panel against the page'],
  ['--surface-sunken', '--bg', 1.06, 'a hovered control against the page'],
  ['--surface-hover', '--surface', 1.06, 'a hovered row against a panel'],
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

      test('text is readable on every surface it sits on', () => {
        const failures = TEXT_PAIRS.map(([foreground, background, what]) => {
          const ratio = ratioFor(foreground, background);
          return ratio >= TEXT_MIN ? null : `${what}: ${ratio.toFixed(2)}:1 (${foreground} on ${background})`;
        }).filter(Boolean);

        assert.deepEqual(failures, [], `below ${TEXT_MIN}:1`);
      });

      test('controls and status colours stand out from their background', () => {
        const failures = UI_PAIRS.map(([foreground, background, what]) => {
          const ratio = ratioFor(foreground, background);
          return ratio >= UI_MIN ? null : `${what}: ${ratio.toFixed(2)}:1 (${foreground} on ${background})`;
        }).filter(Boolean);

        assert.deepEqual(failures, [], `below ${UI_MIN}:1`);
      });

      test('surfaces and dividers are distinguishable from what is behind them', () => {
        const failures = SEPARATORS.map(([foreground, background, minimum, what]) => {
          const ratio = ratioFor(foreground, background);
          return ratio >= minimum ? null : `${what}: ${ratio.toFixed(3)}:1, wanted ${minimum}`;
        }).filter(Boolean);

        assert.deepEqual(failures, [], 'too close to see');
      });
    });
  }
});
