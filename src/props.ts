import {add, clamp, distance, easeInOut, isFinitePoint, mix, multiply, point, rotate, subtract, type Point} from './geometry.js';

/** Coordinates are in the artwork's unscaled local units, relative to its top-left origin. */
export interface PropDefinition {
  width: number;
  height: number;
  /** Where fingers grip the object, e.g. a mug handle or battery edge. */
  gripAnchor: Point;
  /** Where the object touches a table or shelf. */
  baseAnchor: Point;
  /**
   * Optional precision-pinch contacts on the object's outline: where the thumb and the index finger
   * touch it, e.g. the left and right sides of a battery. Used with `placeHandForPinch()`.
   */
  pinchContacts?: readonly [thumb: Point, index: Point];
  /** Outward surface normals at the two pinch contacts (local, unrotated). See `PinchContactOptions`. */
  pinchNormals?: readonly [thumb: Point, index: Point];
}
export interface PropPose {
  topLeft: Point;
  scale: number;
  angleDegrees: number;
}
export type PropPhase = 'resting' | 'held' | 'settling' | 'released';
export type PropFrame = Readonly<{phase: PropPhase; pose: PropPose}>;

export function worldAnchor(pose: PropPose, localAnchor: Point): Point {
  return add(pose.topLeft, rotate(multiply(localAnchor, pose.scale), pose.angleDegrees));
}
/** World positions of a prop's pinch contacts (thumb side, index side) for a given pose. */
export function propPinchContacts(def: PropDefinition, pose: PropPose): [Point, Point] {
  if (!def.pinchContacts) throw new RangeError('This prop has no pinchContacts');
  return [worldAnchor(pose, def.pinchContacts[0]), worldAnchor(pose, def.pinchContacts[1])];
}

/** World-space surface normals at a prop's pinch contacts (thumb side, index side), if defined. */
export function propPinchNormals(def: PropDefinition, pose: PropPose): {thumbNormal?: Point; indexNormal?: Point} {
  if (!def.pinchNormals) return {};
  return {thumbNormal: rotate(def.pinchNormals[0], pose.angleDegrees), indexNormal: rotate(def.pinchNormals[1], pose.angleDegrees)};
}

/** The prop's outline as a world-space rectangle (four corners), e.g. for `measureDigitContacts()`. */
export function propOutline(def: PropDefinition, pose: PropPose): Point[] {
  return [point(0, 0), point(def.width, 0), point(def.width, def.height), point(0, def.height)].map(p => worldAnchor(pose, p));
}

function placeAtAnchor(localAnchor: Point, worldTarget: Point, scale: number, angleDegrees: number): PropPose {
  if (!isFinitePoint(localAnchor) || !isFinitePoint(worldTarget) ||
      !Number.isFinite(scale) || scale <= 0 || !Number.isFinite(angleDegrees)) {
    throw new RangeError('Expected finite anchors, a positive scale, and a finite angle');
  }
  return {topLeft: subtract(worldTarget, rotate(multiply(localAnchor, scale), angleDegrees)), scale, angleDegrees};
}
export function placePropAtBase(def: PropDefinition, baseWorld: Point, scale = 1, angleDegrees = 0): PropPose {
  return placeAtAnchor(def.baseAnchor, baseWorld, scale, angleDegrees);
}
export function placePropAtGrip(def: PropDefinition, gripWorld: Point, scale = 1, angleDegrees = 0): PropPose {
  return placeAtAnchor(def.gripAnchor, gripWorld, scale, angleDegrees);
}

export interface PropInteraction {
  prop: PropDefinition;
  /** Initial point of contact with the resting surface, in world coordinates. */
  initialBase: Point;
  /** Contact occurs at this exact frame; hand must already overlap the initial grip anchor. */
  pickupFrame: number;
  /** Last frame of hand ownership; release is at the hand's current position. */
  releaseFrame: number;
  /** Returns the animated hand grip location at the given frame. */
  gripAtFrame: (frame: number) => Point;
  /**
   * Where the object's base anchor ends up after release. With `settleFrames > 0` the object eases
   * there; with `settleFrames` 0 or omitted it is placed there on the release frame.
   * For a believable placement the hand should already have set the object down here; use
   * `checkReleaseContact()` to measure how far the object would travel on its own after release.
   */
  finalBase?: Point;
  settleFrames?: number;
  scale?: number;
  /** Rotation while resting (before pickup) and after release at `finalBase`. Default 0. */
  angleDegrees?: number;
  /**
   * Optional rotation while held, e.g. the object turning with the wrist. When set, it is used from
   * `pickupFrame` up to and including the release pose. It should equal `angleDegrees` at both
   * transfer frames; `checkPickupContact` / `checkReleaseContact` report the difference.
   */
  heldAngleAtFrame?: (frame: number) => number;
}

function validateInteraction(i: PropInteraction): void {
  if (typeof i.gripAtFrame !== 'function') throw new TypeError('gripAtFrame must be a function');
  if (![i.pickupFrame, i.releaseFrame].every(Number.isFinite) || i.pickupFrame >= i.releaseFrame) {
    throw new RangeError('pickupFrame must precede releaseFrame');
  }
  if (i.settleFrames !== undefined && (!Number.isFinite(i.settleFrames) || i.settleFrames < 0)) {
    throw new RangeError('settleFrames must be nonnegative');
  }
}

/**
 * A prop changes ownership from the surface to the hand, then back to the world.
 * No interpolation is applied *at* pickup: the hand must reach the handle first.
 * Call checkPickupContact() before animation to catch discontinuity early.
 */
export function samplePropInteraction(i: PropInteraction, frame: number): PropFrame {
  validateInteraction(i);
  if (!Number.isFinite(frame)) throw new RangeError('Frame must be finite');
  const scale = i.scale ?? 1;
  const angleDegrees = i.angleDegrees ?? 0;
  if (frame < i.pickupFrame) return {phase: 'resting', pose: placePropAtBase(i.prop, i.initialBase, scale, angleDegrees)};
  const heldAngle = (f: number) => i.heldAngleAtFrame ? i.heldAngleAtFrame(f) : angleDegrees;
  if (frame < i.releaseFrame) return {phase: 'held', pose: placePropAtGrip(i.prop, i.gripAtFrame(frame), scale, heldAngle(frame))};

  const releasePose = placePropAtGrip(i.prop, i.gripAtFrame(i.releaseFrame), scale, heldAngle(i.releaseFrame));
  const settleFrames = i.settleFrames ?? 0;
  if (!i.finalBase) return {phase: 'released', pose: releasePose};
  const destination = placePropAtBase(i.prop, i.finalBase, scale, angleDegrees);
  // v0.1.0 silently ignored finalBase when settleFrames was 0/omitted; it is now honoured.
  if (settleFrames === 0) return {phase: 'released', pose: destination};
  if (frame >= i.releaseFrame + settleFrames) return {phase: 'released', pose: destination};
  const t = easeInOut(clamp((frame - i.releaseFrame) / settleFrames, 0, 1));
  return {phase: 'settling', pose: {...releasePose, topLeft: mix(releasePose.topLeft, destination.topLeft, t)}};
}

export interface ContactCheck {
  ok: boolean;
  errorPx: number;
  hand: Point;
  propAnchor: Point;
  /** Rotation mismatch at the transfer frame (only with `heldAngleAtFrame`), degrees. */
  angleErrorDegrees: number;
}
/** Detects a would-be object teleport on pickup, before rendering. */
export function checkPickupContact(i: PropInteraction, tolerancePx = 1): ContactCheck {
  validateInteraction(i);
  const restPose = placePropAtBase(i.prop, i.initialBase, i.scale ?? 1, i.angleDegrees ?? 0);
  const propAnchor = worldAnchor(restPose, i.prop.gripAnchor);
  const hand = i.gripAtFrame(i.pickupFrame);
  const errorPx = distance(hand, propAnchor);
  const angleErrorDegrees = i.heldAngleAtFrame ? Math.abs(i.heldAngleAtFrame(i.pickupFrame) - (i.angleDegrees ?? 0)) : 0;
  return {ok: errorPx <= tolerancePx && angleErrorDegrees <= 0.5, errorPx, hand, propAnchor, angleErrorDegrees};
}

/**
 * Detects an object that would move on its own after the hand lets go.
 * Compares the object's base anchor at the release frame (while still in the hand) with `finalBase`.
 * A large error means the object floats or snaps to the table after release.
 * Without `finalBase`, the object stays where it was released and the check passes.
 */
export function checkReleaseContact(i: PropInteraction, tolerancePx = 1): ContactCheck {
  validateInteraction(i);
  const scale = i.scale ?? 1;
  const angleDegrees = i.angleDegrees ?? 0;
  const hand = i.gripAtFrame(i.releaseFrame);
  const heldAngle = i.heldAngleAtFrame ? i.heldAngleAtFrame(i.releaseFrame) : angleDegrees;
  const releasePose = placePropAtGrip(i.prop, hand, scale, heldAngle);
  const baseAtRelease = worldAnchor(releasePose, i.prop.baseAnchor);
  const target = i.finalBase ?? baseAtRelease;
  const errorPx = distance(baseAtRelease, target);
  const angleErrorDegrees = i.finalBase ? Math.abs(heldAngle - angleDegrees) : 0;
  return {ok: errorPx <= tolerancePx && angleErrorDegrees <= 0.5, errorPx, hand, propAnchor: baseAtRelease, angleErrorDegrees};
}

/**
 * Runs both contact checks and the per-frame hand/object attachment check across a frame range.
 * Intended for automated QC in tests or CI before rendering.
 */
export interface InteractionReport {
  pickup: ContactCheck;
  release: ContactCheck;
  /** Largest per-frame jump of the object's top-left corner, and the frame where it happens. */
  maxJumpPx: number;
  maxJumpFrame: number;
  ok: boolean;
}
export function inspectPropInteraction(i: PropInteraction, fromFrame: number, toFrame: number,
  options: {tolerancePx?: number; maxJumpPx?: number} = {}): InteractionReport {
  const tolerancePx = options.tolerancePx ?? 1;
  const limit = options.maxJumpPx ?? Infinity;
  const pickup = checkPickupContact(i, tolerancePx);
  const release = checkReleaseContact(i, tolerancePx);
  let maxJumpPx = 0;
  let maxJumpFrame = fromFrame;
  let prev = samplePropInteraction(i, fromFrame).pose.topLeft;
  for (let f = fromFrame + 1; f <= toFrame; f++) {
    const cur = samplePropInteraction(i, f).pose.topLeft;
    const jump = distance(prev, cur);
    if (jump > maxJumpPx) { maxJumpPx = jump; maxJumpFrame = f; }
    prev = cur;
  }
  return {pickup, release, maxJumpPx, maxJumpFrame, ok: pickup.ok && release.ok && maxJumpPx <= limit};
}
