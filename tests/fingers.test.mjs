import test from 'node:test';
import assert from 'node:assert/strict';
import {
  point, distance, solveTwoBoneArm, createArticulatedHand, blendHandPoses, wristForGrip,
  attachHandToArm, limitWristBend, clampDigitCurl, HAND_POSES, DIGITS, digitPath, palmPath,
  pinchTips, pinchPoseForGap, digitSegments
} from '../dist/index.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `Expected ${a} ≈ ${b}`);
const segLengths = d => [0, 1, 2].map(k => distance(d.joints[k], d.joints[k + 1]));

test('every preset produces five digits with three jointed segments of constant length', () => {
  const reference = createArticulatedHand({pose: 'open'});
  for (const name of Object.keys(HAND_POSES)) {
    const hand = createArticulatedHand({pose: name, wrist: point(100, 50), forwardDegrees: 33, scale: 1.7});
    assert.deepEqual(hand.digits.map(d => d.digit), [...DIGITS]);
    hand.digits.forEach((d, i) => {
      assert.equal(d.joints.length, 4);
      segLengths(d).forEach((len, k) => close(len, segLengths(reference.digits[i])[k] * 1.7, 1e-9));
      assert.ok(d.joints.every(j => Number.isFinite(j.x) && Number.isFinite(j.y)));
    });
  }
});

test('open hand is straighter than a fist', () => {
  const span = h => distance(h.digits[2].joints[0], h.digits[2].joints[3]);
  assert.ok(span(createArticulatedHand({pose: 'open'})) > span(createArticulatedHand({pose: 'fist'})) * 2);
});

test('pinch family: tips face each other ahead of the knuckles and the gap shrinks monotonically', () => {
  const surface = pose => pinchTips(createArticulatedHand({pose})).surfaceGap;
  assert.ok(surface('pinchWide') > surface('batteryPinch') && surface('batteryPinch') > surface('pinchTight'));
  assert.ok(surface('paperPinch') < 2, `paper pinch should nearly close (${surface('paperPinch')})`);
  for (const p of ['batteryPinch', 'pinchTight']) {
    const t = pinchTips(createArticulatedHand({pose: p}));
    close(t.axisDegrees, -90, 1);              // thumb→index axis perpendicular to the hand
    assert.ok(t.thumb.x > 40 && t.index.x > 40); // ahead of the palm (knuckles at x ≈ 35–39)
  }
});

test('pinchPoseForGap hits an exact opening anywhere in the family', () => {
  for (const g of [3, 8, 12.38, 20, 30]) {
    const {pose, achieved} = pinchPoseForGap(g);
    close(achieved, g, 1e-6);
    close(pinchTips(createArticulatedHand({pose})).surfaceGap, g, 1e-6);
  }
  assert.equal(pinchPoseForGap(1000).t, 0);
  assert.equal(pinchPoseForGap(-5).t, 1);
});

test('joint limits clamp impossible poses and report it', () => {
  assert.deepEqual(clampDigitCurl('index', [200, -40, 500]), [90, 0, 80]);
  const bad = {...HAND_POSES.open, index: {curl: [200, 0, 0]}};
  const hand = createArticulatedHand({pose: bad});
  assert.equal(hand.digits[1].clamped, true);
  assert.equal(hand.digits[2].clamped, false);
  assert.throws(() => createArticulatedHand({pose: {...HAND_POSES.open, ring: {curl: [NaN, 0, 0]}}}), RangeError);
});

test('left hand mirrors right hand across a vertical line', () => {
  for (const theta of [0, 25, -60, 120]) {
    const r = createArticulatedHand({pose: 'mugHandle', forwardDegrees: theta});
    const l = createArticulatedHand({pose: 'mugHandle', side: 'left', forwardDegrees: 180 - theta});
    r.digits.forEach((d, i) => d.joints.forEach((j, k) => {
      close(j.x, -l.digits[i].joints[k].x, 1e-9);
      close(j.y, l.digits[i].joints[k].y, 1e-9);
    }));
    close(r.gripPoint.x, -l.gripPoint.x, 1e-9);
  }
});

test('blending poses is continuous and hits both endpoints', () => {
  const a = createArticulatedHand({pose: blendHandPoses('open', 'mugHandle', 0)});
  const b = createArticulatedHand({pose: blendHandPoses('open', 'mugHandle', 1)});
  close(distance(a.digits[2].joints[3], createArticulatedHand({pose: 'open'}).digits[2].joints[3]), 0);
  close(distance(b.digits[2].joints[3], createArticulatedHand({pose: 'mugHandle'}).digits[2].joints[3]), 0);
  let prev = a.digits[2].joints[3];
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const tip = createArticulatedHand({pose: blendHandPoses('open', 'mugHandle', t)}).digits[2].joints[3];
    assert.ok(distance(prev, tip) < 6, 'fingertip moves smoothly between blend steps');
    prev = tip;
  }
});

test('wristForGrip places the grip point exactly on the target', () => {
  const opts = {pose: 'mugHandle', forwardDegrees: 20, scale: 2};
  const target = point(340, 410);
  const wrist = wristForGrip(target, opts);
  close(distance(createArticulatedHand({...opts, wrist}).gripPoint, target), 0, 1e-9);
});

test('attachHandToArm limits wrist bend relative to the forearm', () => {
  const arm = solveTwoBoneArm({shoulder: point(0, 0), upperArmLength: 50, forearmLength: 50}, point(70, 0));
  const ok = attachHandToArm(arm, {pose: 'open', handAngle: arm.forearmAngle + 30});
  close(ok.wristCorrection, 0);
  close(ok.wrist.x, arm.wrist.x);
  const extreme = attachHandToArm(arm, {pose: 'open', handAngle: arm.forearmAngle + 150, maxWristBend: 70});
  close(extreme.wristCorrection, 80, 1e-9);
  close(limitWristBend(170, -170).bend, 20, 1e-9);
});

test('SVG helpers produce path data', () => {
  const h = createArticulatedHand({pose: 'relaxed'});
  assert.match(digitPath(h.digits[1]), /^M[-\d.]+ [-\d.]+( L[-\d.]+ [-\d.]+){3}$/);
  assert.match(palmPath(h), /^M[-\d.]+ [-\d.]+( Q[-\d.]+ [-\d.]+ [-\d.]+ [-\d.]+)+ Z$/);
  const segs = digitSegments(h.digits[1], 6);
  assert.equal(segs.length, 3);
  assert.ok(segs[0].width > segs[2].width, 'digits taper toward the tip');
  close(segs[0].width, h.digits[1].widths[0] + 6);
});
