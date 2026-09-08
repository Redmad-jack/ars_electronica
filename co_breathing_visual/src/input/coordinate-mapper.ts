import { clamp, type Vec2 } from "../core/math";

export interface ElementBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Pointer client coordinates and DOM bounds share CSS-pixel space, independent of DPR. */
export function clientPointToNormalized(
  clientX: number,
  clientY: number,
  bounds: ElementBounds,
): Vec2 {
  return {
    x: clamp((clientX - bounds.left) / Math.max(bounds.width, 1), 0, 1),
    y: clamp((clientY - bounds.top) / Math.max(bounds.height, 1), 0, 1),
  };
}
