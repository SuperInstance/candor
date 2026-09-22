// test/memory.test.mjs — the first real memory caller: remember/recall/
// forget through the namespaced receipt WAL, with boot-time replay-verify.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryLayer } from '../memory.mjs';
import { CandorWAL } from '../wal.mjs';

function tmpfile() {
  return join(mkdtempSync(join(tmpdir(), 'candor-mem-')), 'store.jsonl');
}

test('remember books a receipt; recall returns the live payload', () => {
  const mem = new MemoryLayer();
  mem.remember('memory.goals', 'insert', 'goal: ship receipts');
  assert.deepEqual(mem.recall('memory.goals'),
    [{ predicate: 'insert', payload: 'goal: ship receipts' }]);
  assert.deepEqual(mem.recall('memory.other'), []);
});

test('forget = authority-without-erasure: recall drops it, audit keeps it visible', () => {
  const mem = new MemoryLayer();
  mem.remember('memory.goals', 'insert', 'clean goal');
  mem.remember('memory.goals', 'insert', 'poisoned goal');
  const row = mem.forget('memory.goals', 'insert',
    'row 1 payload matched poisoning signature');
  assert.equal(row.note, 'REVOKE');
  // Both rows had the same predicate, so both lose authority — the WAL
  // revokes by (namespace, predicate); recall-empty is the honest result.
  assert.deepEqual(mem.recall('memory.goals'), []);
  const audited = mem.audit('memory.goals');
  assert.equal(audited.length, 2);
  assert.ok(audited.every(e => e.authority === 'revoked'));
  assert.ok(audited.some(e => e.payload === 'poisoned goal'));
});

test('forget on nothing is a visible REFUSAL, memory untouched', () => {
  const mem = new MemoryLayer();
  const row = mem.forget('memory.empty', 'insert', 'nothing to void');
  assert.equal(row.note, 'REVOKE-REFUSAL');
  assert.equal(mem.wal.verify().ok, true);
});

test('namespaces are independent: revoking one leaves the other live', () => {
  const mem = new MemoryLayer();
  mem.remember('memory.goals', 'insert', 'g');
  mem.remember('memory.facts', 'insert', 'f');
  mem.forget('memory.goals', 'insert', 'goals compromised');
  assert.deepEqual(mem.recall('memory.goals'), []);
  assert.deepEqual(mem.recall('memory.facts'),
    [{ predicate: 'insert', payload: 'f' }]);
});

test('persistence: reload from JSONL serves the same live memory', () => {
  const file = tmpfile();
  const mem = new MemoryLayer({ file });
  mem.remember('memory.goals', 'insert', 'survives reboot');
  mem.forget('memory.goals', 'insert', 'then revoked');
  mem.remember('memory.facts', 'insert', 'still live');

  const reloaded = new MemoryLayer({ file });
  assert.deepEqual(reloaded.recall('memory.goals'), []);
  assert.deepEqual(reloaded.recall('memory.facts'),
    [{ predicate: 'insert', payload: 'still live' }]);
  const audited = reloaded.audit('memory.goals');
  assert.equal(audited.length, 1);
  assert.equal(audited[0].authority, 'revoked');
  rmSync(file, { force: true });
});

test('boot refuses a tampered payload store — at-rest tamper caught', () => {
  const file = tmpfile();
  const mem = new MemoryLayer({ file });
  mem.remember('memory.goals', 'insert', 'original');
  const lines = readFileSync(file, 'utf8').trim().split('\n');
  const payloadLine = lines.findIndex(l => l.includes('"payload"'));
  lines[payloadLine] = lines[payloadLine].replace('original', 'INJECTED');
  writeFileSync(file, lines.join('\n') + '\n');
  assert.throws(() => new MemoryLayer({ file }),
    /payload at receipt 0 fails re-derivation/);
  rmSync(file, { force: true });
});

test('boot refuses a tampered WAL row, loudly, with the broken row', () => {
  const file = tmpfile();
  const mem = new MemoryLayer({ file });
  mem.remember('memory.goals', 'insert', 'original');
  const lines = readFileSync(file, 'utf8').trim().split('\n');
  const rowLine = lines.findIndex(l => l.includes('"kind":"row"'));
  lines[rowLine] = lines[rowLine].replace('"insert"', '"forged-predicate"');
  writeFileSync(file, lines.join('\n') + '\n');
  assert.throws(() => new MemoryLayer({ file }),
    /chain broken at row 0/);
  rmSync(file, { force: true });
});

test('receipt booking precedes store write: authority never lags payload', () => {
  const mem = new MemoryLayer();
  const row = mem.remember('memory.goals', 'insert', 'x');
  assert.equal(row.seq, 0);
  assert.equal(row.namespace, 'memory.goals');
  // The WAL alone can prove the write happened, payload unseen.
  const v = new CandorWAL();
  v.rows = mem.wal.rows;
  assert.equal(v.verify().ok, true);
});

test('pre-hashed payloads (16-hex) pass through unchanged', () => {
  const mem = new MemoryLayer();
  const row = mem.remember('memory.facts', 'insert', '0123456789abcdef');
  assert.equal(row.payload_hash, '0123456789abcdef');
});
