/** Generic ordering for depth-aware hand/object interaction. */
export const GRIP_LAYER_ORDER = ['rearArm', 'rearFingers', 'object', 'palm', 'frontFingers', 'frontArm'] as const;
export type GripLayer = typeof GRIP_LAYER_ORDER[number];
export function sortGripLayers<T extends {layer: GripLayer}>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => GRIP_LAYER_ORDER.indexOf(a.layer) - GRIP_LAYER_ORDER.indexOf(b.layer));
}
