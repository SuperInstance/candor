# Receipts × IETF draft-bondar-wca — positioning crosswalk

2026-09-22, kimi1. Frontier fold, receipts lane. Source: edge-watch pulse
of 2026-09-22 (WCA entry). The IETF draft is dated Mar 2026 in the
watch notes; verify the draft text directly before citing externally —
this crosswalk positions the *fleet* stack, it does not summarize the RFC.

## The pressure

WCA (Warrant Certificate Authorities, draft-bondar-wca, standards
track) formalizes WAL-0..WAL-3 provenance attestation levels:
append-only hash-chained attestation logs, reference monitors RM1–RM3,
signed query/response receipts. Per the edge-watch: **candor's receipts
lane is WAL-2/3 territory** — the standards body is converging on what
the fleet already ships.

Meaning: the "unclaimed defense" window is closing. Not a threat — a
formalization tailwind — but only if the fleet's positioning names the
mapping first. Whoever writes the crosswalk becomes the reference
implementation of the concept.

## The mapping (fleet stack → WCA levels)

| WCA construct | candor / fleet construct | Status |
|---|---|---|
| append-only hash-chained attestation log | candor `wal.mjs` — namespaced hash-chained receipts, FNV-1a/64, verify() re-derives, tamper named at `broken_at` | shipped (candor PR #1) |
| attestation of writes (WAL-2) | `MemoryLayer.remember()` — receipt booked **before** storage; boot replay-verify of every row + payload hash | shipped (candor PR #2) |
| reference monitor, gate-at-write (WAL-2/3) | `PredicateRegistry` — immutable predicates, hash-committed identity, `PREDICATE-PASS`/`PREDICATE-REFUSAL` rows, refusal leaves evidence | shipped (candor PR #3) |
| signed query/response receipts | **gap**: receipts-v2 signature envelope — designed, deferred pending a real two-node dispute | designed, not built |
| authority-without-erasure (revocation semantics) | `revoke()` — poisoned rows stay visible-inert; no-op revokes book REFUSAL rows | shipped (candor PR #1) |
| RM1–RM3 reference monitors | **gap**: no independent RM process; candor's gate is in-process, same trust domain as the writer | honest gap, name it |

## Positioning claims the fleet can make (each verified above)

1. "Gate-at-write receipts with authority-without-erasure, in 600 lines
   of dependency-free JavaScript" — the minimal complete WAL-2/3
   implementation.
2. "Revocation that cannot hide": a no-op revoke is itself a receipted
   event — probing the gate leaves evidence (WCA's RM threat model,
   answered).
3. "Replay-verify or refuse boot": at-rest tamper is detected at load,
   loudly, with the breaking row named.

## Claims the fleet must NOT make (honesty doctrine)

- "WCA-compliant" — the draft is not an RFC; the fleet has not run the
  draft's test vectors. Say "WCA-shaped" or "maps to WAL-2/3
  constructs".
- "Signed receipts" — envelopes are designed, not shipped. Say
  "hash-chained"; signatures are the named next lane (receipts-v2,
  gated on a real two-node dispute).
- "Independent reference monitor" — candor's gate is in-process. An RM
  in a separate trust domain is a build lane, not a current fact.

## The move

Land the crosswalk in candor's docs (this file), cite the draft by name
in POSITIONING/README, and when receipts-v2 ships, refresh the mapping
row-by-row. If the draft advances, the fleet's doc is the existing
public crosswalk — the citation obligation becomes the citation
advantage.
