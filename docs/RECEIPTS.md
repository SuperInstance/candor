# Namespaced memory-write receipts (candor WAL)

Positioning per the receipts evidence triptych (jev-quilt PR #18, §4) — the
write path is the unclaimed defense against persistent-memory attacks
(arXiv 2605.08442: payload → memory → later execution; input/retrieval
defenses unevaluated, tool-layer near-zero attention).

## What shipped

`wal.mjs` — an in-process, namespaced, hash-chained receipt log over memory
writes:

- `write(namespace, predicate, payload)` books `{seq, prev_hash, namespace,
  predicate, payload_hash, authority}`; FNV-1a-64 over UTF-8 bytes (fleet
  pinned café Δ 日本語 vector held: `24a555471370b18d`), payload hashed not
  retained (authority/storage separation).
- `verify()` re-derives every hash and link; reorder, delete, or swap any
  field and the chain breaks at that row (`broken_at`).
- `revoke(namespace, predicate, note)` = **authority-without-erasure**
  (substrate-revoke canon): a REVOKE row voids authority of matching live
  rows; the rows stay in the chain, visible, marked inert. No-delete IS the
  defense — the poisoned write remains as evidence.
- Revoking nothing books a visible `REVOKE-REFUSAL` row (evidence even for
  no-op attacks); double-revoke is a refusal; REVOKE `detail` is
  hash-committed (reason-laundering breaks verify).

## Honest gaps

- In-process only: no cross-node non-repudiation. That is the receipts-v2
  Ed25519/BLAKE3 signature envelope (jev-quilt docs/receipts-v2), deferred
  until a real two-node dispute exists.
- Predicates are caller-named strings, not evaluated here — the WAL books
  claims, it does not judge them.
- ~~No live memory layer writes through it yet~~ — memory.mjs is the first
  caller: remember() books the receipt before storing the payload (authority
  never lags storage), recall() serves only live-authority entries, forget()
  = authority-without-erasure with payloads kept visible in audit(), and
  boot replays the JSONL store with full re-derivation of every WAL row AND
  every payload hash (at-rest tamper is refused, loudly). Remaining honest
  limits in memory.mjs header: single-writer in-process; predicates are
  caller-named claims the WAL books but does not judge.
- Post-hoc detection ≠ gate: forensic trajectory signatures (arXiv
  2606.30566, AUC 0.9904) prove detection is commoditizing; the claim here
  is gate-at-write, which is not.
