import {add, clamp, distance, easeInOut, isFinitePoint, mix, multiply, rotate, subtract, type Point} from './geometry.js';

/** Coordinates are in the artwork's unscaled local units, relative to its top-left origin. */
export interface PropDefinition {
  width: number;
  height: number;
  /** Where fingers grip the object, e.g. a mug handle or battery edge. */
  gripAnchor: Point;
  /** Where the object touches a table or shelf. */
  baseAnchor: Point;
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
  /** Optional landing contact for a smooth post-release movement. */
  finalBase?: Point;
  settleFrames?: number;
  scale?: number;
  angleDegrees?: number;
}

function validateInteraction(i: PropInteraction): void {
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
  const scale = i.scale ?? 1;
  const angleDegrees = i.angleDegrees ?? 0;
  if (frame < i.pickupFrame) return {phase: 'resting', pose: placePropAtBase(i.prop, i.initialBase, scale, angleDegrees)};
  if (frame < i.releaseFrame) return {phase: 'held', pose: placePropAtGrip(i.prop, i.gripAtFrame(frame), scale, angleDegrees)};

  const releasePose = placePropAtGrip(i.prop, i.gripAtFrame(i.releaseFrame), scale, angleDegrees);
  const settleFrames = i.settleFrames ?? 0;
  if (!i.finalBase || settleFrames === 0) return {phase: 'released', pose: releasePose};
  const destination = placePropAtBase(i.prop, i.finalBase, scale, angleDegrees);
  if (frame >= i.releaseFrame + settleFrames) return {phase: 'released', pose: destination};
  const t = easeInOut(clamp((frame - i.releaseFrame) / settleFrames, 0, 1));
  return {phase: 'settling', pose: {...releasePose, topLeft: mix(releasePose.topLeft, destination.topLeft, t)}};
}

export interface ContactCheck {ok: boolean; errorPx: number; hand: Point; propAnchor: Point}
/** Detects a would-be object teleport on pickup, before rendering. */
export function checkPickupContact(i: PropInteraction, tolerancePx = 1): ContactCheck {
  validateInteraction(i);
  const restPose = placePropAtBase(i.prop, i.initialBase, i.scale ?? 1, i.angleDegrees ?? 0);
  const propAnchor = worldAnchor(restPose, i.prop.gripAnchor);
  const hand = i.gripAtFrame(i.pickupFrame);
  const errorPx = distance(hand, propAnchor);
  return {ok: errorPx <= tolerancePx, errorPx, hand, propAnchor};
}
