import {add, angleBetween, angleDelta, clamp, distance, isFinitePoint, lerp, mix, multiply, point, rotate, subtract, type Point} from './geometry.js';
import type {DigitName, HandSide} from './hands.js';
import type {ArmSolution} from './ik.js';

/**
 * Articulated 2D cartoon hand.
 *
 * Model: a lateral (thumb-side) view of a right hand. In the hand's local frame the wrist pivot is
 * (0,0), +x points from the wrist toward the knuckles, and +y is the palm side. Every digit is a
 * chain of three rigid segments joined by hinge joints (finger: MCP, PIP, DIP; thumb: CMC, MCP, IP).
 * Flexion bends fingers toward the palm (+y) and the thumb toward the fingers (−y).
 * Each joint has a radius, so a digit tapers from base to tip and can be measured against objects.
 *
 * This is a planar forward-kinematics approximation designed for stylised 2D animation. It does not
 * model 3D rotation, finger abduction out of the drawing plane or skin deformation.
 */

export type JointCurl = readonly [number, number, number];
export type JointRadii = readonly [number, number, number, number];
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
  | 'mugHandle' | 'controller' | 'batteryPinch' | 'paperPinch' | 'cableWrap'
  | 'pinchWide' | 'pinchTight';

/** How the grip point is derived from the posed digits. */
export type GripContact = 'palm' | 'wrap' | 'pinch';

export const DIGITS: readonly DigitName[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];

interface DigitSpec {
  base: Point;
  restAngle: number;
  /** +1: flexion rotates clockwise (toward +y). −1: counterclockwise (thumb opposition). */
  flexSign: 1 | -1;
  segments: JointCurl;
  /** Radius at base, first joint, second joint and tip. */
  radii: JointRadii;
  limits: readonly [readonly [number, number], readonly [number, number], readonly [number, number]];
}

const FINGER_LIMITS = [[-20, 90], [0, 110], [0, 80]] as const;
const THUMB_LIMITS = [[-20, 70], [-10, 70], [-15, 85]] as const;

/**
 * Cartoon proportions in local units: about 37 units from wrist to knuckles, a middle finger of
 * 29 units (≈ 0.8 × palm), fingers about 9 units thick, and a thicker, shorter thumb that starts at the
 * thenar mound near the wrist. Knuckles are staggered so the four fingers stay readable when they overlap.
 */
const SPEC: Readonly<Record<DigitName, DigitSpec>> = {
  thumb:  {base: point(14, 9.5),  restAngle: 26, flexSign: -1, segments: [14.5, 12, 10],      radii: [6.2, 5.6, 5.0, 4.4], limits: THUMB_LIMITS},
  index:  {base: point(35, -6),   restAngle: -4, flexSign: 1,  segments: [12.5, 8, 6.5],   radii: [4.8, 4.4, 4.0, 3.6], limits: FINGER_LIMITS},
  middle: {base: point(36.5, -2.5), restAngle: 0, flexSign: 1, segments: [13.5, 8.5, 7],   radii: [4.8, 4.4, 4.0, 3.6], limits: FINGER_LIMITS},
  ring:   {base: point(35, 1),    restAngle: 4,  flexSign: 1,  segments: [12.5, 8, 6.5],   radii: [4.6, 4.2, 3.8, 3.4], limits: FINGER_LIMITS},
  pinky:  {base: point(32, 4.5),  restAngle: 9,  flexSign: 1,  segments: [10, 6.5, 5.5],   radii: [4.0, 3.7, 3.4, 3.1], limits: FINGER_LIMITS}
};

/** Palm outline in local units, clockwise, with the thenar mound (thumb base) on the palm side. */
const PALM_OUTLINE: readonly Point[] = [
  point(0, -9), point(14, -11), point(29, -11), point(36, -8.5), point(39, -2),
  point(37.5, 5), point(32, 9.5), point(22, 11.5), point(17, 15.5), point(9, 16),
  point(2.5, 12), point(0, 6)
];

const pose = (
  thumb: JointCurl, index: JointCurl, middle: JointCurl, ring: JointCurl, pinky: JointCurl,
  fingerLayer: 'front' | 'back' = 'front', spread = 0, thumbSpread = 0,
  layers: Partial<Record<DigitName, 'front' | 'back'>> = {}
): HandPose => ({
  thumb: {curl: thumb, spread: thumbSpread, layer: layers.thumb ?? 'front'},
  index: {curl: index, spread: -spread, layer: layers.index ?? fingerLayer},
  middle: {curl: middle, spread: 0, layer: layers.middle ?? fingerLayer},
  ring: {curl: ring, spread: spread * 0.8, layer: layers.ring ?? fingerLayer},
  pinky: {curl: pinky, spread: spread * 1.6, layer: layers.pinky ?? fingerLayer}
});

/**
 * Starter poses (degrees of flexion per joint).
 *
 * `pinchWide` → `batteryPinch` → `pinchTight` form a precision-pinch family: thumb and index tips face
 * each other across the hand's forward axis, ahead of the knuckles. `pinchPoseForGap()` interpolates
 * along it to hit an exact tip gap. `paperPinch` equals `pinchTight`.
 */
export const HAND_POSES: Readonly<Record<HandPresetName, HandPose>> = {
  open:         pose([4, 0, 0], [0, 4, 2], [0, 4, 2], [0, 5, 3], [0, 6, 3], 'front', 8, -6),
  relaxed:      pose([10, 14, 16], [22, 36, 22], [26, 42, 24], [30, 46, 26], [34, 50, 28], 'front', 4),
  fist:         pose([48, 40, 40], [88, 105, 60], [88, 105, 60], [88, 105, 60], [88, 105, 60]),
  point:        pose([44, 36, 30], [2, 4, 2], [88, 105, 60], [88, 105, 60], [88, 105, 60]),
  mugHandle:    pose([26, 16, 14], [62, 85, 45], [66, 88, 48], [70, 90, 50], [74, 92, 50], 'back'),
  controller:   pose([-5, 10, 15], [30, 40, 25], [52, 70, 40], [60, 78, 45], [66, 82, 48], 'back'),
  cableWrap:    pose([45, 35, 25], [78, 100, 70], [80, 102, 72], [82, 104, 72], [84, 104, 72], 'back'),
  // Pinch family. batteryPinch and pinchTight come from tools/tune-pinch.mjs (tips ahead of the knuckles,
  // pinch axis perpendicular to the hand's forward axis); pinchWide is the opened pre-shape.
  pinchWide:    pose([-20, 0, 8], [-15, 35, 15], [-5, 45, 20], [70, 95, 55], [76, 98, 55], 'front', 0, 0, {middle: 'back', ring: 'back', pinky: 'back'}),
  batteryPinch: pose([-12, 0.5, 40.5], [-4.5, 86.5, 51], [3.5, 95.5, 56], [75, 98, 58], [80, 100, 58], 'front', 0, 0, {middle: 'back', ring: 'back', pinky: 'back'}),
  pinchTight:   pose([2, 20, 10.5], [0, 60, 59.5], [8, 69, 64.5], [80, 100, 60], [84, 102, 60], 'front', 0, 0, {middle: 'back', ring: 'back', pinky: 'back'}),
  paperPinch:   pose([2, 20, 10.5], [0, 60, 59.5], [8, 69, 64.5], [80, 100, 60], [84, 102, 60], 'front', 0, 0, {middle: 'back', ring: 'back', pinky: 'back'})
};

/** How each preset reports its grip point. Custom poses default to `'wrap'`. */
export const HAND_POSE_CONTACT: Readonly<Record<HandPresetName, GripContact>> = {
  open: 'palm', relaxed: 'palm', fist: 'wrap', point: 'wrap',
  mugHandle: 'wrap', controller: 'wrap', cableWrap: 'wrap',
  batteryPinch: 'pinch', paperPinch: 'pinch', pinchWide: 'pinch', pinchTight: 'pinch'
};

export interface ArticulatedDigit {
  digit: DigitName;
  /** Four world-space points: base, first joint, second joint, tip. */
  joints: readonly [Point, Point, Point, Point];
  /** Radius at each joint (already scaled). A segment tapers from one radius to the next. */
  radii: JointRadii;
  /** Suggested stroke width for each of the three segments (already scaled): the mean diameter. */
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

/** Unscaled joint radii of a digit (base, joint 1, joint 2, tip). */
export const digitRadii = (digit: DigitName): JointRadii => SPEC[digit].radii;

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
  if (contact === 'pinch') {
    // Midpoint between the SURFACES of the thumb and index tips, i.e. the centre of a pinched object.
    const t = digits.thumb[3]!;
    const i = digits.index[3]!;
    const d = distance(t, i);
    if (d < 1e-9) return t;
    const rT = SPEC.thumb.radii[3];
    const rI = SPEC.index.radii[3];
    return mix(t, i, (rT + (d - rT - rI) / 2) / d);
  }
  if (contact === 'palm') return point(44, 14);
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
    const r = SPEC[digit].radii;
    return {
      digit,
      joints: fk.joints.map(toWorld) as unknown as [Point, Point, Point, Point],
      radii: [r[0] * scale, r[1] * scale, r[2] * scale, r[3] * scale],
      widths: [(r[0] + r[1]) * scale, (r[1] + r[2]) * scale, (r[2] + r[3]) * scale],
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

/** Local grip offset (wrist → grip point) for a pose and orientation. */
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

// ---------------------------------------------------------------------------------------------
// Precision pinch (thumb–index opposition)
// ---------------------------------------------------------------------------------------------

export interface PinchTips {
  thumb: Point;
  index: Point;
  /** Distance between the tip centres. */
  gap: number;
  /** Distance between the tip surfaces (gap minus both tip radii): the thickness the pinch can hold. */
  surfaceGap: number;
  /** Direction from the thumb tip to the index tip, degrees. */
  axisDegrees: number;
}

/** Measures the thumb–index opening of a posed hand. */
export function pinchTips(hand: ArticulatedHand): PinchTips {
  const t = hand.digits[0]!;
  const i = hand.digits[1]!;
  const gap = distance(t.joints[3], i.joints[3]);
  return {thumb: t.joints[3], index: i.joints[3], gap, surfaceGap: gap - t.radii[3] - i.radii[3], axisDegrees: angleBetween(t.joints[3], i.joints[3])};
}

/**
 * A pinch pose whose thumb and index tip surfaces are exactly `surfaceGap` local units apart.
 * Interpolates along `pinchWide` → `batteryPinch` → `pinchTight` (bisection, deterministic). Gaps outside the
 * family's range are clamped; `achieved` reports the gap actually produced.
 */
export function pinchPoseForGap(surfaceGap: number): {pose: HandPose; t: number; achieved: number} {
  if (!Number.isFinite(surfaceGap)) throw new RangeError('surfaceGap must be finite');
  // Family keys from widest to tightest; t runs 0 → 1 across them.
  const keys: HandPresetName[] = ['pinchWide', 'batteryPinch', 'pinchTight'];
  const segments = keys.length - 1;
  const poseAt = (t: number): HandPose => {
    const u = clamp(t, 0, 1) * segments;
    const k = Math.min(segments - 1, Math.floor(u));
    return blendHandPoses(keys[k]!, keys[k + 1]!, u - k);
  };
  const gapAt = (t: number) => pinchTips(createArticulatedHand({pose: poseAt(t)})).surfaceGap;
  const wide = gapAt(0);
  const tight = gapAt(1);
  if (surfaceGap >= wide) return {pose: poseAt(0), t: 0, achieved: wide};
  if (surfaceGap <= tight) return {pose: poseAt(1), t: 1, achieved: tight};
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 48; k++) {
    const mid = (lo + hi) / 2;
    if (gapAt(mid) > surfaceGap) lo = mid; else hi = mid;
  }
  const t = (lo + hi) / 2;
  return {pose: poseAt(t), t, achieved: gapAt(t)};
}

export interface PinchPlacement {
  wrist: Point;
  forwardDegrees: number;
  /** Where the thumb and index tip centres end up. */
  thumbTip: Point;
  indexTip: Point;
  /** Surface clearance on each side: 0 = touching, > 0 = open, < 0 = squeezing into the object. */
  thumbClearance: number;
  indexClearance: number;
}

export interface PinchContactOptions {
  /**
   * Outward surface normal of the object at each contact. A fingertip touches a surface when its
   * centre sits one tip radius away ALONG THE NORMAL, which matters when the pinch axis is oblique
   * (e.g. a hand coming from the upper left onto the vertical sides of a battery).
   * Defaults: along the pinch axis, pointing away from the object.
   */
  thumbNormal?: Point;
  indexNormal?: Point;
}

const unit = (p: Point): Point => {
  const l = Math.hypot(p.x, p.y);
  if (!(l > 1e-12)) throw new RangeError('Normals must be non-zero');
  return multiply(p, 1 / l);
};

function tipTargets(thumbContact: Point, indexContact: Point, rT: number, rI: number, o: PinchContactOptions): [Point, Point] {
  const u = unit(subtract(indexContact, thumbContact));
  const nT = o.thumbNormal ? unit(o.thumbNormal) : multiply(u, -1);
  const nI = o.indexNormal ? unit(o.indexNormal) : u;
  return [add(thumbContact, multiply(nT, rT)), add(indexContact, multiply(nI, rI))];
}

/**
 * Places a hand so that its thumb and index tips face two contact points on an object, e.g. the left
 * and right sides of a battery. The hand is rotated so the thumb→index tip line runs through both tip
 * targets and is centred between them: an open hand straddles the object evenly, and a pose whose
 * opening equals the target distance touches both sides at once (see `solvePinchGrip`).
 */
export function placeHandForPinch(
  thumbContact: Point, indexContact: Point,
  options: Omit<ArticulatedHandOptions, 'wrist' | 'forwardDegrees'> & PinchContactOptions
): PinchPlacement {
  if (!isFinitePoint(thumbContact) || !isFinitePoint(indexContact) || distance(thumbContact, indexContact) < 1e-9) {
    throw new RangeError('Expected two distinct, finite contact points');
  }
  const probe = createArticulatedHand({...options, wrist: point(0, 0), forwardDegrees: 0});
  const tips = pinchTips(probe);
  if (tips.gap < 1e-9) throw new RangeError('The pose has no thumb–index opening');
  const [tT, tI] = tipTargets(thumbContact, indexContact, probe.digits[0]!.radii[3], probe.digits[1]!.radii[3], options);
  const forwardDegrees = angleBetween(tT, tI) - tips.axisDegrees;
  const wrist = subtract(mix(tT, tI, 0.5), rotate(mix(tips.thumb, tips.index, 0.5), forwardDegrees));
  const thumbTip = add(wrist, rotate(tips.thumb, forwardDegrees));
  const indexTip = add(wrist, rotate(tips.index, forwardDegrees));
  const clearance = (tips.gap - distance(tT, tI)) / 2;
  return {wrist, forwardDegrees, thumbTip, indexTip, thumbClearance: clearance, indexClearance: clearance};
}

/**
 * Solves a precision pinch on two contact points: picks the member of the pinch family whose opening
 * exactly matches the object (`pinchPoseForGap`) and places the hand so both tips touch.
 * Returns the pose too, so the same hand can be opened (`pinchWide`) at the same wrist for approach
 * and release without moving the palm.
 */
export function solvePinchGrip(
  thumbContact: Point, indexContact: Point,
  options: {scale?: number; side?: HandSide} & PinchContactOptions = {}
): PinchPlacement & {pose: HandPose; fitted: boolean} {
  const scale = options.scale ?? 1;
  const rT = SPEC.thumb.radii[3] * scale;
  const rI = SPEC.index.radii[3] * scale;
  const [tT, tI] = tipTargets(thumbContact, indexContact, rT, rI, options);
  const wanted = distance(tT, tI) / scale - SPEC.thumb.radii[3] - SPEC.index.radii[3];
  const fit = pinchPoseForGap(wanted);
  const placement = placeHandForPinch(thumbContact, indexContact, {...options, pose: fit.pose, scale, contact: 'pinch'});
  return {...placement, pose: fit.pose, fitted: Math.abs(fit.achieved - wanted) < 1e-6};
}

// ---------------------------------------------------------------------------------------------
// Contact measurement
// ---------------------------------------------------------------------------------------------

/** Signed distance from a point to a convex polygon: negative inside, positive outside. */
export function signedDistanceToConvexPolygon(p: Point, polygon: readonly Point[]): number {
  if (polygon.length < 3) throw new RangeError('A polygon needs at least 3 points');
  let inside = true;
  let sign = 0;
  let best = Infinity;
  for (let k = 0; k < polygon.length; k++) {
    const a = polygon[k]!;
    const b = polygon[(k + 1) % polygon.length]!;
    const ab = subtract(b, a);
    const ap = subtract(p, a);
    const cross = ab.x * ap.y - ab.y * ap.x;
    if (cross !== 0) {
      const s = Math.sign(cross);
      if (sign === 0) sign = s; else if (s !== sign) inside = false;
    }
    const t = clamp((ap.x * ab.x + ap.y * ab.y) / (ab.x * ab.x + ab.y * ab.y), 0, 1);
    best = Math.min(best, distance(p, add(a, multiply(ab, t))));
  }
  return inside ? -best : best;
}

export interface DigitContact {
  digit: DigitName | 'palm';
  /** Smallest surface clearance in world units: 0 = touching, negative = penetrating the object. */
  clearance: number;
  /** Segment index (0–2) of the closest point, or −1 for the palm. */
  segment: number;
}

/**
 * Measures how close each digit (as tapered capsules) and the palm outline come to a convex object
 * outline in world space. Use it in tests to prove contact (≈ 0) and to catch penetration (< 0).
 */
export function measureDigitContacts(hand: ArticulatedHand, objectOutline: readonly Point[], samplesPerSegment = 12): DigitContact[] {
  const out: DigitContact[] = hand.digits.map(d => {
    let clearance = Infinity;
    let segment = 0;
    for (let k = 0; k < 3; k++) {
      for (let s = 0; s <= samplesPerSegment; s++) {
        const t = s / samplesPerSegment;
        const p = mix(d.joints[k]!, d.joints[k + 1]!, t);
        const r = lerp(d.radii[k]!, d.radii[k + 1]!, t);
        const c = signedDistanceToConvexPolygon(p, objectOutline) - r;
        if (c < clearance) { clearance = c; segment = k; }
      }
    }
    return {digit: d.digit, clearance, segment};
  });
  let palm = Infinity;
  for (let k = 0; k < hand.palm.length; k++) {
    const a = hand.palm[k]!;
    const b = hand.palm[(k + 1) % hand.palm.length]!;
    for (let s = 0; s < samplesPerSegment; s++) {
      palm = Math.min(palm, signedDistanceToConvexPolygon(mix(a, b, s / samplesPerSegment), objectOutline));
    }
  }
  out.push({digit: 'palm', clearance: palm, segment: -1});
  return out;
}

// ---------------------------------------------------------------------------------------------
// Drawing helpers (renderer-agnostic path data)
// ---------------------------------------------------------------------------------------------

/** SVG path data for a polyline through a digit's joints (stroke it with round caps/joins). */
export function digitPath(d: ArticulatedDigit): string {
  return d.joints.map((j, k) => `${k === 0 ? 'M' : 'L'}${j.x.toFixed(2)} ${j.y.toFixed(2)}`).join(' ');
}

export interface DigitSegment {
  from: Point;
  to: Point;
  /** Stroke width that matches the segment's mean diameter (plus `extra`). */
  width: number;
}

/**
 * The three segments of a digit with tapering widths. Draw them in two passes, all outlines first and
 * then all fills (outline width = fill width + 2 × line weight), so a digit reads as one tapered shape
 * with a single continuous outline and visible joints.
 */
export function digitSegments(d: ArticulatedDigit, extra = 0): DigitSegment[] {
  return [0, 1, 2].map(k => ({from: d.joints[k]!, to: d.joints[k + 1]!, width: d.widths[k]! + extra}));
}

/** SVG path data for the palm outline, with smoothly rounded corners. */
export function palmPath(hand: ArticulatedHand): string {
  const pts = hand.palm;
  const n = pts.length;
  const mid = (k: number) => mix(pts[k % n]!, pts[(k + 1) % n]!, 0.5);
  const f = (p: Point) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  let d = `M${f(mid(0))}`;
  for (let k = 1; k <= n; k++) d += ` Q${f(pts[k % n]!)} ${f(mid(k))}`;
  return d + ' Z';
}

// ---------------------------------------------------------------------------------------------
// Hand-local coordinates (rigid attachment)
// ---------------------------------------------------------------------------------------------

/** Converts a world point into the hand's local frame (unscaled, unmirrored, wrist at the origin). */
export function toHandLocal(hand: Pick<ArticulatedHand, 'wrist' | 'forwardDegrees' | 'scale' | 'side'>, world: Point): Point {
  const r = rotate(subtract(world, hand.wrist), -hand.forwardDegrees);
  return point(r.x / hand.scale, (r.y / hand.scale) * (hand.side === 'left' ? -1 : 1));
}

/** Converts a hand-local point back into world space. Inverse of `toHandLocal`. */
export function fromHandLocal(hand: Pick<ArticulatedHand, 'wrist' | 'forwardDegrees' | 'scale' | 'side'>, local: Point): Point {
  return add(hand.wrist, rotate(point(local.x * hand.scale, local.y * hand.scale * (hand.side === 'left' ? -1 : 1)), hand.forwardDegrees));
}
