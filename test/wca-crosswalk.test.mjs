// test/wca-crosswalk.test.mjs — pin the WCA positioning honesty doctrine
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const doc = readFileSync(new URL('../docs/WCA-CROSSWALK.md', import.meta.url), 'utf8');

function section(title) {
  const marker = `## ${title}`;
  const start = doc.indexOf(marker);
  assert.ok(start >= 0, `docs/WCA-CROSSWALK.md must keep the "${title}" section`);
  const rest = doc.slice(start + marker.length);
  const next = rest.search(/^## /m);
  return next === -1 ? rest : rest.slice(0, next);
}

test('WCA crosswalk names the two real gaps as gaps', () => {
  const mapping = section('The mapping (fleet stack → WCA levels)');
  assert.ok(mapping.includes('**gap**: receipts-v2 signature envelope'));
  assert.ok(mapping.includes('**gap**: no independent RM process'));
});

test('WCA crosswalk claim discipline stays WCA-shaped, never compliant', () => {
  const mustNot = section('Claims the fleet must NOT make (honesty doctrine)');
  assert.ok(mustNot.includes('WCA-compliant'), 'the forbidden overclaim must be named');
  assert.ok(mustNot.includes('WCA-shaped'), 'the honest phrasing must be pinned');
  assert.ok(mustNot.includes('Signed receipts'), 'signature envelopes are designed, not shipped');
  assert.ok(mustNot.includes('Independent reference monitor'), 'the in-process trust domain must stay named');
  assert.ok(mustNot.includes('hash-chained'), 'current receipts are hash-chained only');
});
