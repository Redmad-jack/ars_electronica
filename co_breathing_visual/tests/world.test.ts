import { describe, expect, it } from "vitest";
import { length, subtract } from "../src/core/math";
import type { InteractionSource } from "../src/core/types";
import { DEFAULT_SETTINGS } from "../src/core/types";
import { SimulationWorld } from "../src/simulation/world";

const inactiveSource: InteractionSource = {
  id: "test",
  position: { x: 0.5, y: 0.5 },
  velocity: { x: 0, y: 0 },
  radius: 0.1,
  obstacleStrength: 0,
  flowStrength: 0,
  active: false,
};

describe("SimulationWorld", () => {
  it.each([3, 4, 5])("creates and runs %i fish", (fishCount) => {
    const world = new SimulationWorld({ ...DEFAULT_SETTINGS, fishCount }, 16 / 9);
    for (let step = 0; step < 180; step += 1) {
      world.step(1 / 60, step / 60, inactiveSource);
    }

    expect(world.agents).toHaveLength(fishCount);
    expect(world.agents.every((fish) => fish.body.isFinite())).toBe(true);
  });

  it("reproduces initial position, velocity and phase from a fixed seed", () => {
    const first = new SimulationWorld({ ...DEFAULT_SETTINGS, seed: 1933 }, 16 / 9);
    const second = new SimulationWorld({ ...DEFAULT_SETTINGS, seed: 1933 }, 16 / 9);

    expect(first.agents.map(({ position, velocity, phase }) => ({ position, velocity, phase }))).toEqual(
      second.agents.map(({ position, velocity, phase }) => ({ position, velocity, phase })),
    );
  });

  it("keeps fish outside simulated people and exposes normalized state", () => {
    const world = new SimulationWorld(
      { ...DEFAULT_SETTINGS, fishCount: 3, crowdCount: 1, crowdSpeed: 0.005 },
      16 / 9,
    );
    const person = world.people[0];
    const fish = world.agents[0];
    fish.position = { x: person.position.x * world.width, y: person.position.y };

    world.step(1 / 60, 0, inactiveSource);

    const personWorldPosition = { x: person.position.x * world.width, y: person.position.y };
    expect(length(subtract(fish.position, personWorldPosition))).toBeGreaterThanOrEqual(
      person.radius + 0.0119,
    );
    const snapshot = world.snapshot(1 / 60);
    expect(snapshot.people).toHaveLength(1);
    expect(snapshot.fish).toHaveLength(3);
    expect(snapshot.fish[0].position.x).toBeGreaterThanOrEqual(0);
    expect(snapshot.fish[0].position.x).toBeLessThanOrEqual(1);
  });

  it("remains finite and contained for ten simulated minutes", () => {
    const world = new SimulationWorld({ ...DEFAULT_SETTINGS }, 16 / 9);
    const totalSteps = 10 * 60 * 60;

    for (let step = 0; step < totalSteps; step += 1) {
      world.step(1 / 60, step / 60, inactiveSource);
    }

    for (const fish of world.agents) {
      expect(Number.isFinite(fish.position.x)).toBe(true);
      expect(Number.isFinite(fish.position.y)).toBe(true);
      expect(fish.body.isFinite()).toBe(true);
      expect(fish.body.segmentError()).toBeLessThan(0.002);
      expect(fish.position.x).toBeGreaterThanOrEqual(0.125);
      expect(fish.position.x).toBeLessThanOrEqual(world.width - 0.125);
      expect(fish.position.y).toBeGreaterThanOrEqual(0.125);
      expect(fish.position.y).toBeLessThanOrEqual(0.875);
      for (let index = 0; index < fish.body.jointCount; index += 1) {
        const joint = fish.body.joint(index);
        expect(joint.x).toBeGreaterThanOrEqual(0);
        expect(joint.x).toBeLessThanOrEqual(1);
        expect(joint.y).toBeGreaterThanOrEqual(0);
        expect(joint.y).toBeLessThanOrEqual(1);
      }
    }
  }, 60_000);

  it("keeps a 1:1 world when the display aspect ratio changes", () => {
    const world = new SimulationWorld({ ...DEFAULT_SETTINGS }, 21 / 9);
    expect(world.width).toBe(1);
    world.resize(9 / 16);
    expect(world.width).toBe(1);
  });

  it("injects moving crowd flow when Both is selected", () => {
    const world = new SimulationWorld(
      { ...DEFAULT_SETTINGS, crowdCount: 3, interactionMode: "both" },
      1,
    );
    for (let step = 0; step < 120; step += 1) {
      world.step(1 / 60, step / 60, inactiveSource);
    }

    expect(world.flowField.energy()).toBeGreaterThan(0);
  });

  it("does not inject crowd flow in Obstacle-only mode", () => {
    const world = new SimulationWorld(
      { ...DEFAULT_SETTINGS, crowdCount: 3, interactionMode: "obstacle" },
      1,
    );
    for (let step = 0; step < 120; step += 1) {
      world.step(1 / 60, step / 60, inactiveSource);
    }

    expect(world.flowField.energy()).toBe(0);
  });

  it("uses live camera people until the input returns to fallback", () => {
    const world = new SimulationWorld({ ...DEFAULT_SETTINGS, crowdCount: 3 }, 1);
    world.setExternalAudience([{
      id: "camera-person-9",
      position: { x: 0.25, y: 0.75 },
      velocity: { x: 0.1, y: 0 },
      radius: 0.07,
      obstacleStrength: 1,
      flowStrength: 1,
      active: true,
      activity: 0.4,
    }]);

    expect(world.people.map((person) => person.id)).toEqual(["camera-person-9"]);
    expect(world.snapshot(0).people).toHaveLength(1);

    world.setExternalAudience(null);
    expect(world.people).toHaveLength(3);
    expect(world.people[0].id).toBe("person-1");
  });
});
