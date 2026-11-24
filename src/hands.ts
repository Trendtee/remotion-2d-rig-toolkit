import {add, multiply, point, rotate, type Point} from './geometry.js';

export type HandSide = 'left' | 'right';
export type HandGrip = 'open' | 'handle' | 'pinch' | 'support';
export type DigitName = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';
export interface Finger {
  digit: DigitName;
  /** Base and tip are local to the wrist origin; rendered fingers remain five distinct shapes. */
  base: Point;
  tip: Point;
  thickness: number;
  /** Fingers painted in front of the object; other fingers may appear behind it. */
  layer: 'front' | 'back';
}
export interface HandGeometry {
  wrist: Point;
  palmCenter: Point;
  palmRadius: Point;
  /** Rotation of the palm ellipse in degrees (apply as an SVG `rotate()` around `palmCenter`). */
  palmAngle: number;
  fingers: Finger[];
}

/**
 * Simple v0.1 hand: each digit is ONE straight segment (base → tip) with no joints.
 * Useful for quick sketches; for jointed fingers and grip presets use `createArticulatedHand()`.
 *
 * Local +x points toward the fingertips; wrist pivot is (0,0). `side: 'left'` mirrors the result
 * horizontally (x → −x) after applying `wristAngle`.
 */
export function createHandGeometry(grip: HandGrip, side: HandSide = 'right', wristAngle = 0): HandGeometry {
  const profiles: Record<HandGrip, Array<[DigitName, number, number, number, number, 'front' | 'back']>> = {
    open: [
      ['thumb', 8, -6, 27, -23, 'front'], ['index', 25, -13, 49, -16, 'front'],
      ['middle', 26, -5, 55, -5, 'front'], ['ring', 25, 5, 52, 8, 'front'],
      ['pinky', 21, 13, 44, 20, 'front']
    ],
    handle: [
      ['thumb', 9, -8, 37, -17, 'front'], ['index', 23, -12, 40, -1, 'back'],
      ['middle', 24, -4, 40, 10, 'back'], ['ring', 21, 5, 36, 18, 'back'],
      ['pinky', 19, 12, 31, 23, 'back']
    ],
    pinch: [
      ['thumb', 11, -7, 37, -9, 'front'], ['index', 24, -13, 39, -11, 'back'],
      ['middle', 24, -4, 34, 0, 'back'], ['ring', 21, 5, 29, 10, 'back'],
      ['pinky', 18, 12, 25, 18, 'back']
    ],
    support: [
      ['thumb', 9, -7, 26, -23, 'front'], ['index', 23, -11, 42, -6, 'front'],
      ['middle', 23, -3, 44, 4, 'front'], ['ring', 22, 5, 42, 12, 'front'],
      ['pinky', 19, 12, 35, 18, 'front']
    ]
  };
  const mirror = side === 'right' ? 1 : -1;
  // Rotate first, then mirror, so a left hand is the exact mirror image of a right hand
  // at the same wristAngle. (v0.1.0 mirrored first, which broke symmetry for non-zero angles.)
  const local = (p: Point) => {
    const r = rotate(p, wristAngle);
    return point(mirror * r.x, r.y);
  };
  return {
    wrist: point(0, 0),
    palmCenter: local(point(20, 0)),
    palmRadius: point(19, 18),
    palmAngle: side === 'right' ? wristAngle : 180 - wristAngle,
    fingers: profiles[grip].map(([digit, bx, by, tx, ty, layer]) => ({
      digit, base: local(point(bx, by)), tip: local(point(tx, ty)),
      thickness: digit === 'thumb' ? 10 : digit === 'pinky' ? 7 : 8,
      layer
    }))
  };
}

/** Offset local hand geometry to an arbitrary world-space wrist. */
export function moveHandGeometry(hand: HandGeometry, wristWorld: Point): HandGeometry {
  return {
    wrist: wristWorld,
    palmCenter: add(hand.palmCenter, wristWorld),
    palmRadius: hand.palmRadius,
    palmAngle: hand.palmAngle,
    fingers: hand.fingers.map(f => ({...f, base: add(f.base, wristWorld), tip: add(f.tip, wristWorld)}))
  };
}
