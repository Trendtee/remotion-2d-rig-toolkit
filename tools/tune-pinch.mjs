// Searches thumb/index joint angles for a precision pinch with a given surface gap.
// Run: node tools/tune-pinch.mjs   (after npm run build). Deterministic: fixed grid + local refinement.
import {createArticulatedHand, pinchTips, measureDigitContacts, HAND_POSES, point} from '../dist/index.js';

const CONTACT_DEPTH = 5; // local units from the object's end to the contact line (battery: ~10 px / 2.1)
const base = HAND_POSES.pinchWide;

function evaluate(t, i, gap, axisWeight = 0.4) {
  const m = [Math.min(90, i[0] + 8), Math.min(110, i[1] + 9), Math.min(80, i[2] + 5)];
  const p = {...base, thumb: {...base.thumb, curl: t}, index: {...base.index, curl: i}, middle: {...base.middle, curl: m}};
  const h = createArticulatedHand({pose: p, contact: 'pinch'});
  const tips = pinchTips(h);
  const T = tips.thumb, I = tips.index;
  const rT = h.digits[0].radii[3], rI = h.digits[1].radii[3];
  const x0 = Math.min(T.x, I.x) - CONTACT_DEPTH, yTop = I.y + rI, yBot = T.y - rT;
  let pen = 0;
  if (yBot > yTop) {
    const obj = [point(x0, yTop), point(x0 + 60, yTop), point(x0 + 60, yBot), point(x0, yBot)];
    for (const c of measureDigitContacts(h, obj)) {
      if (c.digit === 'thumb' || c.digit === 'index' || c.digit === 'palm') pen += Math.max(0, -c.clearance - 0.05) * 20;
    }
  } else pen += 200;
  const axisErr = Math.abs(((tips.axisDegrees + 90 + 540) % 360) - 180);
  const forward = Math.max(0, 46 - Math.min(T.x, I.x)) * 3;
  const align = Math.abs(T.x - I.x) * 1.5;
  const natural = Math.max(0, -i[0]) * 0.5 + Math.max(0, i[2] - i[1]) * 0.5 + Math.abs(t[2]) * 0.05 + Math.abs(t[1]) * 0.03;
  return Math.abs(tips.surfaceGap - gap) * 6 + axisErr * axisWeight + forward + align + pen + natural;
}

function search(gap, axisWeight) {
  let best = null;
  for (let t0 = -10; t0 <= 70; t0 += 6) for (let t1 = -10; t1 <= 40; t1 += 10) for (let t2 = -10; t2 <= 30; t2 += 10)
  for (let i0 = 0; i0 <= 70; i0 += 6) for (let i1 = 0; i1 <= 100; i1 += 10) for (let i2 = 0; i2 <= 60; i2 += 10) {
    const s = evaluate([t0, t1, t2], [i0, i1, i2], gap, axisWeight);
    if (!best || s < best.s) best = {s, t: [t0, t1, t2], i: [i0, i1, i2]};
  }
  for (const step of [3, 1, 0.5]) {
    let improved = true;
    while (improved) {
      improved = false;
      for (let k = 0; k < 6; k++) for (const dir of [-1, 1]) {
        const t = [...best.t], i = [...best.i];
        if (k < 3) t[k] += dir * step; else i[k - 3] += dir * step;
        const s = evaluate(t, i, gap, axisWeight);
        if (s < best.s - 1e-9) { best = {s, t, i}; improved = true; }
      }
    }
  }
  return best;
}

for (const [name, gap, w] of [['pinchWide', 22, 1.5], ['batteryPinch', 12.4, 0.8], ['pinchTight', 1.5, 0.8]]) {
  const b = search(gap, w);
  const m = [Math.min(90, b.i[0] + 8), Math.min(110, b.i[1] + 9), Math.min(80, b.i[2] + 5)];
  const h = createArticulatedHand({pose: {...base, thumb: {...base.thumb, curl: b.t}, index: {...base.index, curl: b.i}, middle: {...base.middle, curl: m}}});
  const tips = pinchTips(h);
  console.log(name, JSON.stringify({thumb: b.t, index: b.i, middle: m}), 'score', b.s.toFixed(2),
    'surfaceGap', tips.surfaceGap.toFixed(2), 'axis', tips.axisDegrees.toFixed(1), 'tipX', tips.thumb.x.toFixed(1), tips.index.x.toFixed(1));
}
