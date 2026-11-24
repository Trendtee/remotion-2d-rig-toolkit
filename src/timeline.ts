import {clamp, easeInOut, lerp, point, type Point} from './geometry.js';
export type Interpolation = 'linear' | 'smooth' | 'hold';
export interface FrameKey<T> {frame: number; value: T; interpolation?: Interpolation}

/** No wall clocks, randomness or mutable state: same frame produces same output. */
export function sampleScalar(keys: readonly FrameKey<number>[], frame: number): number {
  if (keys.length === 0) throw new Error('At least one timeline key is required');
  if (!Number.isFinite(frame)) throw new RangeError('Frame must be finite');
  for (let i = 1; i < keys.length; i++) {
    if (!(keys[i]!.frame > keys[i - 1]!.frame)) throw new Error('Keyframe frames must increase strictly');
  }
  if (frame <= keys[0]!.frame) return keys[0]!.value;
  for (let i = 1; i < keys.length; i++) {
    const from = keys[i - 1]!;
    const to = keys[i]!;
    if (frame <= to.frame) {
      const t = clamp((frame - from.frame) / (to.frame - from.frame), 0, 1);
      const u = to.interpolation === 'hold' ? (t < 1 ? 0 : 1) : to.interpolation === 'linear' ? t : easeInOut(t);
      return lerp(from.value, to.value, u);
    }
  }
  return keys[keys.length - 1]!.value;
}
export function samplePoint(keys: readonly FrameKey<Point>[], frame: number): Point {
  return point(sampleScalar(keys.map(k => ({...k, value: k.value.x})), frame),
               sampleScalar(keys.map(k => ({...k, value: k.value.y})), frame));
}

/**
 * Keys for smooth paths. `stop: true` makes the motion come to rest at that key (zero velocity);
 * the first and last keys always stop. A segment whose END key has `interpolation: 'hold'` holds the
 * previous value, as in `sampleScalar`.
 */
export interface PathKey<T> extends FrameKey<T> {stop?: boolean}

function smoothSample(values: readonly number[], keys: readonly PathKey<unknown>[], frame: number): number {
  if (keys.length === 0) throw new Error('At least one timeline key is required');
  if (!Number.isFinite(frame)) throw new RangeError('Frame must be finite');
  for (let i = 1; i < keys.length; i++) {
    if (!(keys[i]!.frame > keys[i - 1]!.frame)) throw new Error('Keyframe frames must increase strictly');
  }
  const n = keys.length;
  if (frame <= keys[0]!.frame) return values[0]!;
  if (frame >= keys[n - 1]!.frame) return values[n - 1]!;
  const isStop = (k: number) => k === 0 || k === n - 1 || keys[k]!.stop === true ||
    keys[k]!.interpolation === 'hold' || keys[k + 1]?.interpolation === 'hold';
  // Tangent in value units per frame (finite difference across the neighbours).
  const tangent = (k: number) => isStop(k) ? 0 :
    (values[k + 1]! - values[k - 1]!) / (keys[k + 1]!.frame - keys[k - 1]!.frame);
  let i = 1;
  while (frame > keys[i]!.frame) i++;
  const k0 = i - 1;
  const dt = keys[i]!.frame - keys[k0]!.frame;
  if (keys[i]!.interpolation === 'hold') return values[k0]!;
  const u = (frame - keys[k0]!.frame) / dt;
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * values[k0]! + (u3 - 2 * u2 + u) * dt * tangent(k0) +
    (-2 * u3 + 3 * u2) * values[i]! + (u3 - u2) * dt * tangent(i);
}

/**
 * Smooth path through keyframes (cubic Hermite with velocity carried THROUGH intermediate keys).
 * Unlike `sampleScalar`, which eases in and out of every key, motion only slows at `stop` keys and at
 * the ends, so multi-waypoint moves (reach over an object, return to rest) keep a lower peak speed.
 * Deterministic and frame-based.
 */
export function sampleSmoothScalar(keys: readonly PathKey<number>[], frame: number): number {
  return smoothSample(keys.map(k => k.value), keys, frame);
}
export function sampleSmoothPoint(keys: readonly PathKey<Point>[], frame: number): Point {
  return point(smoothSample(keys.map(k => k.value.x), keys, frame), smoothSample(keys.map(k => k.value.y), keys, frame));
}
