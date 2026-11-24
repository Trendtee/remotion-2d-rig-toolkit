/**
 * Pure, frame-based rig logic for the demo scenes. No React, no Remotion imports:
 * the same functions drive the video and the automated QC test (qc/continuity.test.mjs).
 */
import {
  add, attachHandToArm, blendHandPoses, createArticulatedHand, easeInOut, fromHandLocal, placePropAtBase, point,
  propPinchContacts, propPinchNormals, sampleScalar, sampleSmoothPoint, sampleSmoothScalar, samplePoint, samplePropInteraction, solvePinchGrip,
  solveTwoBoneArm, toHandLocal, worldAnchor, wristForGrip,
  type ArmSolution, type ArticulatedHand, type FrameKey, type PathKey, type HandPresetName, type Point,
  type PropDefinition, type PropFrame, type PropInteraction
} from 'remotion-2d-rig-toolkit';

export const HAND_SCALE = 2.1;
export const SHOULDER = point(318, 486);
// Elbow constraint: never fold tighter than 30° or lock fully straight.
export const ARM = {shoulder: SHOULDER, upperArmLength: 190, forearmLength: 180, elbowBend: 'clockwise' as const, minElbowAngle: 30, maxElbowAngle: 172};
export const TABLE_TOP = 712;

export interface SceneConfig {
  id: string;
  /** 'wrap': power grip around a handle. 'pinch': thumb–index opposition on two contact points. */
  mode: 'wrap' | 'pinch';
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
  width: 26, height: 70,
  // Upright cell standing on its flat end. The hand comes from the upper left, so the pinch axis is
  // oblique: the thumb touches the left side 24 px down, the index finger the right side 6 px down.
  // The grip anchor is the centre between those two contacts.
  pinchContacts: [point(0, 24), point(26, 6)],
  pinchNormals: [point(-1, 0), point(1, 0)],
  gripAnchor: point(13, 15),
  baseAnchor: point(13, 70)
};

export const MUG_SCENE: SceneConfig = {
  id: 'MugPickup', mode: 'wrap', title: 'Reach · grip · lift · carry · place · release',
  prop: MUG, gripPose: 'mugHandle', startBase: point(570, TABLE_TOP), endBase: point(790, TABLE_TOP),
  liftPx: 130, durationInFrames: 240,
  beats: [18, 54, 66, 92, 140, 162, 174, 192, 226], holdAngle: -4
};

export const BATTERY_SCENE: SceneConfig = {
  id: 'BatteryPinch', mode: 'pinch', title: 'Precision pinch · lift · carry · place',
  prop: BATTERY, gripPose: 'batteryPinch', startBase: point(640, TABLE_TOP), endBase: point(700, TABLE_TOP),
  liftPx: 42, durationInFrames: 240,
  // [reachStart, contact(closed), pickup, lifted, carried, placed, release, opened, neutral]
  beats: [20, 74, 76, 96, 150, 168, 170, 180, 236], holdAngle: 0
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
  return s.mode === 'pinch' ? buildPinchScene(s) : buildWrapScene(s);
}

function buildWrapScene(s: SceneConfig) {
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

/**
 * Precision pinch: the hand is placed by the object's two pinch contacts (thumb side, index side).
 *
 * Sequence: reach (hand comes over the object, fingers open) → descend with an open pinch that clears
 * both sides → close until thumb and index touch → ownership transfers → lift, carry, lower until the
 * base meets the table → ownership transfers back → fingers open sideways → hand lifts clear → rest.
 * The wrist is always placed for the CLOSED pose, so closing and opening never drag the object.
 */
function buildPinchScene(s: SceneConfig) {
  const [reach, contact, pickup, lifted, carried, placed, release, opened, neutral] = s.beats;
  const opts = {scale: HAND_SCALE} as const;
  // Where the object's base would be if the hand carried it along this path.
  const baseKeys: FrameKey<Point>[] = [
    {frame: 0, value: s.startBase},
    {frame: pickup, value: s.startBase, interpolation: 'hold'},
    {frame: lifted, value: point(s.startBase.x + 0.4 * (s.endBase.x - s.startBase.x), s.startBase.y - s.liftPx)},
    {frame: carried, value: point(s.endBase.x, s.endBase.y - s.liftPx)},
    {frame: placed, value: s.endBase},
    {frame: neutral, value: s.endBase, interpolation: 'hold'}
  ];
  // The closed pinch is SOLVED from the object's contacts and normals: pose opening and wrist placement.
  const placementAt = (frame: number) => {
    const pose = placePropAtBase(s.prop, samplePoint(baseKeys, frame));
    const [thumbSide, indexSide] = propPinchContacts(s.prop, pose);
    return solvePinchGrip(thumbSide, indexSide, {...opts, ...propPinchNormals(s.prop, pose)});
  };
  const closedPose = placementAt(0).pose;
  // Where the object's grip anchor sits in the hand's own frame once the pinch is closed (rigid attachment).
  const restProp = placePropAtBase(s.prop, s.startBase);
  const solvedAtRest = placementAt(0);
  const gripLocal = toHandLocal({...solvedAtRest, scale: HAND_SCALE, side: 'right'}, worldAnchor(restProp, s.prop.gripAnchor));
  const atStart = placementAt(contact);
  const atEnd = placementAt(release);
  const idleWrist = point(SHOULDER.x + 40, SHOULDER.y + 352);
  const idleAngle = 80;
  // Approach and retreat are keyed in world space and pass ABOVE the object, so no finger sweeps through it.
  // Between `contact - 8` and `opened` the wrist follows the closed-pinch placement exactly.
  const pathKeys: PathKey<Point>[] = [
    {frame: 0, value: idleWrist},
    {frame: reach, value: idleWrist, interpolation: 'hold'},
    {frame: contact - 28, value: add(atStart.wrist, point(-125, 5))},
    {frame: contact - 16, value: add(atStart.wrist, point(-20, -50))},
    {frame: contact - 8, value: atStart.wrist, stop: true},
    {frame: opened, value: atEnd.wrist, stop: true},
    {frame: opened + 16, value: add(atEnd.wrist, point(-18, -44))},
    {frame: opened + 30, value: add(atEnd.wrist, point(-150, 30))},
    {frame: neutral, value: idleWrist}
  ];
  const angleKeys: PathKey<number>[] = [
    {frame: 0, value: idleAngle},
    {frame: reach, value: idleAngle, interpolation: 'hold'},
    {frame: contact - 16, value: atStart.forwardDegrees},
    {frame: opened + 12, value: atEnd.forwardDegrees, interpolation: 'hold'},
    {frame: neutral, value: idleAngle}
  ];
  // Finger shaping: relaxed → open pinch → closed on the object → open → relaxed.
  const openKeys: FrameKey<number>[] = [
    {frame: 0, value: 0}, {frame: reach + 4, value: 0, interpolation: 'hold'}, {frame: contact - 16, value: 1},
    {frame: opened + 12, value: 1, interpolation: 'hold'}, {frame: neutral - 6, value: 0}
  ];
  const closeKeys: FrameKey<number>[] = [
    {frame: 0, value: 0}, {frame: contact - 8, value: 0, interpolation: 'hold'}, {frame: contact, value: 1},
    {frame: release, value: 1, interpolation: 'hold'}, {frame: opened, value: 0}
  ];

  const rigAt = (frame: number): Omit<RigFrame, 'prop'> => {
    const following = frame >= contact - 8 && frame <= opened;
    const place = following ? placementAt(frame) : null;
    const wristTarget = place ? place.wrist : sampleSmoothPoint(pathKeys, frame);
    const handAngle = place ? place.forwardDegrees : sampleSmoothScalar(angleKeys, frame);
    const arm = solveTwoBoneArm(ARM, wristTarget);
    const shaped = blendHandPoses('relaxed', 'pinchWide', easeInOut(sampleScalar(openKeys, frame)));
    const closure = sampleScalar(closeKeys, frame);
    const pose = blendHandPoses(shaped, closedPose, easeInOut(closure));
    const hand = attachHandToArm(arm, {pose, handAngle, maxWristBend: 80, ...opts});
    return {frame, arm, hand, closure, fingersBehindObject: false};
  };

  // The object follows the ACTUAL solved hand, so any IK or wrist clamping shows up in QC instead of hiding.
  const actualGrip = (frame: number): Point => fromHandLocal(rigAt(frame).hand, gripLocal);

  const interaction: PropInteraction = {
    prop: s.prop, initialBase: s.startBase, finalBase: s.endBase,
    pickupFrame: pickup, releaseFrame: release, settleFrames: 0,
    gripAtFrame: actualGrip,
    // While held, the object turns exactly as much as the hand has turned since the pinch closed.
    heldAngleAtFrame: (frame: number) => rigAt(frame).hand.forwardDegrees - solvedAtRest.forwardDegrees
  };
  const frameAt = (frame: number): RigFrame => ({...rigAt(frame), prop: samplePropInteraction(interaction, frame)});
  return {frameAt, interaction, scene: s};
}
