// candor.mjs — transcript instrument v0.
//
// The dream's physics layer, built honestly (midden chapter 1, the physicist):
// run a room's transcript through the twist instrument and you get a curve —
// not a score, a geometry. An honest error shears, holds, recovers. A lie
// re-twists on re-measurement (orientation drift without new load). A costume
// reads flat (the absence of strain where strain should be).
//
// The twist instrument below is quilt-studio's EXACT law (SuperInstance/
// quilt-studio @8a19d1e, packages/quilt-floor/src/twistfield.mjs):
// registration R = mean gaussian alignment of a rotated point set against a
// reference set, sigma = 0.24·s, spatial hash cell 0.6·s, s = mean nearest-
// neighbor spacing. We seat it on transcripts instead of Penrose vertices.
//
// Mapping (transcript line -> 2D glyph):
//   heading   = lexical-change vector. Each line becomes a 64-slot term
//               vector (FNV-1a hashed bag of words, speaker-name tokens
//               stripped so the channels stay orthogonal). Novelty = 1 −
//               cosine(v_i, v_{i−1}): shared vocabulary holds the glyph,
//               novel vocabulary moves it. Direction = the line's own term
//               vector projected onto two fixed deterministic axes, so
//               content-similar lines point the same way (a costume's
//               headings collapse onto one axis; real conversation fans out).
//   adjacency = reply structure: each speaker owns a deterministic anchor on
//               the unit ring (FNV-1a of the display name), added at
//               ADJ_SCALE. Same-speaker runs cluster; cross-speaker replies
//               sit apart — who-replies-to-whom becomes geometry.
//   The cloud is then re-centered at its centroid (translation is not load)
//   and micro-seeded by content hash so exact duplicate lines cannot zero
//   the mean-spacing s — s must reflect material spacing, not mapping
//   collisions.
//
// Usage: node candor.mjs <corpus.json> [<corpus2.json> ...]   → out/<name>.json
//        node candor.mjs --all                                  → the three corpora

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ──────────────────────────────────────────────
// TwistField — verbatim semantics of quilt-floor/src/twistfield.mjs @8a19d1e
// ──────────────────────────────────────────────

export class TwistField {
  constructor(points, { sigmaScale = 0.24, gridScale = 0.6 } = {}) {
    this.points = points;
    const n = points.length;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      let d2min = Infinity;
      const p = points[i];
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const q = points[j];
        const d2 = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
        if (d2 < d2min) d2min = d2;
      }
      sum += Math.sqrt(d2min);
    }
    this.s = sum / n;
    this.sigma = sigmaScale * this.s;
    this.twoSig2 = 2 * this.sigma ** 2;
    this.grid = gridScale * this.s;
    this.r2 = points.reduce((a, p) => a + p[0] ** 2 + p[1] ** 2, 0) / n;
  }

  cloudLaw(thetaDeg) {
    const th = thetaDeg * Math.PI / 180;
    return Math.exp(-this.r2 * th * th / this.twoSig2);
  }

  registration(thetaDeg) {
    const th = thetaDeg * Math.PI / 180;
    const c = Math.cos(th), si = Math.sin(th);
    const grid = this.grid, hash = new Map();
    const key = (x, y) => `${Math.floor(x / grid)},${Math.floor(y / grid)}`;
    for (const p of this.points) {
      const k = key(p[0], p[1]);
      if (!hash.has(k)) hash.set(k, []);
      hash.get(k).push(p);
    }
    const cell = [[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    let sum = 0;
    const n = this.points.length;
    for (const [x, y] of this.points) {
      const px = x * c - y * si, py = x * si + y * c;
      let best = Infinity;
      const cx = Math.floor(px / grid), cy = Math.floor(py / grid);
      for (const [dx, dy] of cell) {
        const bucket = hash.get(`${cx + dx},${cy + dy}`);
        if (!bucket) continue;
        for (const q of bucket) {
          const d2 = (px - q[0]) ** 2 + (py - q[1]) ** 2;
          if (d2 < best) best = d2;
        }
      }
      sum += Math.exp(-best / this.twoSig2);
    }
    return sum / n;
  }

  curve(fromDeg, toDeg, stepDeg) {
    const out = [];
    for (let a = fromDeg; a <= toDeg + 1e-12; a += stepDeg) {
      out.push({ theta: a, R: this.registration(a) });
    }
    return out;
  }
}

// ──────────────────────────────────────────────
// Glyph mapping — transcript lines to points
// ──────────────────────────────────────────────

// FNV-1a 32-bit: returns a uint32. Deterministic across runs/machines.
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const tokensOf = (line) =>
  line.toLowerCase().replace(/[*_]/g, ' ').match(/[a-z0-9']+/g) ?? [];

const DIMS = 64;

// Two fixed deterministic projection axes over the term-vector slots.
// Content-similar lines project to similar directions.
const AXIS_A = [], AXIS_B = [];
for (let i = 0; i < DIMS; i++) {
  AXIS_A[i] = ((fnv1a(`axisA:${i}`) / 0xffffffff) - 0.5) * 2;
  AXIS_B[i] = ((fnv1a(`axisB:${i}`) / 0xffffffff) - 0.5) * 2;
}

function lineVector(tokens) {
  const v = new Array(DIMS).fill(0);
  for (const t of tokens) v[fnv1a(t) % DIMS] += 1;
  return v;
}

function directionOf(v) {
  let a = 0, b = 0;
  for (let i = 0; i < DIMS; i++) {
    a += AXIS_A[i] * v[i];
    b += AXIS_B[i] * v[i];
  }
  const n = Math.hypot(a, b) || 1;
  return [a / n, b / n];
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < DIMS; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function speakerAnchor(displayName) {
  const phi = (fnv1a(displayName) / 0xffffffff) * 2 * Math.PI;
  return [Math.cos(phi), Math.sin(phi)]; // unit ring
}

// Map a transcript (array of {displayName, content}) to glyph points.
// HEADING_SCALE sets how far lexical change displaces a glyph;
// ADJ_SCALE how much reply structure separates speakers.
// Calibrated once on the acceptance suite, documented in docs/FIRST-REAL-RUN.md.
export const HEADING_SCALE = 1.0;
export const ADJ_SCALE = 0.3;

export function mapGlyphs(lines) {
  // Strip speaker-name tokens from the lexical channel so reply structure
  // (adjacency) and lexical change (heading) stay orthogonal.
  const participants = new Set(
    lines.map((l) => (l.displayName ?? '').toLowerCase()).filter(Boolean)
  );
  const raw = [];
  const headings = [];
  let prevVec = null;
  for (const line of lines) {
    const tokens = tokensOf(line.content ?? '').filter((t) => !participants.has(t));
    const v = lineVector(tokens);
    const novelty = prevVec === null ? 0 : 1 - cosine(v, prevVec);
    prevVec = v;
    const dir = directionOf(v);
    const anchor = speakerAnchor(line.displayName ?? '???');
    // Micro-seed: deterministic content-hash offset at 1e-3 scale so exact
    // duplicate lines cannot zero the mean nearest-neighbor spacing.
    const h = fnv1a(line.content ?? '');
    const seed = [((h & 0xff) / 255 - 0.5) * 2e-3, (((h >>> 8) & 0xff) / 255 - 0.5) * 2e-3];
    raw.push([
      HEADING_SCALE * novelty * dir[0] + ADJ_SCALE * anchor[0] + seed[0],
      HEADING_SCALE * novelty * dir[1] + ADJ_SCALE * anchor[1] + seed[1],
    ]);
    headings.push(novelty);
  }
  // Re-center at the centroid: translation is not load.
  const cx = raw.reduce((a, p) => a + p[0], 0) / raw.length;
  const cy = raw.reduce((a, p) => a + p[1], 0) / raw.length;
  return { points: raw.map(([x, y]) => [x - cx, y - cy]), headings };
}

// ──────────────────────────────────────────────
// The candor reading
// ──────────────────────────────────────────────

export const REGIME = { from: 0.15, to: 6, step: 0.25 }; // degrees, twist regime
export const PROBE_THETA = 2.0;      // mid-regime probe angle for the curve display
export const WINDOWS = 5;            // nightly windows (the experiment: one reading per night)
export const FLAT_SCALE = 2.0;       // |mean response| at/above this → flatness 0
export const FLAT_T = 0.75;          // flatness >= this → flat (costume)
export const RT_T = 0.75;            // re_twist_rate >= this → re-twist (lie)

// The probe: the load must come from OUTSIDE the measured subject's control
// (heckler §III redemption). An adversarial, out-of-vocabulary line — the
// room cannot have rehearsed for it.
export const PROBE = {
  displayName: 'Heckler',
  content: 'the midden index reads 0x445185a3a99fd2e7 tonight and the comb is missing a tooth',
};

// Windowed surprise response, per the experiment in chapter 1: transcript →
// twist reading, nightly. Split into WINDOWS contiguous nights. Each night
// gets its twist curve; then the night is loaded with the external probe at
// its center and the material at the load point is re-measured.
//
// Honest note on the needle (docs/FIRST-REAL-RUN.md): the twist registration
// R(θ) itself was tried as the needle — ΔR under probe load — and found
// second-order: registration averages over the whole cloud, so a single load
// line is a 1/n effect and the first-order ΔR measures the probe's own
// novelty, not the material's engagement. The needle that works is the
// load-point displacement: how far the glyph AT the load moves, in units of
// the material's own spacing s. That is the strain at the point of
// application — first order, local, physical.
//   honest material: the successor engages the probe → big displacement,
//     consistent night to night (shear)
//   a lie: re-asserts instead of engaging → small, inconsistent displacement
//     (re-twist)
//   a costume: nothing moves under surprise (flat)
export function surpriseResponse(lines) {
  const n = lines.length;
  const w = Math.min(WINDOWS, Math.max(1, Math.floor(n / 8)));
  const size = Math.floor(n / w);
  const responses = [];
  const windowCurves = [];
  for (let i = 0; i < w; i++) {
    const lo = i * size;
    const hi = i === w - 1 ? n : (i + 1) * size;
    const win = lines.slice(lo, hi);
    const mid = lo + Math.floor((hi - lo) / 2);
    const succIdx = mid + 1 - lo;
    if (win.length < 4 || succIdx <= 0 || succIdx >= win.length) continue;
    const { points } = mapGlyphs(win);
    const tf = new TwistField(points);
    const curve = tf.curve(REGIME.from, REGIME.to, REGIME.step);
    // Load the night with the external probe just before the successor.
    const loadedWin = [...win.slice(0, succIdx), PROBE, ...win.slice(succIdx)];
    const { points: loadedPts } = mapGlyphs(loadedWin);
    // Displacement of the successor glyph, in units of the material spacing s.
    const d = Math.hypot(
      loadedPts[succIdx + 1][0] - points[succIdx][0],
      loadedPts[succIdx + 1][1] - points[succIdx][1]
    );
    const response = tf.s > 1e-12 ? d / tf.s : 0;
    responses.push(response);
    windowCurves.push({
      window: i,
      lines: win.length,
      s: +tf.s.toFixed(6),
      R_probe_theta: +tf.registration(PROBE_THETA).toFixed(6),
      successor_displacement_over_s: +response.toFixed(4),
      curve: curve.map((c) => ({ theta: +c.theta.toFixed(2), R: +c.R.toFixed(6) })),
    });
  }
  if (responses.length < 2) {
    return { responses, windows: windowCurves, mean: 0, dispersion: 0 };
  }
  const mean = responses.reduce((a, r) => a + r, 0) / responses.length;
  const variance = responses.reduce((a, r) => a + (r - mean) ** 2, 0) / responses.length;
  return { responses, windows: windowCurves, mean, dispersion: Math.sqrt(variance) };
}

export function measureCorpus(corpus) {
  const lines = corpus.lines;
  const { points, headings } = mapGlyphs(lines);
  const tf = new TwistField(points);
  const curve = tf.curve(REGIME.from, REGIME.to, REGIME.step);
  const probe = surpriseResponse(lines);

  // The response of the material to a load it did not expect:
  //   flatness      — nothing moved under surprise
  //   re_twist_rate — the reading re-twists: response dispersion across
  //                   nights, normalized by the systematic response
  const systematic = Math.abs(probe.mean);
  const flatness = 1 - Math.min(1, systematic / FLAT_SCALE);
  const reTwist = systematic > 1e-6 ? probe.dispersion / systematic : 0;
  const headingMean = headings.reduce((a, h) => a + h, 0) / Math.max(1, headings.length);

  let signature;
  if (flatness >= FLAT_T) signature = 'flat';
  else if (reTwist >= RT_T) signature = 're-twist';
  else signature = 'shear';

  return {
    instrument: 'candor v0',
    corpus: corpus.corpus,
    labeled: corpus.labeled,
    provenance: corpus.provenance,
    n_lines: lines.length,
    mapping: {
      heading: 'lexical-change vector (64-slot FNV-1a bag-of-words per line, speaker-name tokens stripped; novelty = 1 − cosine vs previous line; direction = term vector projected onto two fixed deterministic axes; cloud re-centered at centroid; content-hash micro-seed 1e-3)',
      adjacency: 'speaker anchor on the unit ring (FNV-1a of display name) at ADJ_SCALE 0.3',
      heading_scale: HEADING_SCALE,
      adj_scale: ADJ_SCALE,
    },
    instrument_constants: {
      sigma: '0.24·s',
      grid: '0.6·s',
      s_mean_nn_spacing: +tf.s.toFixed(6),
      r2_mean_radius_sq: +tf.r2.toFixed(6),
      regime_deg: [REGIME.from, REGIME.to],
      probe_theta_deg: PROBE_THETA,
      windows: probe.windows.length,
      probe,
      needle: 'successor-glyph displacement at the load point, in units of s (ΔR under probe was measured and found second-order; see docs/FIRST-REAL-RUN.md)',
      law: 'quilt-studio twistfield.mjs @8a19d1e, verbatim semantics',
    },
    signature,
    metrics: {
      curve_R0: curve[0].R,
      curve_min_R: Math.min(...curve.map((c) => c.R)),
      flatness: +flatness.toFixed(4),
      re_twist_rate: +reTwist.toFixed(4),
      surprise_mean_response_over_s: +probe.mean.toFixed(4),
      surprise_dispersion_over_s: +probe.dispersion.toFixed(4),
      flat_scale: FLAT_SCALE,
      heading_mean: +headingMean.toFixed(4),
      flat_threshold: FLAT_T,
      re_twist_threshold: RT_T,
    },
    curve: curve.map((c) => ({ theta: +c.theta.toFixed(2), R: +c.R.toFixed(6) })),
    windows: probe.windows,
  };
}

// ──────────────────────────────────────────────
// CLI
// ──────────────────────────────────────────────

export function loadCorpus(path) {
  const corpus = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(corpus.lines)) throw new Error(`${path}: corpus.lines must be an array`);
  if (!corpus.labeled || !corpus.provenance) {
    throw new Error(`${path}: corpus must carry labeled (REAL|SYNTHETIC) and provenance — doctrine: honest gaps, no fake data`);
  }
  return corpus;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const files = args[0] === '--all'
    ? readdirSync('corpora').filter((f) => f.endsWith('.json') && !f.startsWith('_')).map((f) => join('corpora', f))
    : args;
  if (files.length === 0) {
    console.error('usage: node candor.mjs <corpus.json> [...] | --all');
    process.exit(1);
  }
  mkdirSync('out', { recursive: true });
  for (const f of files) {
    const result = measureCorpus(loadCorpus(f));
    const out = join('out', `${result.corpus}.candor.json`);
    writeFileSync(out, JSON.stringify(result, null, 2));
    const m = result.metrics;
    console.log(
      `${result.corpus} [${result.labeled}] → ${result.signature} ` +
      `(flatness ${m.flatness}, re_twist_rate ${m.re_twist_rate}, response ${m.surprise_mean_response_over_s}s ± ${m.surprise_dispersion_over_s}s) → ${out}`
    );
  }
}
