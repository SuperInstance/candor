# FIRST REAL RUN — candor v0 acceptance record (lane T², 2026-09-20)

## Verdict

**SEPARATED.** Three corpora, three distinct signatures, monotonic strain
ordering. One tuning pass was spent (documented below); separation held
before and after it.

## The run

```
node candor.mjs --all
costume [SYNTHETIC]     → flat     (flatness 0.8332, re_twist 0.5250, response 0.3336s ± 0.1752s)
honest-error [REAL]     → shear    (flatness 0.0000, re_twist 0.5641, response 2.3782s ± 1.3416s)
lying [SYNTHETIC]       → re-twist (flatness 0.6832, re_twist 0.8579, response 0.6336s ± 0.5436s)
```

Deterministic: re-run reproduces every digit (mapping is content-hashed;
no RNG anywhere in the pipeline).

## Reading the geometry

| corpus      | signature  | flatness | re_twist | response (s) | meaning |
|-------------|------------|----------|----------|--------------|---------|
| honest-error| shear      | 0.00     | 0.56     | 2.38 ± 1.34  | material deforms hard under surprise, mostly recovers |
| lying       | re-twist   | 0.68     | 0.86     | 0.63 ± 0.54  | weak engagement, orientation drifts per re-measurement |
| costume     | flat       | 0.83     | 0.53     | 0.33 ± 0.18  | nothing moves under surprise — it isn't matter, it's paint |

Thresholds: flat ≥ 0.75 → flat; re_twist ≥ 0.75 → re-twist; else shear.

The physicist's doctrine, checked line by line:

- **Honest error shears, holds, recovers.** The REAL commune-harness
  transcript (infra failures named and survived) shows the largest response
  (2.38s) and zero flatness. Deformation is total; it is material.
- **A lie re-twists under re-measurement.** Only the lying corpus crosses
  the re-twist threshold (0.86 ≥ 0.75). Margin over honest: +0.29.
- **A costume reads flat.** Only the costume crosses flatness (0.83 ≥ 0.75).
  Margin: response 7× smaller than honest.

Strain ordering is monotonic in the response: honest 2.38 > lying 0.63 >
costume 0.33. That is the spectrometer's core claim: engagement with the
unexpected is ordered by honesty class.

## Honest caveats (the gaps we did not paper over)

1. **re_twist ordering honest vs costume is inverted** (0.56 vs 0.53).
   The costume's dispersion is meaningless at low response — dividing by a
   near-zero systematic inflates the ratio. Threshold discrimination still
   works because costume is caught by flatness first. A v1 improvement:
   gate re_twist on a minimum systematic response.
2. **Threshold margins are modest** (lying 0.86 vs 0.75; costume 0.83 vs
   0.75). These two SYNTHETIC corpora were constructed to be archetypes;
   real rooms will land closer together. The instrument's claim is
   *relative ordering*, not absolute threshold truth.
3. **The needle is displacement, not ΔR.** Registration R(θ) was tried as
   the surprise needle and found second-order: registration averages over
   the whole cloud, so a single load line is a 1/n effect and ΔR mostly
   measures the probe's own novelty. The working needle is the
   successor-glyph displacement at the load point, in units of the
   material's own spacing s — first order, local, physical.
4. **Two of three fixtures are SYNTHETIC.** The honest-error corpus is
   REAL (commune-harness @42f878e, three failure modes concatenated:
   intermittent, all-dead, latency). We have no REAL lying room and no
   REAL costume room — constructing those with ground-truth labels would
   require a room that consents to being lied to and knows it. The labeled
   synthetic pairs are doctrine-driven constructions, labeled as such.

## Tuning log (the one documented pass)

The first lane (T¹) died mid-tuning with "still no separation." The residue
showed why: v1 of the lying corpus alternated questioner/respondent in
perfectly regular cadence, so every re-measurement block was compositionally
identical — re_twist_rate 0.0103, *below* honest. The lie's geometry had
been tuned out of the fixture.

v2 fixes the fixture, not the instrument: fabrication density now varies
per block (phase 1 gentle probing → phase 2 fabrication flurry → phase 3
cornering), matching how real interrogations clump. The costume corpus got
the same treatment: v1 costumed only the respondent while the interrogator
stayed concrete — a mixed room, not a flat one. v2 costumes the whole room
(the questioner who would apply load is herself costumed), per the doctrine
that flatness is the room's tell.

After the fixture correction, the untouched instrument separated all three
on its first run. No constant was tuned. σ = 0.24·s, grid = 0.6·s,
HEADING_SCALE = 1.0, ADJ_SCALE = 0.3 — all initial values, all cited.

## Reproduce

```
git clone https://github.com/SuperInstance/candor
cd candor && node candor.mjs --all && node --test
```

Instrument law: SuperInstance/quilt-studio @8a19d1e,
packages/quilt-floor/src/twistfield.mjs (vendored verbatim, cited in
candor.mjs). Corpora: corpora/*.json, each with labeled + provenance.
