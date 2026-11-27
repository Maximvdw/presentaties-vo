import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initPresentation } from '../js/presentation.js';

test('logo follows the current slide after initialization and navigation', async (t) => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  t.after(() => {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  });

  const slide = (isTitle) => ({
    classList: { contains: (name) => name === 'title-slide' && isTitle },
    querySelectorAll: () => [],
    querySelector: () => null,
  });
  const title = slide(true);
  const content = slide(false);

  for (const [hash, current, expectedInitial] of [
    ['', title, true],
    ['#/1', content, false],
    ['#/uitdaging-adoptie', content, false],
    ['#/named-title', title, false],
  ]) {
    const classes = new Set();
    const root = {
      classList: {
        add: (name) => classes.add(name),
        toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
      },
    };
    const listeners = {};
    let activeSlide = current;
    globalThis.window = {
      location: { hash },
      Reveal: {
        getCurrentSlide: () => activeSlide,
        on: (event, callback) => { listeners[event] = callback; },
      },
    };
    globalThis.document = {
      querySelector: () => root,
      querySelectorAll: (selector) => selector === '.reveal .slides > section' ? [title, content] : [],
    };

    initPresentation({ initialize: () => Promise.resolve() });
    assert.equal(classes.has('is-title-slide'), expectedInitial, hash);
    await Promise.resolve();
    assert.equal(classes.has('is-title-slide'), current === title, hash);

    activeSlide = current === title ? content : title;
    listeners.slidechanged();
    assert.equal(classes.has('is-title-slide'), activeSlide === title, hash);
  }
});
