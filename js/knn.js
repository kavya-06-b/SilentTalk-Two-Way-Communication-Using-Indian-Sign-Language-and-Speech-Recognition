/**
 * Whole-sign matching. A sign is every frame from when the hands enter the box until they leave it.
 * Those frames are averaged into STEPS equal parts, so a fast and a slow signer give the same shape
 * of sequence, and the sequence is compared with every recorded clip (model/signs.json).
 */
export const STEPS = 8;
const DIM = 126;

/** Averages a sign's frames into STEPS equal parts, the same way tools/export_signs.py does. */
export function sequenceOf(frames) {
  const n = frames.length;
  const out = new Float32Array(STEPS * DIM);
  for (let s = 0; s < STEPS; s++) {
    const a = Math.floor((s * n) / STEPS);
    const b = Math.max(a + 1, Math.floor(((s + 1) * n) / STEPS));
    for (let t = a; t < b; t++) {
      const frame = frames[t];
      for (let i = 0; i < DIM; i++) out[s * DIM + i] += frame[i];
    }
    for (let i = 0; i < DIM; i++) out[s * DIM + i] /= b - a;
  }
  return out;
}

/** Turns model/signs.json into one flat array. Each clip is stored as STEPS × 126 bytes, value × 127. */
export function signsFrom(pack) {
  const labels = [...new Set(pack.items.map((item) => item.l))];
  const size = STEPS * DIM;
  const data = new Float32Array(pack.items.length * size);
  const label = new Uint8Array(pack.items.length);
  pack.items.forEach((item, n) => {
    const raw = atob(item.v);
    for (let i = 0; i < size; i++) {
      const byte = raw.charCodeAt(i);
      data[n * size + i] = (byte > 127 ? byte - 256 : byte) / 127;
    }
    label[n] = labels.indexOf(item.l);
  });
  return { labels, data, label, count: pack.items.length, clips: pack.items.length };
}

function mirrored(seq) {
  const out = Float32Array.from(seq);
  for (let i = 0; i < out.length; i += 3) out[i] = -out[i];
  return out;
}

/** Squared distance of one step, trying both hand orders, because the two hands can swap slots mid-sign. */
function stepDistance(q, data, qo, o) {
  let same = 0;
  let swapped = 0;
  for (let i = 0; i < 63; i++) {
    const a = q[qo + i] - data[o + i];
    const b = q[qo + 63 + i] - data[o + 63 + i];
    const c = q[qo + i] - data[o + 63 + i];
    const d = q[qo + 63 + i] - data[o + i];
    same += a * a + b * b;
    swapped += c * c + d * d;
  }
  return Math.min(same, swapped);
}

/**
 * Votes among the k recorded clips closest to the live sign.
 * The sign is also tried as a mirror image, so either hand and a mirrored camera match the same clips.
 * confidence is the share of the k votes that went to the winning sign;
 * distance is the per-step distance to the winning sign's closest clip;
 * ratio is that distance over the distance to the closest clip of any other sign. A real sign is much
 * closer to its own recordings than to any other sign; a random movement is about as far from all of them.
 */
export function matchSign(frames, db, k = 5) {
  const variants = [sequenceOf(frames)];
  variants.push(mirrored(variants[0]));
  const size = STEPS * DIM;
  const { data, count } = db;
  const best = new Float64Array(k).fill(Infinity);
  const bestIdx = new Int32Array(k).fill(-1);
  const perSign = new Float64Array(db.labels.length).fill(Infinity);
  for (let n = 0; n < count; n++) {
    let d = Infinity;
    for (const q of variants) {
      let sum = 0;
      for (let s = 0; s < STEPS && sum < d; s++) sum += stepDistance(q, data, s * DIM, n * size + s * DIM);
      if (sum < d) d = sum;
    }
    if (d < perSign[db.label[n]]) perSign[db.label[n]] = d;
    if (d >= best[k - 1]) continue;
    let j = k - 1;
    while (j > 0 && best[j - 1] > d) {
      best[j] = best[j - 1];
      bestIdx[j] = bestIdx[j - 1];
      j--;
    }
    best[j] = d;
    bestIdx[j] = n;
  }
  const votes = new Map();
  for (let j = 0; j < k; j++) {
    if (bestIdx[j] < 0) continue;
    const id = db.label[bestIdx[j]];
    const row = votes.get(id) || { count: 0, nearest: best[j] };
    row.count += 1;
    votes.set(id, row);
  }
  // Most votes wins; a tie goes to the sign with the closer recording.
  const ranked = [...votes.entries()].sort((a, b) => b[1].count - a[1].count || a[1].nearest - b[1].nearest);
  const [winId, win] = ranked[0];
  const runnerUp = ranked[1];
  let otherNearest = Infinity;
  perSign.forEach((d, id) => {
    if (id !== winId && d < otherNearest) otherNearest = d;
  });
  return {
    label: db.labels[winId],
    second: runnerUp ? db.labels[runnerUp[0]] : db.labels[winId],
    confidence: win.count / k,
    secondConfidence: runnerUp ? runnerUp[1].count / k : 0,
    distance: Math.sqrt(win.nearest / STEPS),
    ratio: Math.sqrt(win.nearest / otherNearest)
  };
}

/* Shares of the live frames tried as the sign, longest first. */
const WINDOWS = [1, 0.75, 0.55];
const MIN_WINDOW = 8;

/**
 * The recorded clips are trimmed to the sign itself, but live frames also hold the hands still before and
 * after it, which blurs the match. So shorter stretches of the live frames are tried too, longest first,
 * and the first one that accepts() is returned. If none does, the match over all the frames is returned.
 */
export function matchBest(frames, db, accepts) {
  const n = frames.length;
  const whole = matchSign(frames, db);
  if (accepts(whole)) return whole;
  for (const share of WINDOWS.slice(1)) {
    const len = Math.round(n * share);
    if (len < MIN_WINDOW) break;
    const step = Math.max(1, Math.round(len / 2));
    const starts = [];
    for (let a = n - len; a > 0; a -= step) starts.push(a);
    starts.push(0);
    for (const a of starts) {
      const guess = matchSign(frames.slice(a, a + len), db);
      if (accepts(guess)) return guess;
    }
  }
  return whole;
}
