export interface Vec2 {
  x: number;
  y: number;
}

export const EPSILON = 1e-7;

export function vec2(x = 0, y = 0): Vec2 {
  return { x, y };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subtract(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(value: Vec2, factor: number): Vec2 {
  return { x: value.x * factor, y: value.y * factor };
}

export function lengthSquared(value: Vec2): number {
  return value.x * value.x + value.y * value.y;
}

export function length(value: Vec2): number {
  return Math.hypot(value.x, value.y);
}

export function normalize(value: Vec2, fallback: Vec2 = { x: 1, y: 0 }): Vec2 {
  const magnitude = length(value);
  if (magnitude <= EPSILON) {
    return { ...fallback };
  }
  return { x: value.x / magnitude, y: value.y / magnitude };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function clampMagnitude(value: Vec2, maxMagnitude: number): Vec2 {
  const magnitudeSquared = lengthSquared(value);
  if (magnitudeSquared <= maxMagnitude * maxMagnitude) {
    return { ...value };
  }
  const factor = maxMagnitude / Math.sqrt(magnitudeSquared);
  return scale(value, factor);
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpVec(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / Math.max(edge1 - edge0, EPSILON), 0, 1);
  return t * t * (3 - 2 * t);
}

export function angleDifference(from: number, to: number): number {
  let difference = (to - from + Math.PI) % (Math.PI * 2);
  if (difference < 0) {
    difference += Math.PI * 2;
  }
  return difference - Math.PI;
}

export function rotateToward(from: number, to: number, maxDelta: number): number {
  return from + clamp(angleDifference(from, to), -maxDelta, maxDelta);
}

export function isFiniteVec(value: Vec2): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y);
}
