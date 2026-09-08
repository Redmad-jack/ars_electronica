import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/core/types";
import { ProceduralCrowd } from "../src/simulation/crowd";

describe("ProceduralCrowd", () => {
  it("reproduces the same motion from a fixed seed", () => {
    const settings = { ...DEFAULT_SETTINGS, seed: 9404, crowdCount: 3 };
    const first = new ProceduralCrowd(settings);
    const second = new ProceduralCrowd(settings);

    for (let step = 0; step < 600; step += 1) {
      first.step(1 / 60, step / 60);
      second.step(1 / 60, step / 60);
    }

    expect(first.agents).toEqual(second.agents);
  });

  it("varies the active population between zero and three while staying in bounds", () => {
    const crowd = new ProceduralCrowd({ ...DEFAULT_SETTINGS, crowdCount: 3 });
    const observedCounts = new Set<number>();
    for (let step = 0; step < 60 * 90; step += 1) {
      crowd.step(1 / 60, step / 60);
      observedCounts.add(crowd.agents.filter((person) => person.active).length);
    }

    expect(crowd.agents).toHaveLength(3);
    expect(observedCounts.has(0)).toBe(true);
    expect(observedCounts.has(3)).toBe(true);
    for (const person of crowd.agents) {
      expect(Number.isFinite(person.position.x)).toBe(true);
      expect(Number.isFinite(person.position.y)).toBe(true);
      expect(person.position.x).toBeGreaterThan(0);
      expect(person.position.x).toBeLessThan(1);
      expect(person.position.y).toBeGreaterThan(0);
      expect(person.position.y).toBeLessThan(1);
    }
  });
});
