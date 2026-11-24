import test from 'node:test';
import assert from 'node:assert/strict';
import {
  point, distance, rotate, createArticulatedHand, placeHandForPinch, solvePinchGrip, measureDigitContacts,
  signedDistanceToConvexPolygon, pinchTips, toHandLocal, fromHandLocal, solveTwoBoneArm, reachForElbowAngle,
  sampleSmoothPoint, sampleSmoothScalar, sampleScalar, samplePropInteraction, checkPickupContact,
  checkReleaseContact, propPinchContacts, propPinchNormals, propOutline, placePropAtBase, worldAnchor
} from '../dist/index.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `Expected ${a} ≈ ${b}`);
const rect = (x, y, w, h) => [point(x, y), point(x + w, y), point(x + w, y + h), point(x, y + h)];

test('signed distance to a convex polygon is negative inside and positive outside', () => {
  const r = rect(0, 0, 10, 20);
  close(signedDistanceToConvexPolygon(point(5, 10), r), -5);
  close(signedDistanceToConvexPolygon(point(13, 10), r), 3);
  close(signedDistanceToConvexPolygon(point(0, 0), r), 0);
});

test('solvePinchGrip touches both sides of an object exactly, also with an oblique pinch axis', () => {
  const battery = rect(100, 200, 26, 70);
  for (const [thumbC, indexC] of [[point(100, 211), point(126, 211)], [point(100, 224), point(126, 206)]]) {
    const g = solvePinchGrip(thumbC, indexC, {scale: 2.1, thumbNormal: point(-1, 0), indexNormal: point(1, 0)});
    assert.ok(g.fitted);
    const hand = createArticulatedHand({pose: g.pose, wrist: g.wrist, forwardDegrees: g.forwardDegrees, scale: 2.1});
    const c = Object.fromEntries(measureDigitContacts(hand, battery).map(x => [x.digit, x.clearance]));
    assert.ok(Math.abs(c.thumb) < 0.05, `thumb clearance ${c.thumb}`);
    assert.ok(Math.abs(c.index) < 0.05, `index clearance ${c.index}`);
    assert.ok(c.palm > 0, 'palm stays clear of the object');
    // Thumb on the left side, index on the right side.
    assert.ok(hand.digits[0].joints[3].x < 100 && hand.digits[1].joints[3].x > 126);
  }
});

test('placeHandForPinch with a wider pose straddles the object evenly without touching', () => {
  const g = solvePinchGrip(point(0, 0), point(20, 0), {scale: 2});
  const open = placeHandForPinch(point(0, 0), point(20, 0), {pose: 'pinchWide', scale: 2});
  assert.ok(open.thumbClearance > 0 && open.indexClearance > 0);
  close(open.thumbClearance, open.indexClearance);
  close(g.thumbClearance, 0, 1e-6);
});

test('left-hand pinch mirrors the right-hand pinch', () => {
  const r = solvePinchGrip(point(10, 0), point(30, 0), {scale: 1});
  const l = solvePinchGrip(point(-10, 0), point(-30, 0), {scale: 1, side: 'left'});
  close(r.wrist.x, -l.wrist.x, 1e-6);
  close(r.wrist.y, l.wrist.y, 1e-6);
});

test('hand-local coordinates round-trip, including mirrored hands', () => {
  for (const side of ['right', 'left']) {
    const h = createArticulatedHand({pose: 'open', side, wrist: point(40, -12), forwardDegrees: 33, scale: 1.7});
    const p = point(123.4, 56.7);
    const back = fromHandLocal(h, toHandLocal(h, p));
    close(back.x, p.x); close(back.y, p.y);
  }
});

test('elbow limits clamp the reach and report it, preserving bone lengths', () => {
  const arm = {shoulder: point(0, 0), upperArmLength: 50, forearmLength: 50, minElbowAngle: 40, maxElbowAngle: 160};
  const near = solveTwoBoneArm(arm, point(5, 0));
  assert.ok(near.elbowLimited && !near.targetReachable);
  close(near.elbowAngle, 40, 1e-6);
  const far = solveTwoBoneArm(arm, point(200, 0));
  close(far.elbowAngle, 160, 1e-6);
  close(distance(far.shoulder, far.wrist), reachForElbowAngle(50, 50, 160));
  close(distance(far.elbow, far.wrist), 50);
  const ok = solveTwoBoneArm(arm, point(70, 10));
  assert.equal(ok.elbowLimited, false);
  assert.throws(() => solveTwoBoneArm({...arm, minElbowAngle: 170, maxElbowAngle: 10}, point(1, 1)), RangeError);
});

test('smooth paths pass through every key and keep velocity through waypoints', () => {
  const keys = [{frame: 0, value: point(0, 0)}, {frame: 10, value: point(100, 0)}, {frame: 20, value: point(200, 50)}, {frame: 30, value: point(300, 50)}];
  for (const k of keys) { const p = sampleSmoothPoint(keys, k.frame); close(p.x, k.value.x); close(p.y, k.value.y); }
  // Through an intermediate key the speed does not drop to zero (unlike per-segment easing).
  const v = f => distance(sampleSmoothPoint(keys, f + 0.5), sampleSmoothPoint(keys, f - 0.5));
  assert.ok(v(10) > 5, `speed at waypoint ${v(10)}`);
  const eased = [{frame: 0, value: 0}, {frame: 10, value: 100}, {frame: 20, value: 200}];
  assert.ok(Math.abs(sampleScalar(eased, 10.5) - sampleScalar(eased, 9.5)) < Math.abs(sampleSmoothScalar(eased, 10.5) - sampleSmoothScalar(eased, 9.5)));
  // `stop` brings the motion to rest at that key.
  const stopped = keys.map((k, i) => i === 1 ? {...k, stop: true} : k);
  assert.ok(distance(sampleSmoothPoint(stopped, 10.01), sampleSmoothPoint(stopped, 9.99)) < 0.01);
  assert.throws(() => sampleSmoothScalar([{frame: 2, value: 0}, {frame: 1, value: 1}], 1));
});

test('held objects can turn with the hand; transfer checks report rotation mismatches', () => {
  const prop = {width: 26, height: 70, gripAnchor: point(13, 15), baseAnchor: point(13, 70),
    pinchContacts: [point(0, 24), point(26, 6)], pinchNormals: [point(-1, 0), point(1, 0)]};
  const start = point(100, 300), end = point(200, 300);
  const gripStart = worldAnchor(placePropAtBase(prop, start), prop.gripAnchor);
  const gripEnd = worldAnchor(placePropAtBase(prop, end), prop.gripAnchor);
  const i = {prop, initialBase: start, finalBase: end, pickupFrame: 10, releaseFrame: 30,
    gripAtFrame: f => f <= 10 ? gripStart : f >= 30 ? gripEnd : point(gripStart.x + (f - 10) * 5, gripStart.y - 20),
    heldAngleAtFrame: f => f <= 10 || f >= 30 ? 0 : Math.sin((f - 10) / 20 * Math.PI) * 8};
  assert.ok(checkPickupContact(i).ok && checkReleaseContact(i).ok);
  close(samplePropInteraction(i, 20).pose.angleDegrees, 8);
  const tilted = {...i, heldAngleAtFrame: () => 5};
  const r = checkReleaseContact(tilted, 1e6);
  assert.equal(r.ok, false);
  close(r.angleErrorDegrees, 5);
  // World contacts and normals follow the prop's rotation.
  const pose = {topLeft: point(0, 0), scale: 1, angleDegrees: 90};
  const [t] = propPinchContacts(prop, pose);
  close(t.x, -24); close(t.y, 0);
  const n = propPinchNormals(prop, pose).thumbNormal;
  close(n.x, 0, 1e-12); close(n.y, -1);
  assert.equal(propOutline(prop, placePropAtBase(prop, start)).length, 4);
});
