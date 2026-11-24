// Automated continuity QC for the demo scenes. Runs the exact rig code used by the video.
// Requires Node.js with TypeScript type stripping (22.18+ / 24+): `npm run qc`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {distance, inspectPropInteraction, measureDigitContacts, propOutline, worldAnchor} from 'remotion-2d-rig-toolkit';
import {buildScene, MUG_SCENE, BATTERY_SCENE} from '../src/rig.ts';

for (const scene of [MUG_SCENE, BATTERY_SCENE]) {
  test(`${scene.id}: hand reaches the object, carries it and sets it down without teleports`, () => {
    const {frameAt, interaction} = buildScene(scene);
    const report = inspectPropInteraction(interaction, 0, scene.durationInFrames - 1, {tolerancePx: 0.5, maxJumpPx: 14});
    assert.ok(report.pickup.ok, `pickup contact error ${report.pickup.errorPx.toFixed(2)}px`);
    assert.ok(report.release.ok, `release contact error ${report.release.errorPx.toFixed(2)}px`);
    assert.ok(report.maxJumpPx <= 14, `object jumps ${report.maxJumpPx.toFixed(1)}px at frame ${report.maxJumpFrame}`);

    let maxWristJump = 0, maxCorrection = 0, maxReachError = 0, minElbow = 180, maxElbow = 0, maxElbowStep = 0, maxTurnStep = 0;
    // Hand-to-object transfer windows: the wrist must be exactly where the grip was planned.
    const b = scene.beats;
    const opened = scene.mode === 'pinch' ? b[7] : b[6];
    const inTransfer = f => (f >= b[1] && f <= interaction.pickupFrame) || (f >= interaction.releaseFrame && f <= opened);
    let prev = frameAt(0);
    for (let f = 0; f < scene.durationInFrames; f++) {
      const r = frameAt(f);
      maxReachError = Math.max(maxReachError, r.arm.reachError);
      if (inTransfer(f)) maxCorrection = Math.max(maxCorrection, r.hand.wristCorrection);
      minElbow = Math.min(minElbow, r.arm.elbowAngle);
      maxElbow = Math.max(maxElbow, r.arm.elbowAngle);
      if (f > 0) {
        maxWristJump = Math.max(maxWristJump, distance(prev.arm.wrist, r.arm.wrist));
        maxElbowStep = Math.max(maxElbowStep, Math.abs(r.arm.elbowAngle - prev.arm.elbowAngle));
        if (r.prop.phase === 'held' && prev.prop.phase === 'held') {
          maxTurnStep = Math.max(maxTurnStep, Math.abs(r.prop.pose.angleDegrees - prev.prop.pose.angleDegrees));
        }
      }
      // Bone lengths never change.
      assert.ok(Math.abs(distance(r.arm.shoulder, r.arm.elbow) - 190) < 1e-6 && Math.abs(distance(r.arm.elbow, r.arm.wrist) - 180) < 1e-6);
      // While held, the object's grip anchor must stay on the hand's grip point.
      if (r.prop.phase === 'held') {
        const anchor = worldAnchor(r.prop.pose, scene.prop.gripAnchor);
        assert.ok(distance(anchor, interaction.gripAtFrame(f)) < 1e-6, `object slips at frame ${f}`);
      }
      prev = r;
    }
    assert.ok(maxReachError < 1e-6, `IK target unreachable (error ${maxReachError.toFixed(1)}px)`);
    assert.ok(maxCorrection < 1e-6, `wrist clamped by ${maxCorrection.toFixed(1)}° during a hand–object transfer`);
    assert.ok(maxTurnStep < 2, `held object turns ${maxTurnStep.toFixed(2)}° in one frame`);
    assert.ok(maxElbow < 172 && minElbow > 30, `elbow range ${minElbow.toFixed(0)}–${maxElbow.toFixed(0)}°`);
    assert.ok(maxElbowStep < 6, `elbow angle jumps ${maxElbowStep.toFixed(1)}° in one frame`);
    assert.ok(maxWristJump < 16, `wrist moves ${maxWristJump.toFixed(1)}px in one frame`);
    console.log(`# ${scene.id}: pickup ${report.pickup.errorPx.toFixed(3)}px, release ${report.release.errorPx.toFixed(3)}px, ` +
      `max object step ${report.maxJumpPx.toFixed(1)}px, max wrist step ${maxWristJump.toFixed(1)}px, ` +
      `elbow ${minElbow.toFixed(0)}–${maxElbow.toFixed(0)}° (max ${maxElbowStep.toFixed(1)}°/frame), max held turn ${maxTurnStep.toFixed(2)}°/frame`);
  });
}

test('BatteryPinch: thumb and index oppose on both sides, nothing penetrates, release separates cleanly', () => {
  const scene = BATTERY_SCENE;
  const {frameAt} = buildScene(scene);
  const [, contact, pickup, , , placed, release, opened] = scene.beats;
  const TOUCH = 0.6;      // px: |clearance| below this counts as touching
  let minThumbIndex = Infinity, minPalm = Infinity, worstFrame = -1;
  for (let f = 0; f < scene.durationInFrames; f++) {
    const r = frameAt(f);
    const c = Object.fromEntries(measureDigitContacts(r.hand, propOutline(scene.prop, r.prop.pose)).map(x => [x.digit, x.clearance]));
    // Thumb, index and palm are drawn in front of the battery: they must never overlap it.
    const front = Math.min(c.thumb, c.index);
    if (front < minThumbIndex) { minThumbIndex = front; worstFrame = f; }
    minPalm = Math.min(minPalm, c.palm);
    if (f >= contact && f <= release) {
      assert.ok(Math.abs(c.thumb) < TOUCH, `thumb not touching at frame ${f} (${c.thumb.toFixed(2)}px)`);
      assert.ok(Math.abs(c.index) < TOUCH, `index not touching at frame ${f} (${c.index.toFixed(2)}px)`);
    }
    if (f < contact - 8) assert.ok(Math.min(c.thumb, c.index) > 0, `finger touches before contact at frame ${f}`);
    if (f >= opened) assert.ok(Math.min(c.thumb, c.index) > 2, `fingers still on the battery at frame ${f}`);
  }
  assert.ok(minThumbIndex > -TOUCH, `thumb/index penetrate the battery by ${(-minThumbIndex).toFixed(2)}px at frame ${worstFrame}`);
  assert.ok(minPalm > 0, `palm overlaps the battery (${minPalm.toFixed(2)}px)`);

  // Battery stability: rigid while carried, perfectly still once resting.
  const restPose = frameAt(placed).prop.pose;
  for (let f = release; f < scene.durationInFrames; f++) {
    assert.equal(distance(frameAt(f).prop.pose.topLeft, restPose.topLeft), 0, `battery moves after release at frame ${f}`);
  }
  assert.equal(frameAt(pickup - 1).prop.phase, 'resting');
  assert.equal(frameAt(pickup).prop.phase, 'held');
  assert.equal(frameAt(release).prop.phase, 'released');
  console.log(`# BatteryPinch contacts: min thumb/index clearance ${minThumbIndex.toFixed(2)}px, min palm clearance ${minPalm.toFixed(1)}px`);
});
