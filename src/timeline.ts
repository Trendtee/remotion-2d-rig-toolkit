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
