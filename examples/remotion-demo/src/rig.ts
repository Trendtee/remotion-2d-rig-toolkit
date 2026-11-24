/**
 * Pure, frame-based rig logic for the demo scenes. No React, no Remotion imports:
 * the same functions drive the video and the automated QC test (qc/continuity.test.mjs).
 */
import {
  attachHandToArm, blendHandPoses, createArticulatedHand, easeInOut, placePropAtBase, point,
  sampleScalar, samplePoint, samplePropInteraction, solveTwoBoneArm, worldAnchor, wristForGrip,
  type ArmSolution, type ArticulatedHand, type FrameKey, type HandPresetName, type Point,
  type PropDefinition, type PropFrame, type PropInteraction
} from 'remotion-2d-rig-toolkit';

export const HAND_SCALE = 2.1;
export const SHOULDER = point(318, 486);
export const ARM = {shoulder: SHOULDER, upperArmLength: 190, forearmLength: 180, elbowBend: 'clockwise' as const};
export const TABLE_TOP = 712;

export interface SceneConfig {
  id: string;
  title: string;
  prop: PropDefinition;
  gripPose: HandPresetName;
  startBase: Point;
  endBase: Point;
  /** Extra lift above the table while carrying, in px. */
  liftPx: number;
  durationInFrames: number;
  /** Key frames: [reachStart, contact, closed(pickup), lifted, carried, placed(release), opened, retreated, neutral]. */
  beats: readonly [number, number, number, number, number, number, number, number, number];
  /** Hand direction (deg) while holding the object. */
  holdAngle: number;
}

export const MUG: PropDefinition = {
  width: 150, height: 140,
  // Handle on the left (toward the character). Grip anchor = middle of the handle bar.
  gripAnchor: point(18, 72),
  baseAnchor: point(92, 138)
};

export const BATTERY: PropDefinition = {
  width: 40, height: 96,
  // Upright AA-style cell: pinched at the middle of its left edge, standing on its flat end.
  gripAnchor: point(4, 44),
  baseAnchor: point(20, 96)
};

export const MUG_SCENE: SceneConfig = {
  id: 'MugPickup', title: 'Reach · grip · lift · carry · place · release',
  prop: MUG, gripPose: 'mugHandle', startBase: point(570, TABLE_TOP), endBase: point(790, TABLE_TOP),
  liftPx: 130, durationInFrames: 240,
  beats: [18, 54, 66, 92, 140, 162, 174, 192, 226], holdAngle: -4
};

export const BATTERY_SCENE: SceneConfig = {
  id: 'BatteryPinch', title: 'Precision pinch · lift · place',
  prop: BATTERY, gripPose: 'batteryPinch', startBase: point(560, TABLE_TOP), endBase: point(740, TABLE_TOP),
  liftPx: 115, durationInFrames: 240,
  beats: [18, 54, 66, 92, 140, 162, 174, 192, 226], holdAngle: 0
};

export interface RigFrame {
  frame: number;
  arm: ArmSolution;
  hand: ArticulatedHand & {wristCorrection: number};
  prop: PropFrame;
  /** 0 = open/relaxed, 1 = fully closed grip pose. */
  closure: number;
  /** True around contact: all four fingers are drawn behind the object, only the thumb stays in front. */
  fingersBehindObject: boolean;
}

const restGrip = (s: SceneConfig) => worldAnchor(placePropAtBase(s.prop, s.startBase), s.prop.gripAnchor);
const placeGrip = (s: SceneConfig) => worldAnchor(placePropAtBase(s.prop, s.endBase), s.prop.gripAnchor);

export function buildScene(s: SceneConfig) {
  const [reach, contact, closed, lifted, carried, placed, opened, retreated, neutral] = s.beats;
  const a = restGrip(s);
  const b = placeGrip(s);
  const idle = point(SHOULDER.x + 40, SHOULDER.y + 352);
  // Approach from slightly above and behind the grip so fingers do not sweep through the object.
  const approach = point(a.x - 40, a.y - 50);
  const gripKeys: FrameKey<Point>[] = [
    {frame: 0, value: idle},
    {frame: reach, value: idle, interpolation: 'hold'},
    {frame: contact - 12, value: approach},
    {frame: contact, value: a},
    {frame: closed, value: a, interpolation: 'hold'},
    {frame: lifted, value: point(a.x + 20, a.y - s.liftPx)},
    {frame: carried, value: point(b.x - 20, b.y - s.liftPx)},
    {frame: placed, value: b},
    {frame: opened, value: b, interpolation: 'hold'},
    {frame: retreated, value: point(b.x - 70, b.y - 40)},
    {frame: neutral, value: idle}
  ];
  const angleKeys: FrameKey<number>[] = [
    {frame: 0, value: 72},
    {frame: reach, value: 72, interpolation: 'hold'},
    {frame: contact, value: s.holdAngle},
    {frame: placed, value: s.holdAngle},
    {frame: retreated, value: 20},
    {frame: neutral, value: 72}
  ];
  const closureKeys: FrameKey<number>[] = [
    {frame: 0, value: 0},
    {frame: contact - 6, value: 0, interpolation: 'hold'},
    {frame: closed, value: 1},
    {frame: placed, value: 1, interpolation: 'hold'},
    {frame: opened, value: 0}
  ];
  // Open the hand while reaching, close it on contact, open again on release, relax at the end.
  const openKeys: FrameKey<number>[] = [
    {frame: 0, value: 0},
    {frame: reach, value: 0, interpolation: 'hold'},
    {frame: contact - 8, value: 1},
    {frame: retreated, value: 1, interpolation: 'hold'},
    {frame: neutral, value: 0}
  ];

  const rigAt = (frame: number): Omit<RigFrame, 'prop'> => {
    const grip = samplePoint(gripKeys, frame);
    const handAngle = sampleScalar(angleKeys, frame);
    const closure = sampleScalar(closureKeys, frame);
    const openness = sampleScalar(openKeys, frame);
    // Wrist is placed so that the CLOSED grip pose lands on the requested grip point;
    // the fingers then close in place without moving the palm.
    const wristTarget = wristForGrip(grip, {pose: s.gripPose, forwardDegrees: handAngle, scale: HAND_SCALE});
    const arm = solveTwoBoneArm(ARM, wristTarget);
    const loose = blendHandPoses('relaxed', 'open', easeInOut(openness));
    const pose = blendHandPoses(loose, s.gripPose, easeInOut(closure));
    const hand = attachHandToArm(arm, {pose, handAngle, scale: HAND_SCALE, maxWristBend: 80});
    const fingersBehindObject = frame >= contact - 10 && frame <= opened + 4;
    return {frame, arm, hand, closure, fingersBehindObject};
  };

  /** Grip point of the fully closed pose at the ACTUAL solved wrist and hand angle. */
  const actualGrip = (frame: number): Point => {
    const r = rigAt(frame);
    return createArticulatedHand({pose: s.gripPose, wrist: r.arm.wrist, forwardDegrees: r.hand.forwardDegrees, scale: HAND_SCALE}).gripPoint;
  };

  const interaction: PropInteraction = {
    prop: s.prop, initialBase: s.startBase, finalBase: s.endBase,
    pickupFrame: closed, releaseFrame: placed, settleFrames: 0,
    gripAtFrame: actualGrip
  };

  const frameAt = (frame: number): RigFrame => ({...rigAt(frame), prop: samplePropInteraction(interaction, frame)});
  return {frameAt, interaction, scene: s};
}
