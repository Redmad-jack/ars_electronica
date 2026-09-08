import { describe, expect, it } from "vitest";
import type { InteractionSource } from "../src/core/types";
import { BehaviorFlowField } from "../src/simulation/flow-field";

const rightwardSource: InteractionSource = {
  id: "test",
  position: { x: 0.5, y: 0.5 },
  velocity: { x: 0.8, y: 0 },
  radius: 0.18,
  obstacleStrength: 0,
  flowStrength: 1.4,
  active: true,
};

describe("BehaviorFlowField", () => {
  it("samples injected flow with bilinear interpolation", () => {
    const field = new BehaviorFlowField(32, 18);
    field.inject(rightwardSource);
    field.step(1 / 60);

    const center = field.sample({ x: 0.5, y: 0.5 });
    expect(center.x).toBeGreaterThan(0.45);
    expect(Math.abs(center.y)).toBeLessThan(1e-6);
  });

  it("advects and exponentially decays energy after injection stops", () => {
    const field = new BehaviorFlowField(32, 18, 1.5);
    field.inject(rightwardSource);
    field.step(1 / 60);
    const initialEnergy = field.energy();

    for (let step = 0; step < 180; step += 1) {
      field.step(1 / 60);
    }

    expect(initialEnergy).toBeGreaterThan(0);
    expect(field.energy()).toBeLessThan(initialEnergy * 0.05);
  });
});
