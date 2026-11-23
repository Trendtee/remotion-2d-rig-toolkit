import {add, angleDelta, clamp, isFinitePoint, lerp, mix, multiply, point, rotate, subtract, type Point} from './geometry.js';
import type {DigitName, HandSide} from './hands.js';
import type {ArmSolution} from './ik.js';

/**
 * Articulated 2D cartoon hand.
 *
 * Model: a lateral (thumb-side) view of a right hand. In the hand's local frame the wrist pivot is
 * (0,0), +x points from the wrist toward the knuckles, and +y is the palm side. Every digit is a
 * chain of three rigid segments joined by hinge joints (finger: MCP, PIP, DIP; thumb: CMC, MCP, IP).
 * Flexion bends fingers toward the palm (+y) and the thumb toward the fingers (−y).
 *
 * This is a planar forward-kinematics approximation designed for stylised 2D animation. It does not
 * model 3D rotation, finger abduction out of the drawing plane, skin deformation or collisions.
 */

export type JointCurl = readonly [number, number, number];
export interface DigitPose {
  /** Flexion of the three joints in degrees, from the hand toward the tip. Clamped to joint limits. */
  curl: JointCurl;
  /** Extra fan-out angle in degrees added to the digit's rest direction. Default 0. */
  spread?: number;
  /** Whether the digit is drawn in front of or behind a held object. Default `'front'`. */
  layer?: 'front' | 'back';
}
export type HandPose = Readonly<Record<DigitName, DigitPose>>;

export type HandPresetName =
  | 'open' | 'relaxed' | 'fist' | 'point'
  | 'mugHandle' | 'controller' | 'batteryPinch' | 'paperPinch' | 'cableWrap';

/** How the grip point is derived from the posed digits. */
export type GripContact = 'palm' | 'wrap' | 'pinch';

export const DIGITS: readonly DigitName[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];

interface DigitSpec {
  base: Point;
  restAngle: number;
  /** +1: flexion rotates clockwise (toward +y). −1: counterclockwise (thumb opposition). */
  flexSign: 1 | -1;
  segments: JointCurl;
  widths: JointCurl;
  limits: readonly [readonly [number, number], readonly [number, number], readonly [number, number]];
}

const FINGER_LIMITS = [[-20, 90], [0, 110], [0, 80]] as const;
const THUMB_LIMITS = [[-20, 60], [-10, 70], [-15, 80]] as const;

/** Neutral proportions in local units (≈ 40 units from wrist to knuckles at scale 1). */
const SPEC: Readonly<Record<DigitName, DigitSpec>> = {
  thumb:  {base: point(10, 7),  restAngle: 38, flexSign: -1, segments: [15, 12, 10], widths: [11, 10, 9], limits: THUMB_LIMITS},
  index:  {base: point(38, -6), restAngle: -5, flexSign: 1,  segments: [16, 11, 9],  widths: [9, 8.5, 8], limits: FINGER_LIMITS},
  middle: {base: point(40, -2), restAngle: 0,  flexSign: 1,  segments: [18, 12, 9],  widths: [9, 8.5, 8], limits: FINGER_LIMITS},
  ring:   {base: point(38, 2),  restAngle: 5,  flexSign: 1,  segments: [16, 11, 9],  widths: [8.5, 8, 7.5], limits: FINGER_LIMITS},
  pinky:  {base: point(35, 6),  restAngle: 10, flexSign: 1,  segments: [12, 9, 8],   widths: [7.5, 7, 6.5], limits: FINGER_LIMITS}
};

/** Outline of the palm in local units (clockwise). Not including the digits. */
const PALM_OUTLINE: readonly Point[] = [
  point(0, -9), point(20, -11), point(38, -10), point(42, -3), point(40, 4),
  point(36, 10), point(22, 13), point(8, 12), point(0, 9)
];

const pose = (
  thumb: JointCurl, index: JointCurl, middle: JointCurl, ring: JointCurl, pinky: JointCurl,
  fingerLayer: 'front' | 'back' = 'front', spread = 0, thumbSpread = 0
): HandPose => ({
  thumb: {curl: thumb, spread: thumbSpread, layer: 'front'},
  index: {curl: index, spread: -spread, layer: fingerLayer},
  middle: {curl: middle, spread: 0, layer: fingerLayer},
  ring: {curl: ring, spread: spread * 0.8, layer: fingerLayer},
  pinky: {curl: pinky, spread: spread * 1.6, layer: fingerLayer}
});

/**
 * Starter poses. Values are degrees of flexion per joint. The pinch poses were tuned numerically:
 * `batteryPinch` leaves ≈12.5 units between thumb and index tips (a small cylinder), `paperPinch`
 * ≈3 units (a sheet). Wrap poses place `gripPoint` inside the loop of the curled middle finger.
 */
export const HAND_POSES: Readonly<Record<HandPresetName, HandPose>> = {
  open:         pose([10, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], 'front', 7, -5),
  relaxed:      pose([10, 10, 10], [18, 22, 12], [22, 26, 14], [26, 30, 16], [30, 32, 18]),
  fist:         pose([40, 45, 40], [88, 105, 60], [88, 105, 60], [88, 105, 60], [88, 105, 60]),
  point:        pose([35, 40, 30], [0, 0, 0], [88, 105, 60], [88, 105, 60], [88, 105, 60]),
  mugHandle:    pose([22, 18, 12], [62, 85, 45], [66, 88, 48], [70, 90, 50], [74, 92, 50], 'back'),
  controller:   pose([-5, 10, 15], [30, 40, 25], [52, 70, 40], [60, 78, 45], [66, 82, 48], 'back'),
  batteryPinch: pose([4, 0, 0], [30, 80, 50], [55, 85, 50], [65, 90, 55], [72, 95, 55], 'back'),
  paperPinch:   pose([16, 10, 0], [20, 80, 50], [30, 70, 40], [38, 72, 42], [45, 75, 45], 'back'),
  cableWrap:    pose([45, 35, 25], [78, 100, 70], [80, 102, 72], [82, 104, 72], [84, 104, 72], 'back')
};

/** How each preset reports its grip point. Custom poses default to `'wrap'`. */
export const HAND_POSE_CONTACT: Readonly<Record<HandPresetName, GripContact>> = {
  open: 'palm', relaxed: 'palm', fist: 'wrap', point: 'wrap',
  mugHandle: 'wrap', controller: 'wrap', batteryPinch: 'pinch', paperPinch: 'pinch', cableWrap: 'wrap'
};

export interface ArticulatedDigit {
  digit: DigitName;
  /** Four world-space points: base, first joint, second joint, tip. */
  joints: readonly [Point, Point, Point, Point];
  /** Suggested stroke width for each of the three segments (already scaled). */
  widths: JointCurl;
  /** Joint flexion actually applied after clamping to limits. */
  curl: JointCurl;
  layer: 'front' | 'back';
  /** True when the requested curl exceeded a joint limit and was clamped. */
  clamped: boolean;
}

export interface ArticulatedHand {
  side: HandSide;
  wrist: Point;
  /** World direction from the wrist toward the knuckles, in degrees. */
  forwardDegrees: number;
  scale: number;
  palm: readonly Point[];
  digits: readonly ArticulatedDigit[];
  /** World-space point where an object's grip anchor should sit. */
  gripPoint: Point;
  contact: GripContact;
}

export interface ArticulatedHandOptions {
  /** Preset name or a custom pose. */
  pose: HandPresetName | HandPose;
  side?: HandSide;
  wrist?: Point;
  /** Direction from wrist toward knuckles, degrees. For a right hand 0° points to +x. */
  forwardDegrees?: number;
  scale?: number;
  /** Overrides the grip point rule; defaults to the preset's rule or `'wrap'`. */
  contact?: GripContact;
}

const resolvePose = (p: HandPresetName | HandPose): HandPose => typeof p === 'string' ? HAND_POSES[p] : p;

/** Clamps a curl triple to the anatomical-ish limits of the given digit. */
export function clampDigitCurl(digit: DigitName, curl: JointCurl): JointCurl {
  const lim = SPEC[digit].limits;
  return [clamp(curl[0], lim[0][0], lim[0][1]), clamp(curl[1], lim[1][0], lim[1][1]), clamp(curl[2], lim[2][0], lim[2][1])];
}

/** Local (unscaled, unmirrored, unrotated) forward kinematics for one digit. */
function digitLocal(digit: DigitName, dp: DigitPose): {joints: [Point, Point, Point, Point]; curl: JointCurl; clamped: boolean} {
  const spec = SPEC[digit];
  if (!dp.curl.every(Number.isFinite) || (dp.spread !== undefined && !Number.isFinite(dp.spread))) {
    throw new RangeError(`Non-finite curl or spread for ${digit}`);
  }
  const curl = clampDigitCurl(digit, dp.curl);
  const clamped = curl.some((c, k) => Math.abs(c - dp.curl[k]!) > 1e-9);
  const joints: Point[] = [spec.base];
  let angle = spec.restAngle + (dp.spread ?? 0);
  let p = spec.base;
  for (let k = 0; k < 3; k++) {
    angle += spec.flexSign * curl[k]!;
    p = add(p, rotate(point(spec.segments[k]!, 0), angle));
    joints.push(p);
  }
  return {joints: joints as [Point, Point, Point, Point], curl, clamped};
}

function localGripPoint(digits: Record<DigitName, readonly Point[]>, contact: GripContact): Point {
  if (contact === 'pinch') return mix(digits.thumb[3]!, digits.index[3]!, 0.5);
  if (contact === 'palm') return point(46, 14);
  // Wrap: centre of the loop formed by the middle finger's knuckle, joints and tip, pulled slightly
  // toward the palm, approximating the centre of the enclosed handle/cable cross-section.
  const m = digits.middle;
  const centroid = multiply(add(add(m[0]!, m[1]!), add(m[2]!, m[3]!)), 0.25);
  return mix(centroid, point(m[0]!.x, m[0]!.y + 6), 0.25);
}

/**
 * Builds a posed, jointed hand in world space.
 *
 * Left hands are exact mirror images: `side: 'left'` flips the local y axis (palm side) before the
 * hand is rotated, so a left hand at `forwardDegrees = 180 − θ` mirrors a right hand at `θ`
 * across a vertical line.
 */
export function createArticulatedHand(options: ArticulatedHandOptions): ArticulatedHand {
  const side = options.side ?? 'right';
  const wrist = options.wrist ?? point(0, 0);
  const forwardDegrees = options.forwardDegrees ?? (side === 'right' ? 0 : 180);
  const scale = options.scale ?? 1;
  if (!isFinitePoint(wrist) || !Number.isFinite(forwardDegrees) || !Number.isFinite(scale) || scale <= 0) {
    throw new RangeError('Expected a finite wrist, finite forwardDegrees and a positive scale');
  }
  const p = resolvePose(options.pose);
  const contact = options.contact ?? (typeof options.pose === 'string' ? HAND_POSE_CONTACT[options.pose] : 'wrap');
  const flip = side === 'left' ? -1 : 1;
  const toWorld = (q: Point): Point => add(wrist, rotate(point(q.x * scale, q.y * scale * flip), forwardDegrees));

  const local = {} as Record<DigitName, readonly Point[]>;
  const digits: ArticulatedDigit[] = DIGITS.map(digit => {
    const dp = p[digit];
    const fk = digitLocal(digit, dp);
    local[digit] = fk.joints;
    const w = SPEC[digit].widths;
    return {
      digit,
      joints: fk.joints.map(toWorld) as unknown as [Point, Point, Point, Point],
      widths: [w[0] * scale, w[1] * scale, w[2] * scale],
      curl: fk.curl,
      layer: dp.layer ?? 'front',
      clamped: fk.clamped
    };
  });
  return {
    side, wrist, forwardDegrees, scale,
    palm: PALM_OUTLINE.map(toWorld),
    digits,
    gripPoint: toWorld(localGripPoint(local, contact)),
    contact
  };
}

/** Interpolates every joint of two poses (use for opening/closing over frames). `t` is clamped to [0, 1]. */
export function blendHandPoses(a: HandPresetName | HandPose, b: HandPresetName | HandPose, t: number): HandPose {
  const pa = resolvePose(a);
  const pb = resolvePose(b);
  const u = clamp(t, 0, 1);
  const out = {} as Record<DigitName, DigitPose>;
  for (const d of DIGITS) {
    const x = pa[d];
    const y = pb[d];
    out[d] = {
      curl: [lerp(x.curl[0], y.curl[0], u), lerp(x.curl[1], y.curl[1], u), lerp(x.curl[2], y.curl[2], u)],
      spread: lerp(x.spread ?? 0, y.spread ?? 0, u),
      // Switch depth at the midpoint so a closing finger moves behind the object only once it wraps.
      layer: (u < 0.5 ? x.layer : y.layer) ?? 'front'
    };
  }
  return out;
}

/** Local grip offset (wrist → grip point) for a pose, before rotation/mirroring. */
export function gripOffset(options: Omit<ArticulatedHandOptions, 'wrist'>): Point {
  const h = createArticulatedHand({...options, wrist: point(0, 0)});
  return h.gripPoint;
}

/**
 * Returns the wrist position that puts the hand's grip point exactly on `gripWorld`.
 * Feed the result to `solveTwoBoneArm()` as the IK target.
 */
export function wristForGrip(gripWorld: Point, options: Omit<ArticulatedHandOptions, 'wrist'>): Point {
  return subtract(gripWorld, gripOffset(options));
}

/**
 * Keeps the hand within a plausible wrist bend relative to the forearm.
 * Returns the hand direction to use and how far (in degrees) it had to be corrected.
 */
export function limitWristBend(forearmAngle: number, desiredHandAngle: number, maxBendDegrees = 70):
  {handAngle: number; bend: number; correction: number} {
  const bend = angleDelta(forearmAngle, desiredHandAngle);
  const limited = clamp(bend, -maxBendDegrees, maxBendDegrees);
  return {handAngle: forearmAngle + limited, bend: limited, correction: Math.abs(bend - limited)};
}

/** Convenience: attach a hand to an IK solution, keeping the wrist bend within limits. */
export function attachHandToArm(
  arm: ArmSolution,
  options: Omit<ArticulatedHandOptions, 'wrist' | 'forwardDegrees'> & {handAngle?: number; maxWristBend?: number}
): ArticulatedHand & {wristCorrection: number} {
  const desired = options.handAngle ?? arm.forearmAngle;
  const lim = limitWristBend(arm.forearmAngle, desired, options.maxWristBend ?? 70);
  const hand = createArticulatedHand({...options, wrist: arm.wrist, forwardDegrees: lim.handAngle});
  return {...hand, wristCorrection: lim.correction};
}

/** SVG path data for a smooth polyline through a digit's joints (stroke it with round caps/joins). */
export function digitPath(d: ArticulatedDigit): string {
  return d.joints.map((j, k) => `${k === 0 ? 'M' : 'L'}${j.x.toFixed(2)} ${j.y.toFixed(2)}`).join(' ');
}

/** SVG path data for the palm outline. */
export function palmPath(hand: ArticulatedHand): string {
  return hand.palm.map((j, k) => `${k === 0 ? 'M' : 'L'}${j.x.toFixed(2)} ${j.y.toFixed(2)}`).join(' ') + ' Z';
}
