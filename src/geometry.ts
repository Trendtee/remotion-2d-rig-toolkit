/** 2D Cartesian coordinates in screen space (positive y goes down). */
export type Point = Readonly<{x: number; y: number}>;
export const point = (x: number, y: number): Point => ({x, y});
export const add = (a: Point, b: Point): Point => point(a.x + b.x, a.y + b.y);
export const subtract = (a: Point, b: Point): Point => point(a.x - b.x, a.y - b.y);
export const multiply = (a: Point, scalar: number): Point => point(a.x * scalar, a.y * scalar);
export const length = (a: Point): number => Math.hypot(a.x, a.y);
export const distance = (a: Point, b: Point): number => length(subtract(a, b));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const mix = (a: Point, b: Point, t: number): Point => point(lerp(a.x, b.x, t), lerp(a.y, b.y, t));
export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
export const easeInOut = (t: number): number => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};

export const rotate = (p: Point, degrees: number): Point => {
  const r = (degrees * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return point(p.x * c - p.y * s, p.x * s + p.y * c);
};

export const isFinitePoint = (p: Point): boolean => Number.isFinite(p.x) && Number.isFinite(p.y);
