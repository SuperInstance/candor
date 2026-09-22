// test/predicates.test.mjs — deterministic predicates + gate-at-write.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PredicateRegistry, judge } from '../predicates.mjs';
import { MemoryLayer } from '../memory.mjs';

const noSecrets = p => typeof p === 'string' && !/api[_-]?key|secret|token/i.test(p);

test('registry: predicates are immutable — same name, different body throws', () => {
  const reg = new PredicateRegistry();
  reg.register('no-secrets', noSecrets);
  assert.throws(() => reg.register('no-secrets', p => p === 'x'),
    /immutable/);
  // Same body re-registered is idempotent (same committed source).
  const again = reg.register('no-secrets', noSecrets);
  assert.equal(again.hash, reg.get('no-secrets').hash);
});

test('registry: unregistered predicate is a loud error, not a pass', () => {
  const reg = new PredicateRegistry();
  assert.throws(() => reg.get('ghost'), /not registered/);
});

test('judge: normalizes boolean / object / throwing / non-verdict', () => {
  const reg = new PredicateRegistry();
  const boolP = reg.register('bool', p => p.length > 2);
  assert.deepEqual(judge(boolP, 'abc').pass, true);
  assert.equal(judge(boolP, 'ab').pass, false);
  const objP = reg.register('obj', p => ({ pass: false, detail: 'because' }));
  const v = judge(objP, 'x');
  assert.equal(v.pass, false);
  assert.equal(v.detail, 'because');
  const throwP = reg.register('throws', () => { throw new Error('boom'); });
  assert.equal(judge(throwP, 'x').pass, false);
  const weirdP = reg.register('weird', () => 42);
  assert.equal(judge(weirdP, 'x').pass, false);
});

test('gate-at-write: pass books PREDICATE-PASS and stores the payload', () => {
  const reg = new PredicateRegistry();
  const p = reg.register('no-secrets', noSecrets);
  const mem = new MemoryLayer({ predicates: reg });
  const { row, verdict, stored } = mem.rememberJudged('ns', p, 'harmless fact');
  assert.equal(verdict.pass, true);
  assert.equal(stored, true);
  assert.equal(row.note, 'PREDICATE-PASS');
  assert.equal(row.predicate, `no-secrets#${p.hash}`);
  assert.deepEqual(mem.recall('ns'),
    [{ predicate: row.predicate, payload: 'harmless fact' }]);
});

test('gate-at-write: refusal stores NOTHING but books visible evidence', () => {
  const reg = new PredicateRegistry();
  const p = reg.register('no-secrets', noSecrets);
  const mem = new MemoryLayer({ predicates: reg });
  const { row, verdict, stored } = mem.rememberJudged(
    'ns', p, 'my api_key is hunter2');
  assert.equal(verdict.pass, false);
  assert.equal(stored, false);
  assert.match(row.note, /^PREDICATE-REFUSAL: /);
  // The poison attempt is IN the chain: hash-committed payload, visible.
  assert.notEqual(row.payload_hash, '0'.repeat(16));
  assert.deepEqual(mem.recall('ns'), []);
  const names = mem.wal.rows.map(r => `${r.predicate}:${r.note}`);
  assert.ok(names.some(n => n.includes('PREDICATE-REFUSAL')));
  assert.ok(mem.wal.verify().ok);
});

test('judgment is deterministic across two layers (same registry, same verdicts)', () => {
  const reg = new PredicateRegistry();
  const p = reg.register('no-secrets', noSecrets);
  const a = new MemoryLayer({ predicates: reg });
  const b = new MemoryLayer({ predicates: reg });
  const va = a.rememberJudged('ns', p, 'clean');
  const vb = b.rememberJudged('ns', p, 'clean');
  assert.equal(va.row.predicate, vb.row.predicate);
  assert.equal(va.row.note, vb.row.note);
  assert.equal(va.row.payload_hash, vb.row.payload_hash);
  assert.equal(va.row.hash, vb.row.hash); // same writes, same chain — fully reproducible
});

test('persistence: judged store boots with registry and replay-reproduces', () => {
  const dir = mkdtempSync(join(tmpdir(), 'candor-pred-'));
  const file = join(dir, 'store.jsonl');
  const reg = new PredicateRegistry();
  const p = reg.register('no-secrets', noSecrets);
  const mem = new MemoryLayer({ predicates: reg, file });
  mem.rememberJudged('ns', p, 'clean fact');
  mem.rememberJudged('ns', p, 'api_token: leaked'); // refused, not stored
  assert.equal(mem.recall('ns').length, 1);

  const reopened = new MemoryLayer({ predicates: reg, file });
  assert.deepEqual(reopened.recall('ns'),
    [{ predicate: `no-secrets#${p.hash}`, payload: 'clean fact' }]);
  // Refused attempt survived the reload as chain evidence.
  assert.ok(reopened.wal.verify().ok);
  assert.ok(reopened.wal.rows.some(r => r.note.startsWith('PREDICATE-REFUSAL')));
});

test('boot refuses a judged store opened without its registry', () => {
  const dir = mkdtempSync(join(tmpdir(), 'candor-pred-'));
  const file = join(dir, 'store.jsonl');
  const reg = new PredicateRegistry();
  const p = reg.register('no-secrets', noSecrets);
  new MemoryLayer({ predicates: reg, file }).rememberJudged('ns', p, 'clean');
  assert.throws(() => new MemoryLayer({ file }),
    /no registry was supplied/);
});

test('boot refuses when stored judgment identity does not match the registry', () => {
  const dir = mkdtempSync(join(tmpdir(), 'candor-pred-'));
  const file = join(dir, 'store.jsonl');
  const reg = new PredicateRegistry();
  const p = reg.register('no-secrets', noSecrets);
  new MemoryLayer({ predicates: reg, file }).rememberJudged('ns', p, 'clean');
  // At-rest tamper of the predicate identity (payload hash untouched).
  const lines = readFileSync(file, 'utf8').trim().split('\n');
  const tampered = lines.map(line => {
    const rec = JSON.parse(line);
    if (rec.kind === 'payload' && rec.entry.predicate_id) {
      rec.entry.predicate_id.hash = '0'.repeat(16);
    }
    return JSON.stringify(rec);
  });
  writeFileSync(file, tampered.join('\n') + '\n');
  assert.throws(() => new MemoryLayer({ predicates: reg, file }),
    /identity mismatch/);
});

test('forget() interplay: judged pass can be revoked like any write', () => {
  const reg = new PredicateRegistry();
  const p = reg.register('no-secrets', noSecrets);
  const mem = new MemoryLayer({ predicates: reg });
  const { row } = mem.rememberJudged('ns', p, 'clean');
  mem.forget('ns', `no-secrets#${p.hash}`);
  assert.deepEqual(mem.recall('ns'), []);
  const audit = mem.audit('ns');
  assert.equal(audit[0].authority, 'revoked');
  assert.equal(audit[0].payload, 'clean'); // payload visible, authority void
  assert.ok(mem.wal.verify().ok);
  assert.ok(row.seq < mem.wal.rows.length);
});
