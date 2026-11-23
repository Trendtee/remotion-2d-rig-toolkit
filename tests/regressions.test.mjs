import test from 'node:test';
import assert from 'node:assert/strict';
import {
  point, distance, rotate, angleDelta, lerpAngle, angleBetween,
  solveTwoBoneArm, createHandGeometry, samplePropInteraction, worldAnchor,
  checkReleaseContact, inspectPropInteraction
} from '../dist/index.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `Expected ${a} ≈ ${b}`);

test('left hand is an exact mirror of the right hand at any wrist angle (v0.1.0 bug)', () => {
  for (const angle of [0, 30, -45, 90, 170]) {
    const r = createHandGeometry('handle', 'right', angle);
    const l = createHandGeometry('handle', 'left', angle);
    r.fingers.forEach((f, i) => {
      close(f.tip.x, -l.fingers[i].tip.x);
      close(f.tip.y, l.fingers[i].tip.y);
      close(f.base.x, -l.fingers[i].base.x);
    });
    close(r.palmCenter.x, -l.palmCenter.x);
    close(angleDelta(r.palmAngle, 180 - l.palmAngle), 0);
  }
});

test('elbowBend names match on-screen rotation; elbowSide stays backward compatible', () => {
  const base = {shoulder: point(0, 0), upperArmLength: 50, forearmLength: 50};
  const cw = solveTwoBoneArm({...base, elbowBend: 'clockwise'}, point(60, 0));
  const ccw = solveTwoBoneArm({...base, elbowBend: 'counterclockwise'}, point(60, 0));
  assert.ok(cw.elbow.y > 0, 'clockwise bend puts the elbow below a rightward reach (y down)');
  assert.ok(ccw.elbow.y < 0);
  const legacyLeft = solveTwoBoneArm({...base, elbowSide: 'left'}, point(60, 0));
  const legacyRight = solveTwoBoneArm({...base, elbowSide: 'right'}, point(60, 0));
  close(distance(legacyLeft.elbow, cw.elbow), 0);
  close(distance(legacyRight.elbow, ccw.elbow), 0);
});

test('IK reports forearm angle and elbow angle', () => {
  const s = solveTwoBoneArm({shoulder: point(0, 0), upperArmLength: 30, forearmLength: 40, elbowBend: 'clockwise'}, point(50, 0));
  close(s.elbowAngle, 90, 1e-9); // 30-40-50 right triangle
  close(s.forearmAngle, angleBetween(s.elbow, s.wrist));
  const straight = solveTwoBoneArm({shoulder: point(0, 0), upperArmLength: 30, forearmLength: 40}, point(500, 0));
  close(straight.elbowAngle, 180, 1e-6);
});

test('IK keeps bone lengths across a sweep of targets including inside the minimum reach', () => {
  const arm = {shoulder: point(10, 10), upperArmLength: 60, forearmLength: 35, elbowBend: 'clockwise'};
  for (let a = 0; a < 360; a += 15) {
    for (const r of [0, 5, 25, 50, 80, 95, 200]) {
      const s = solveTwoBoneArm(arm, {x: 10 + r * Math.cos(a), y: 10 + r * Math.sin(a)});
      close(distance(s.shoulder, s.elbow), 60, 1e-6);
      close(distance(s.elbow, s.wrist), 35, 1e-6);
      assert.ok(Number.isFinite(s.elbowAngle));
    }
  }
});

test('angle helpers interpolate along the shortest arc', () => {
  close(angleDelta(350, 10), 20);
  close(angleDelta(10, 350), -20);
  close(lerpAngle(350, 10, 0.5), 360);
  const p = rotate(point(1, 0), 450);
  close(p.x, 0); close(p.y, 1);
});

const prop = {width: 50, height: 60, gripAnchor: point(35, 15), baseAnchor: point(20, 55)};
const gripAtBase = base => point(base.x + 15, base.y - 40);

test('samplePropInteraction rejects non-finite frames (v0.1.0 returned "released" for NaN)', () => {
  const i = {prop, initialBase: point(0, 0), pickupFrame: 1, releaseFrame: 2, gripAtFrame: () => point(15, -40)};
  assert.throws(() => samplePropInteraction(i, NaN), RangeError);
  assert.throws(() => samplePropInteraction({...i, gripAtFrame: undefined}, 0), TypeError);
});

test('finalBase is honoured when settleFrames is omitted (v0.1.0 silently ignored it)', () => {
  const i = {prop, initialBase: point(200, 300), finalBase: point(400, 300), pickupFrame: 10, releaseFrame: 20,
    gripAtFrame: f => f <= 10 ? gripAtBase(point(200, 300)) : point(300, 200)};
  const end = samplePropInteraction(i, 25);
  close(distance(worldAnchor(end.pose, prop.baseAnchor), point(400, 300)), 0);
});

test('checkReleaseContact flags objects that would float or snap after release', () => {
  const table = point(400, 300);
  const placed = {prop, initialBase: point(200, 300), finalBase: table, pickupFrame: 10, releaseFrame: 20, settleFrames: 6,
    gripAtFrame: f => f <= 10 ? gripAtBase(point(200, 300)) : gripAtBase(table)};
  assert.equal(checkReleaseContact(placed).ok, true);
  const dropped = {...placed, gripAtFrame: f => f <= 10 ? gripAtBase(point(200, 300)) : point(300, 150)};
  const r = checkReleaseContact(dropped);
  assert.equal(r.ok, false);
  assert.ok(r.errorPx > 100);
});

test('inspectPropInteraction reports the largest per-frame jump', () => {
  const start = point(200, 300);
  const i = {prop, initialBase: start, pickupFrame: 10, releaseFrame: 20,
    gripAtFrame: f => f <= 10 ? gripAtBase(start) : point(gripAtBase(start).x + (f - 10) * 4, gripAtBase(start).y)};
  const report = inspectPropInteraction(i, 0, 30, {maxJumpPx: 5});
  assert.equal(report.pickup.ok, true);
  assert.equal(report.ok, true);
  close(report.maxJumpPx, 4);
  const teleport = inspectPropInteraction({...i, gripAtFrame: () => point(0, 0)}, 0, 30, {maxJumpPx: 5});
  assert.equal(teleport.ok, false);
  assert.equal(teleport.maxJumpFrame, 10);
});
