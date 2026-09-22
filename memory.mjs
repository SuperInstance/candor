// memory.mjs — the first real memory caller through the candor WAL.
//
// candor v0 was a measurement instrument; this is the first layer that
// REMEMBERS through it. Every remember() books a namespaced hash-chained
// receipt (authority), while payloads live in this layer (storage) — the
// separation wal.mjs's header promises. forget() is authority-without-
// erasure: the payload stays in the store, marked inert, visible to audit().
//
// Persistence: optional JSONL file. WAL rows and payloads are written as
// separate line kinds; boot replays the WAL and RE-VERIFIES every hash and
// link before serving a single recall (replay-verify, the D10 doctrine —
// waking is replay-verify, not snapshot trust). A tampered store is refused
// at boot, loudly, with the row that broke.
//
// Honest limits: single-writer in-process (no cross-node non-repudiation —
// receipts-v2 envelope, deferred); predicates are caller-named strings, the
// WAL books claims it does not judge; recall() answers "what is live
// authority" — truth of payloads is the memory layer's own problem.

import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { CandorWAL, fnv1a64 } from './wal.mjs';

export class MemoryLayer {
  constructor({ wal, authority = 'memory', file } = {}) {
    this.wal = wal ?? new CandorWAL({ authority });
    this.authority = authority;
    this.file = file;
    // namespace -> [{ predicate, payload, receipt_seq }]
    this.store = new Map();
    if (file && existsSync(file)) this.#load(file);
  }

  #entries(ns) {
    if (!this.store.has(ns)) this.store.set(ns, []);
    return this.store.get(ns);
  }

  // Boot: replay rows, re-deriving every hash and link BEFORE any payload
  // is served. A store that fails verification is refused, not repaired
  // silently — a repaired chain would launder exactly the tamper the WAL
  // exists to catch.
  #load(file) {
    const wal = this.wal;
    const payloads = [];
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line) continue;
      const rec = JSON.parse(line);
      if (rec.kind === 'row') {
        const row = rec.row;
        // Rows are replayed verbatim; re-derivation happens in verify()
        // below, before any payload is served.
        wal.rows.push(row);
        wal.tip = row.hash;
        if (row.note === 'REVOKE') {
          for (const r of wal.rows) {
            if (r.seq < row.seq && r.namespace === row.namespace
                && r.predicate === row.predicate && r.authority !== null) {
              wal.revokedSeqs.add(r.seq);
            }
          }
        }
      } else if (rec.kind === 'payload') {
        payloads.push(rec);
      }
    }
    const v = wal.verify();
    if (!v.ok) {
      throw new Error(
        `memory store refused: chain broken at row ${v.broken_at} — ` +
        'the store was tampered or truncated; restore from a verified copy');
    }
    for (const p of payloads) {
      const expect = fnv1a64(new TextEncoder().encode(String(p.entry.payload)))
        .toString(16).padStart(16, '0');
      if (p.entry.payload_hash !== expect) {
        throw new Error('memory store refused: payload at receipt ' +
          p.entry.receipt_seq + ' fails re-derivation — at-rest tamper');
      }
      this.#entries(p.namespace).push(p.entry);
    }
  }

  #persist(line) {
    if (!this.file) return;
    appendFileSync(this.file, JSON.stringify(line) + '\n');
  }

  // Book the write, then store the payload. Order matters: authority is
  // booked even if the store write fails, so a crash between the two never
  // leaves a payload with unbooked provenance.
  remember(namespace, predicate, payload, note) {
    const row = this.wal.write(namespace, predicate, payload, note);
    // The payload store is ALSO hash-committed: at-rest tamper is refused
    // at boot, not silently served. (The receipt commits that a write
    // happened; this hash commits to WHAT was written.)
    const entry = { predicate, payload, receipt_seq: row.seq,
      payload_hash: fnv1a64(new TextEncoder().encode(String(payload)))
        .toString(16).padStart(16, '0') };
    this.#entries(namespace).push(entry);
    this.#persist({ kind: 'row', row });
    this.#persist({ kind: 'payload', namespace, entry });
    return row;
  }

  // Authority-without-erasure: the payloads stay; their authority is void.
  // Returns the WAL row (REVOKE or REVOKE-REFUSAL) so callers can see
  // whether anything was actually voided.
  forget(namespace, predicate, note) {
    const row = this.wal.revoke(namespace, predicate, note);
    // The REVOKE row is part of the chain — a forget that isn't persisted
    // amputates the chain at reload (the next row's prev_hash points at a
    // row the store never recorded).
    this.#persist({ kind: 'row', row });
    return row;
  }

  // Live memory: entries whose receipt authority is still live. Revoked
  // payloads are GONE from recall but NOT from the store — that asymmetry
  // is the whole defense (no-delete; the poison stays visible in audit).
  recall(namespace) {
    const v = this.wal.verify();
    if (!v.ok) throw new Error(`WAL chain broken at row ${v.broken_at}`);
    const live = new Set(
      v.rows.filter(r => r.authority === 'live').map(r => r.seq));
    return (this.store.get(namespace) ?? [])
      .filter(e => live.has(e.receipt_seq))
      .map(e => ({ predicate: e.predicate, payload: e.payload }));
  }

  // The candor view: everything in the namespace, live or inert, with the
  // authority verdict per entry. Poisoned-then-revoked writes are HERE,
  // visible — erasure would leave nothing to study.
  audit(namespace) {
    const v = this.wal.verify();
    if (!v.ok) throw new Error(`WAL chain broken at row ${v.broken_at}`);
    const verdict = new Map(v.rows.map(r => [r.seq, r.authority]));
    return (this.store.get(namespace) ?? []).map(e => ({
      predicate: e.predicate,
      payload: e.payload,
      receipt_seq: e.receipt_seq,
      authority: verdict.get(e.receipt_seq) ?? 'unknown',
    }));
  }
}

