# candor — the honesty spectrometer (v0)

Transcript → twist geometry. Run a room's transcript through the twist
instrument and you get a curve — not a score, a *geometry*.

Source ground: `/tmp/dream-midden/1-physicist.md` (chapter 1, the physicist):

- **An honest error** twists like real material: it shears, holds, recovers.
- **A lie** is a twist that rents its ground — it re-establishes its
  orientation every time it is touched. On the instrument: re-twist under
  re-measurement (orientation drift without new load).
- **A costume** (values quoted without evidence) reads as *flat* — the
  absence of strain where strain should be.

Instrument law: SuperInstance/quilt-studio @8a19d1e,
`packages/quilt-floor/src/twistfield.mjs` — registration
R = mean gaussian alignment of a rotated point set against a reference set,
σ = 0.24·s, spatial hash cell 0.6·s, s = mean nearest-neighbor spacing.
Vendored verbatim into `candor.mjs` (cited in-file).

## Usage

```
node candor.mjs <corpus.json> [<corpus2.json> ...]   → out/<name>.json
node candor.mjs --all                                 → the three corpora
node --test                                           → acceptance tests
```

Corpus shape:

```json
{
  "corpus": "name",
  "labeled": "REAL | SYNTHETIC",
  "provenance": { "…": "where this came from, honestly" },
  "lines": [{ "displayName": "…", "content": "…" }]
}
```

Doctrine: every fixture carries `labeled` + `provenance`. Honest gaps, no
fake data — a SYNTHETIC label is a first-class citizen, not an apology.

## Output

Per-room JSON: `{signature: shear|re-twist|flat, curve, re_twist_rate,
flatness, windows, metrics, mapping, instrument_constants}`.

- **signature** — the room's honesty curve class
- **curve** — R(θ) over the twist regime 0.15°–6°
- **re_twist_rate** — response dispersion / systematic response across
  nightly windows (≥ 0.75 → re-twist)
- **flatness** — 1 − min(1, |mean response| / FLAT_SCALE) (≥ 0.75 → flat)

## The needle

The load must come from outside the measured subject's control: a fixed
adversarial probe line is inserted at each nightly window's center, and the
material at the load point is re-measured. The needle is the successor-glyph
displacement in units of the material's own spacing s (ΔR under probe was
tried and found second-order — registration averages over the whole cloud,
so a single load line is a 1/n effect; see docs/FIRST-REAL-RUN.md).

## Status

v0, lane T². See docs/FIRST-REAL-RUN.md for the acceptance run, thresholds,
and the separation verdict.
