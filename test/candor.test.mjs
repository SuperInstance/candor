// Acceptance tests for candor v0 (lane T²).
//   1. mapping determinism            — same transcript → same geometry, twice
//   2. vendored law sanity            — R(0) = 1 exactly (quilt-floor probe pin)
//   3. re-measurement stability       — honest error re-twists LESS than a lie
//   4. separation                     — three corpora → three distinct signatures
//   5. strain ordering                — honest moves > lie re-asserts > costume holds
//   6. fixture provenance labels      — every corpus carries labeled + provenance
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  TwistField,
  mapGlyphs,
  measureCorpus,
  loadCorpus,
  speakerAnchor,
  fnv1a,
} from '../candor.mjs';

const CORPORA_DIR = new URL('../corpora/', import.meta.url).pathname;
const corpusFiles = readdirSync(CORPORA_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
const corpora = Object.fromEntries(
  corpusFiles.map((f) => {
    const c = loadCorpus(join(CORPORA_DIR, f));
    return [c.corpus, c];
  })
);
const measured = Object.fromEntries(
  Object.entries(corpora).map(([k, c]) => [k, measureCorpus(c)])
);

test('mapping determinism: same transcript → same geometry, twice', () => {
  for (const c of Object.values(corpora)) {
    const a = mapGlyphs(c.lines);
    const b = mapGlyphs(c.lines);
    assert.deepStrictEqual(a.points, b.points);
    assert.deepStrictEqual(a.headings, b.headings);
  }
  for (const [k, m] of Object.entries(measured)) {
    const again = measureCorpus(corpora[k]);
    assert.equal(m.signature, again.signature);
    assert.deepStrictEqual(m.metrics, again.metrics);
  }
});

test('vendored law: R(0) = 1 exactly (quilt-floor probe pin)', () => {
  const { points } = mapGlyphs(corpora['honest-error'].lines);
  const tf = new TwistField(points);
  assert.equal(tf.registration(0), 1);
  // cloud law is the small-angle closed form of the same instrument
  const theta = 0.5;
  const measured = tf.registration(theta);
  const cloud = tf.cloudLaw(theta);
  assert.ok(Math.abs(measured - cloud) / cloud < 0.05,
    `cloud law should track registration at small θ (got ${measured} vs ${cloud})`);
});

test('re-measurement stability: an honest error re-twists less than a lie', () => {
  const honest = measured['honest-error'].metrics.re_twist_rate;
  const lying = measured['lying'].metrics.re_twist_rate;
  assert.ok(honest < lying,
    `honest (${honest}) must re-twist less than lying (${lying}) — re-measurement drift without new load is the lie's tell`);
});

test('separation: the three corpora give three distinct signatures', () => {
  const sigs = Object.values(measured).map((m) => m.signature);
  assert.equal(new Set(sigs).size, 3, `expected 3 distinct signatures, got ${sigs.join(', ')}`);
  assert.equal(measured['honest-error'].signature, 'shear');
  assert.equal(measured['lying'].signature, 're-twist');
  assert.equal(measured['costume'].signature, 'flat');
});

test('strain ordering: honest moves > lie re-asserts > costume holds still', () => {
  const r = (k) => measured[k].metrics.surprise_mean_response_over_s;
  assert.ok(r('honest-error') > r('lying'), `honest (${r('honest-error')}) should out-respond lying (${r('lying')})`);
  assert.ok(r('lying') > r('costume'), `lying (${r('lying')}) should out-respond costume (${r('costume')})`);
  assert.equal(measured['honest-error'].metrics.flatness, 0,
    'honest material deforms — flatness must be 0');
});

test('fixture provenance labels: every corpus carries labeled + provenance', () => {
  assert.ok(corpusFiles.length >= 3, 'at least three fixtures');
  for (const f of corpusFiles) {
    const raw = JSON.parse(readFileSync(join(CORPORA_DIR, f), 'utf8'));
    assert.ok(['REAL', 'SYNTHETIC'].includes(raw.labeled),
      `${f}: labeled must be REAL|SYNTHETIC, got ${raw.labeled}`);
    assert.ok(raw.provenance && typeof raw.provenance === 'object' && Object.keys(raw.provenance).length > 0,
      `${f}: provenance must be a non-empty object`);
    assert.ok(Array.isArray(raw.lines) && raw.lines.length >= 4, `${f}: need ≥4 lines to window`);
  }
  // at least one REAL fixture from the commune harness (mission: real shapes first)
  const real = Object.values(corpora).filter((c) => c.labeled === 'REAL');
  assert.ok(real.length >= 1, 'at least one REAL commune-harness fixture required');
  assert.ok(real.every((c) => JSON.stringify(c.provenance).includes('commune-harness')),
    'REAL fixtures must cite commune-harness provenance');
});

test('speaker anchors are deterministic and unit-length', () => {
  const a = speakerAnchor('Mara');
  const b = speakerAnchor('Mara');
  assert.deepStrictEqual(a, b);
  assert.ok(Math.abs(Math.hypot(...a) - 1) < 1e-12);
  assert.notDeepStrictEqual(speakerAnchor('Mara'), speakerAnchor('Corvan'));
});

test('fnv1a is stable across calls (hash channel determinism)', () => {
  assert.equal(fnv1a('the comb is missing a tooth'), fnv1a('the comb is missing a tooth'));
  assert.notEqual(fnv1a('tooth'), fnv1a('teeth'));
});
