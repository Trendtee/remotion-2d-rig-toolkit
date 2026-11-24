import {add, angleBetween, clamp, distance, isFinitePoint, length, multiply, point, subtract, type Point} from './geometry.js';

/**
 * @deprecated Use {@link ElbowBend}. Kept for backwards compatibility with v0.1.0.
 * `'left'` produces the same result as `elbowBend: 'clockwise'`, and `'right'` the same as
 * `'counterclockwise'`. The names do NOT match the anatomical or on-screen left/right side.
 */
export type ElbowSide = 'left' | 'right';

/**
 * Which way the elbow bends, seen on screen (positive y down).
 *
 * `'clockwise'` places the elbow on the clockwise side of the shoulder→wrist line. For an arm
 * reaching to the right (+x), that puts the elbow **below** the line. `'counterclockwise'` puts it above.
 */
export type ElbowBend = 'clockwise' | 'counterclockwise';

export interface TwoBoneArm {
  shoulder: Point;
  upperArmLength: number;
  forearmLength: number;
  /** Preferred. Takes precedence over `elbowSide` when both are given. */
  elbowBend?: ElbowBend;
  /** @deprecated Use `elbowBend`. */
  elbowSide?: ElbowSide;
  /**
   * Optional elbow constraint, interior angle in degrees (180 = straight). A target that would need a
   * tighter fold than `minElbowAngle`, or a straighter arm than `maxElbowAngle`, is clamped along the
   * same ray and reported through `targetReachable: false` and `elbowLimited: true`.
   */
  minElbowAngle?: number;
  maxElbowAngle?: number;
}

export interface ArmSolution {
  shoulder: Point;
  elbow: Point;
  wrist: Point;
  requestedWrist: Point;
  /** Distance between the requested wrist point and the solved wrist point. */
  reachError: number;
  targetReachable: boolean;
  /** Direction of the upper arm (shoulder → elbow), in degrees. */
  upperArmAngle: number;
  /** Direction of the forearm (elbow → wrist), in degrees. Use it to orient the hand. */
  forearmAngle: number;
  /** Interior elbow angle in degrees: 180 = straight arm, smaller = more bent. */
  elbowAngle: number;
  /** True when `minElbowAngle` / `maxElbowAngle` changed the result. */
  elbowLimited: boolean;
}

/** Shoulder–wrist distance that produces a given interior elbow angle (law of cosines). */
export function reachForElbowAngle(upperArmLength: number, forearmLength: number, elbowAngleDegrees: number): number {
  const c = Math.cos((clamp(elbowAngleDegrees, 0, 180) * Math.PI) / 180);
  return Math.sqrt(Math.max(0, upperArmLength ** 2 + forearmLength ** 2 - 2 * upperArmLength * forearmLength * c));
}

const resolveBend = (arm: TwoBoneArm): ElbowBend => {
  if (arm.elbowBend) return arm.elbowBend;
  if (arm.elbowSide === 'right') return 'counterclockwise';
  // 'left' and the historical default both resolve to the v0.1.0 behaviour.
  return 'clockwise';
};

/**
 * Deterministic planar two-segment IK. Never changes bone lengths.
 *
 * If the target is out of reach (further than upper + forearm, or closer than |upper − forearm|),
 * the wrist is clamped to the nearest reachable point on the same ray and `targetReachable` is false.
 * When the target coincides with the shoulder, the arm points along +x so the result stays finite.
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
  let minReach = Math.abs(upper - lower);
  let maxReach = upper + lower;
  const {minElbowAngle, maxElbowAngle} = arm;
  if (minElbowAngle !== undefined || maxElbowAngle !== undefined) {
    const lo = minElbowAngle ?? 0;
    const hi = maxElbowAngle ?? 180;
    if (![lo, hi].every(Number.isFinite) || lo < 0 || hi > 180 || lo > hi) {
      throw new RangeError('Elbow limits must satisfy 0 <= minElbowAngle <= maxElbowAngle <= 180');
    }
    minReach = Math.max(minReach, reachForElbowAngle(upper, lower, lo));
    maxReach = Math.min(maxReach, reachForElbowAngle(upper, lower, hi));
  }
  const achievable = clamp(requestedDistance, minReach, maxReach);
  const unconstrained = clamp(requestedDistance, Math.abs(upper - lower), upper + lower);
  const wrist = add(shoulder, multiply(direction, achievable));
  const along = achievable > 1e-10 ?
    (upper * upper - lower * lower + achievable * achievable) / (2 * achievable) : 0;
  const perpendicularDistance = Math.sqrt(Math.max(0, upper * upper - along * along));
  // (-dy, dx) is the direction rotated +90°, which is clockwise on a y-down screen.
  const sign = resolveBend(arm) === 'clockwise' ? 1 : -1;
  const perpendicular = point(-direction.y * sign, direction.x * sign);
  const elbow = add(add(shoulder, multiply(direction, along)), multiply(perpendicular, perpendicularDistance));
  const reachError = distance(wrist, target);
  const cosElbow = clamp((upper * upper + lower * lower - achievable * achievable) / (2 * upper * lower), -1, 1);
  return {
    shoulder, elbow, wrist, requestedWrist: target, reachError,
    targetReachable: reachError < 1e-6,
    upperArmAngle: angleBetween(shoulder, elbow),
    forearmAngle: angleBetween(elbow, wrist),
    elbowAngle: (Math.acos(cosElbow) * 180) / Math.PI,
    elbowLimited: Math.abs(achievable - unconstrained) > 1e-9
  };
}
