import { describe, expect, it } from "vitest";
import type { InteractionSource } from "../src/core/types";
import { CircleObstacleField } from "../src/simulation/obstacle-field";

const source: InteractionSource = {
  id: "test",
  position: { x: 0.5, y: 0.5 },
  velocity: { x: 0, y: 0 },
  radius: 0.1,
  obstacleStrength: 1,
  flowStrength: 0,
  active: true,
};

describe("CircleObstacleField", () => {
  it("returns signed distance and outward normal", () => {
    const field = new CircleObstacleField();
    const outside = field.sample({ x: 0.7, y: 0.5 }, source, 1);
    const inside = field.sample({ x: 0.55, y: 0.5 }, source, 1);

    expect(outside.distance).toBeCloseTo(0.1, 6);
    expect(outside.normal).toEqual({ x: 1, y: 0 });
    expect(inside.distance).toBeCloseTo(-0.05, 6);
  });

  it("steers a forward prediction away before the fish reaches the core", () => {
    const force = new CircleObstacleField().avoidanceForce(
      { x: 0.32, y: 0.5 },
      { x: 0.1, y: 0 },
      source,
      1,
      0.8,
      0.075,
    );

    expect(force.x).toBeLessThan(0);
    expect(Math.abs(force.y)).toBeLessThan(1e-7);
  });
});
