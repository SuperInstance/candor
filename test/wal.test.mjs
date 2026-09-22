// test/wal.test.mjs — namespaced hash-chained receipt WAL + REVOKE pins
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CandorWAL, fnv1a64 } from '../wal.mjs';

test('write books a chain-linked receipt; verify re-derives', () => {
  const wal = new CandorWAL();
  const r1 = wal.write('memory.goals', 'insert', 'goal: ship receipts');
  const r2 = wal.write('memory.goals', 'insert', 'goal: verify chain');
  assert.equal(r1.seq, 0);
  assert.equal(r2.prev_hash, r1.hash);
  const v = wal.verify();
  assert.equal(v.ok, true);
  assert.deepEqual(v.rows.map(r => r.authority), ['live', 'live']);
});

test('same payload in different namespaces = different rows, both live', () => {
  const wal = new CandorWAL();
  wal.write('memory.goals', 'insert', 'shared payload');
  wal.write('memory.facts', 'insert', 'shared payload');
  const v = wal.verify();
  assert.equal(v.ok, true);
  assert.equal(v.rows.length, 2);
  assert.notEqual(v.rows[0].namespace, v.rows[1].namespace);
});

test('tampered payload_hash breaks the chain at that row', () => {
  const wal = new CandorWAL();
  wal.write('memory.goals', 'insert', 'clean');
  wal.write('memory.goals', 'insert', 'also clean');
  wal.rows[0].payload_hash = 'deadbeefdeadbeef'; // attacker swaps stored hash
  const v = wal.verify();
  assert.equal(v.ok, false);
  assert.equal(v.broken_at, 0);
});

test('REVOKE = authority-without-erasure: row stays, authority revoked', () => {
  const wal = new CandorWAL();
  const poisoned = wal.write('memory.goals', 'insert', 'MALLORY WAS HERE');
  const keep = wal.write('memory.goals', 'insert', 'legitimate goal');
  wal.write('memory.facts', 'insert', 'unrelated');
  const rv = wal.revoke('memory.goals', 'insert', 'memory-poisoning response');
  assert.equal(rv.note, 'REVOKE');
  const v = wal.verify();
  assert.equal(v.ok, true);
  // 4 rows still present — nothing erased
  assert.equal(v.rows.length, 4);
  assert.equal(wal.rows.find(r => r.seq === poisoned.seq).payload_hash,
    poisoned.payload_hash);
  assert.equal(v.rows[poisoned.seq].authority, 'revoked');
  assert.equal(v.rows[keep.seq].authority, 'revoked'); // same namespace+predicate
  assert.equal(v.rows[2].authority, 'live'); // other namespace untouched
  assert.equal(v.rows[3].authority, null); // the REVOKE row itself carries none
});

test('revoking nothing books an evidence REFUSAL row, never silent success', () => {
  const wal = new CandorWAL();
  wal.write('memory.goals', 'insert', 'x');
  const r = wal.revoke('memory.nope', 'insert');
  assert.equal(r.note, 'REVOKE-REFUSAL');
  assert.equal(r.authority, null);
  const v = wal.verify();
  assert.equal(v.ok, true);
  assert.equal(v.rows.length, 2); // refusal row itself is visible evidence
});

test('double revoke: second call is a REFUSAL (already inert)', () => {
  const wal = new CandorWAL();
  wal.write('memory.goals', 'insert', 'x');
  wal.revoke('memory.goals', 'insert');
  const again = wal.revoke('memory.goals', 'insert');
  assert.equal(again.note, 'REVOKE-REFUSAL');
});

test('REVOKE detail is hash-committed: tampering with it breaks verify', () => {
  const wal = new CandorWAL();
  wal.write('memory.goals', 'insert', 'x');
  wal.revoke('memory.goals', 'insert', 'original reason');
  wal.rows[1].detail = 'laundered reason';
  assert.equal(wal.verify().ok, false);
});

test('post-REVOKE writes in the same namespace are live again', () => {
  const wal = new CandorWAL();
  wal.write('memory.goals', 'insert', 'poisoned');
  wal.revoke('memory.goals', 'insert');
  wal.write('memory.goals', 'insert', 'clean rewrite');
  const v = wal.verify();
  assert.equal(v.ok, true);
  assert.equal(v.rows[0].authority, 'revoked');
  assert.equal(v.rows[2].authority, 'live');
});

test('fnv1a64 matches the fleet pinned café Δ 日本語 vector', () => {
  // Cross-language pin (jev-quilt JEV-SPEC §3): same bytes rule, UTF-8.
  // Canonical form drops the leading zero (jeviter pin: 16 digits).
  const h = fnv1a64(new TextEncoder().encode('café Δ 日本語'));
  assert.equal(h.toString(16), '24a555471370b18d');
});
