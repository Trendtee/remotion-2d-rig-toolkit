import {add, clamp, distance, isFinitePoint, length, multiply, point, subtract, type Point} from './geometry.js';

export type ElbowSide = 'left' | 'right';
export interface TwoBoneArm {
  shoulder: Point;
  upperArmLength: number;
  forearmLength: number;
  elbowSide: ElbowSide;
}
export interface ArmSolution {
  shoulder: Point;
  elbow: Point;
  wrist: Point;
  requestedWrist: Point;
  /** Distance between the requested wrist point and the solved wrist point. */
  reachError: number;
  targetReachable: boolean;
}

/**
 * Deterministic planar two-segment IK. Does not alter bone lengths.
 * If target is out of reach, clamps the wrist to the nearest reachable point.
 * In screen coordinates, left/right choose the perpendicular elbow side.
 */
export function solveTwoBoneArm(arm: TwoBoneArm, target: Point): ArmSolution {
  const {shoulder, upperArmLength: upper, forearmLength: lower} = arm;
  if (!isFinitePoint(shoulder) || !isFinitePoint(target) ||
      !Number.isFinite(upper) || !Number.isFinite(lower) || upper <= 0 || lower <= 0) {
    throw new RangeError('Expected finite points and positive finite bone lengths');
  }
  const delta = subtract(target, shoulder);
  const requestedDistance = length(delta);
  const direction = requestedDistance > 1e-10 ? multiply(delta, 1 / requestedDistance) : point(1, 0);
  const minReach = Math.abs(upper - lower);
  const maxReach = upper + lower;
  const achievable = clamp(requestedDistance, minReach, maxReach);
  const wrist = add(shoulder, multiply(direction, achievable));
  const along = achievable > 1e-10 ?
    (upper * upper - lower * lower + achievable * achievable) / (2 * achievable) : 0;
  const perpendicularDistance = Math.sqrt(Math.max(0, upper * upper - along * along));
  const sign = arm.elbowSide === 'left' ? 1 : -1;
  const perpendicular = point(-direction.y * sign, direction.x * sign);
  const elbow = add(add(shoulder, multiply(direction, along)), multiply(perpendicular, perpendicularDistance));
  const reachError = distance(wrist, target);
  return {shoulder, elbow, wrist, requestedWrist: target, reachError, targetReachable: reachError < 1e-6};
}
