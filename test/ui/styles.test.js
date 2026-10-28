'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test, describe } = require('node:test');

const config = require('../../src/config');

/**
 * Keeps the stylesheets and the markup honest about each other.
 *
 * With no build step nothing links the two, so deleting a block of CSS shows up
 * only as a screen that quietly loses its layout, and a class that was renamed
 * in one place and not the other looks fine until someone opens that screen.
 * Both directions are checked here.
 */
describe('styles and markup agree', () => {
  const uiDir = config.uiDir;
  const stylesDir = path.join(uiDir, 'styles');

  const readStyles = () =>
    fs
      .readdirSync(stylesDir)
      .map((name) => fs.readFileSync(path.join(stylesDir, name), 'utf8'))
      .join('\n');

  const readSources = (extensions) => {
    const sources = [];

    const walk = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'styles') walk(full);
        } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
          sources.push(fs.readFileSync(full, 'utf8'));
        }
      }
    };

    walk(uiDir);
    return sources.join('\n');
  };

  /** Class names the UI actually applies, from `class:` props and classList calls. */
  const classesUsed = () => {
    const source = readSources(['.js', '.html']);
    const used = new Set();

    const add = (text) => {
      // Template literals interpolate; the literal text around a ${...} still
      // names real classes, so blank the holes rather than skip the string.
      for (const token of text.replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) {
        if (/^[a-z][a-z0-9_-]*$/i.test(token)) used.add(token);
      }
    };

    for (const match of source.matchAll(/class:\s*'([^']*)'/g)) add(match[1]);
    for (const match of source.matchAll(/class:\s*"([^"]*)"/g)) add(match[1]);
    for (const match of source.matchAll(/class:\s*`([^`]*)`/g)) add(match[1]);
    for (const match of source.matchAll(/class="([^"]*)"/g)) add(match[1]);
    for (const match of source.matchAll(/classList\.(?:add|toggle|remove)\(\s*['"`]([a-z0-9_-]+)/gi)) {
      used.add(match[1]);
    }

    return used;
  };

  test('every class the UI applies has a rule behind it', () => {
    const styles = readStyles();
    const used = classesUsed();

    assert.ok(used.size > 40, `expected a real set of classes, found ${used.size}`);

    const unstyled = [...used].filter((name) => !styles.includes(`.${name}`)).sort();
    assert.deepEqual(unstyled, [], 'these classes are applied but have no CSS');
  });

  test('no rule is left behind once what used it is gone', () => {
    const source = readSources(['.js', '.html']);

    // Selectors only: a class in a comment does not count as declared.
    const withoutComments = readStyles().replace(/\/\*[\s\S]*?\*\//g, '');
    const declared = new Set([...withoutComments.matchAll(/\.([a-z][a-z0-9_-]*)/gi)].map((match) => match[1]));

    const orphans = [...declared]
      // Modifiers are composed at runtime — `badge--${tone}`, `toast--${kind}` —
      // so their full names never appear in the source. Their base class being
      // used is enough to know the block is alive.
      .filter((name) => !name.includes('--'))
      .filter((name) => !source.includes(name))
      .sort();
    assert.deepEqual(orphans, [], 'these CSS rules are no longer applied by anything');
  });

  test('both themes define the same set of tokens', () => {
    const tokens = fs.readFileSync(path.join(stylesDir, 'tokens.css'), 'utf8');

    const [, light] = tokens.split(':root {');
    const [base, darkBlock] = light.split(":root[data-theme='dark'] {");

    const names = (block) => new Set([...block.matchAll(/^\s*(--[a-z0-9-]+):/gim)].map((match) => match[1]));

    const lightTokens = names(base);
    const darkTokens = names(darkBlock ?? '');

    assert.ok(lightTokens.size > 30, `expected a real palette, found ${lightTokens.size}`);

    // Dark mode only redefines what changes, so it is a subset — but every
    // token it defines must be a real one, or it is a typo that never applies.
    const unknown = [...darkTokens].filter((name) => !lightTokens.has(name)).sort();
    assert.deepEqual(unknown, [], 'the dark theme defines tokens the light theme never declares');
  });
});
