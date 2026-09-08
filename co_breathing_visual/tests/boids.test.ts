import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/core/types";
import { computeFlockForces } from "../src/simulation/boids";
import { FishAgent } from "../src/simulation/fish-agent";

describe("Boids forces", () => {
  it("separates from a close neighbor while aligning and cohering", () => {
    const fish = new FishAgent(0, { x: 0.5, y: 0.5 }, { x: 0.08, y: 0 }, 0);
    const neighbor = new FishAgent(1, { x: 0.53, y: 0.5 }, { x: 0.06, y: 0.02 }, 1);
    const forces = computeFlockForces(fish, [fish, neighbor], { ...DEFAULT_SETTINGS });

    expect(forces.neighborCount).toBe(1);
    expect(forces.separation.x).toBeLessThan(0);
    expect(forces.cohesion.x).toBeGreaterThan(0);
    expect(forces.alignment.y).toBeGreaterThan(0);
  });

  it("ignores a neighbor outside the configured field of view", () => {
    const fish = new FishAgent(0, { x: 0.5, y: 0.5 }, { x: 0.08, y: 0 }, 0);
    const neighbor = new FishAgent(1, { x: 0.4, y: 0.5 }, { x: 0.08, y: 0 }, 1);
    const settings = { ...DEFAULT_SETTINGS, fieldOfViewDegrees: 120 };

    expect(computeFlockForces(fish, [fish, neighbor], settings).neighborCount).toBe(0);
  });
});
