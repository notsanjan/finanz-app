import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

test('APP_VERSION in app.js passt zu version.txt', () => {
  const v = readFileSync(new URL('../version.txt', import.meta.url), 'utf8').trim();
  const js = readFileSync(new URL('../www/js/app.js', import.meta.url), 'utf8');
  assert.match(js, new RegExp(`APP_VERSION = '${v}'`));
});
