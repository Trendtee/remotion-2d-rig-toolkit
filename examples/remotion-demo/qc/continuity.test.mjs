// Automated continuity QC for the demo scenes. Runs the exact rig logic used by the video.
// Requires Node.js with TypeScript type stripping (22.18+ / 24+): `npm run qc`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {distance, inspectPropInteraction, worldAnchor} from 'remotion-2d-rig-toolkit';
import {buildScene, MUG_SCENE, BATTERY_SCENE} from '../src/rig.ts';

for (const scene of [MUG_SCENE, BATTERY_SCENE]) {
  test(`${scene.id}: hand reaches the object, carries it and sets it down without teleports`, () => {
    const {frameAt, interaction} = buildScene(scene);
    const report = inspectPropInteraction(interaction, 0, scene.durationInFrames - 1, {tolerancePx: 0.5, maxJumpPx: 14});
    assert.ok(report.pickup.ok, `pickup contact error ${report.pickup.errorPx.toFixed(2)}px`);
    assert.ok(report.release.ok, `release contact error ${report.release.errorPx.toFixed(2)}px`);
    assert.ok(report.maxJumpPx <= 14, `object jumps ${report.maxJumpPx.toFixed(1)}px at frame ${report.maxJumpFrame}`);

    let maxWristJump = 0, maxCorrection = 0, maxReachError = 0, minElbow = 180, maxElbow = 0;
    let prev = frameAt(0);
    for (let f = 0; f < scene.durationInFrames; f++) {
      const r = frameAt(f);
      maxReachError = Math.max(maxReachError, r.arm.reachError);
      maxCorrection = Math.max(maxCorrection, r.hand.wristCorrection);
      minElbow = Math.min(minElbow, r.arm.elbowAngle);
      maxElbow = Math.max(maxElbow, r.arm.elbowAngle);
      if (f > 0) maxWristJump = Math.max(maxWristJump, distance(prev.arm.wrist, r.arm.wrist));
      // While held, the object's grip anchor must stay on the hand's grip point.
      if (r.prop.phase === 'held') {
        const anchor = worldAnchor(r.prop.pose, scene.prop.gripAnchor);
        assert.ok(distance(anchor, interaction.gripAtFrame(f)) < 1e-6, `object slips at frame ${f}`);
      }
      prev = r;
    }
    assert.ok(maxReachError < 1e-6, `IK target unreachable (error ${maxReachError.toFixed(1)}px)`);
    assert.ok(maxCorrection < 1e-6, `wrist bend exceeded limit by ${maxCorrection.toFixed(1)}°`);
    assert.ok(maxElbow < 172, `arm locks straight (elbow ${maxElbow.toFixed(0)}°)`);
    assert.ok(minElbow > 25, `elbow folds unnaturally (${minElbow.toFixed(0)}°)`);
    assert.ok(maxWristJump < 16, `wrist moves ${maxWristJump.toFixed(1)}px in one frame`);
    console.log(`# ${scene.id}: pickup ${report.pickup.errorPx.toFixed(3)}px, release ${report.release.errorPx.toFixed(3)}px, ` +
      `max object step ${report.maxJumpPx.toFixed(1)}px, max wrist step ${maxWristJump.toFixed(1)}px, elbow ${minElbow.toFixed(0)}–${maxElbow.toFixed(0)}°`);
  });
}
