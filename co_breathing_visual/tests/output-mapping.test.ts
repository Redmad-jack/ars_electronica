import { describe, expect, it } from "vitest";
import { InstallationOutputMapper } from "../src/simulation/output-mapping";
import type { SimulationSnapshot } from "../src/simulation/world";

function snapshot(personX = 0.9): SimulationSnapshot {
  return {
    simulationTime: 0,
    fish: [
      {
        id: "fish-0",
        position: { x: 0.5, y: 0.5 },
        velocity: { x: 0.165, y: 0 },
        activity: 1,
      },
    ],
    people: [
      {
        id: "person-0",
        position: { x: personX, y: 0.5 },
        velocity: { x: 0, y: 0 },
        activity: 0,
        radius: 0.06,
      },
    ],
  };
}

describe("InstallationOutputMapper", () => {
  it("uses the left pump to express rightward fish motion", () => {
    const mapper = new InstallationOutputMapper();
    let state = mapper.update(snapshot(), 0);
    for (let step = 0; step < 120; step += 1) {
      state = mapper.update(snapshot(), 1 / 60);
    }

    expect(state.pumps.left).toBeGreaterThan(0.9);
    expect(state.pumps.right).toBe(0);
    expect(state.pumps.top).toBe(0);
    expect(state.pumps.bottom).toBe(0);
  });

  it("pulses mist after a sustained fish-person encounter", () => {
    const mapper = new InstallationOutputMapper();
    expect(mapper.update(snapshot(0.55), 0.1).atomizer.active).toBe(false);
    let state = mapper.update(snapshot(0.55), 0.1);
    expect(state.atomizer.active).toBe(true);
    expect(state.atomizer.armed).toBe(false);

    for (let step = 0; step < 9; step += 1) {
      state = mapper.update(snapshot(0.55), 0.1);
    }
    expect(state.atomizer.active).toBe(false);
    expect(state.atomizer.cooldownRemaining).toBeGreaterThan(0);
  });

  it("requires cooldown and separation before another mist pulse", () => {
    const mapper = new InstallationOutputMapper();
    mapper.update(snapshot(0.55), 0.1);
    mapper.update(snapshot(0.55), 0.1);

    let state = mapper.update(snapshot(0.55), 0.1);
    for (let step = 0; step < 105; step += 1) {
      state = mapper.update(snapshot(), 0.1);
    }
    expect(state.atomizer.armed).toBe(true);

    mapper.update(snapshot(0.55), 0.1);
    state = mapper.update(snapshot(0.55), 0.1);
    expect(state.atomizer.active).toBe(true);
  });
});
