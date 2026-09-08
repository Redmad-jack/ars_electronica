import { describe, expect, it } from "vitest";
import { angleDifference, length } from "../src/core/math";
import { DEFAULT_SETTINGS } from "../src/core/types";
import { FishAgent } from "../src/simulation/fish-agent";

describe("FishAgent", () => {
  it("limits speed, force and angular velocity", () => {
    const settings = { ...DEFAULT_SETTINGS };
    const fish = new FishAgent(0, { x: 0.5, y: 0.5 }, { x: settings.minSpeed, y: 0 }, 0);
    const previousHeading = fish.heading;

    fish.integrate({ x: 100, y: 100 }, settings, 1 / 60, 0);

    expect(length(fish.velocity)).toBeLessThanOrEqual(settings.maxSpeed + 1e-9);
    expect(length(fish.velocity)).toBeGreaterThanOrEqual(settings.minSpeed - 1e-9);
    expect(Math.abs(angleDifference(previousHeading, fish.heading))).toBeLessThanOrEqual(
      settings.maxTurnRate / 60 + 1e-9,
    );
  });

  it("alternates between bursts, slower swimming and rest", () => {
    const settings = { ...DEFAULT_SETTINGS };
    const fish = new FishAgent(3, { x: 0.5, y: 0.5 }, { x: settings.minSpeed, y: 0 }, 2.4);
    const speeds: number[] = [];

    for (let step = 0; step < 60 * 20; step += 1) {
      fish.integrate({ x: 0, y: 0 }, settings, 1 / 60, step / 60);
      speeds.push(length(fish.velocity));
    }

    expect(Math.max(...speeds) - Math.min(...speeds)).toBeGreaterThan(0.08);
    expect(Math.max(...speeds)).toBeLessThanOrEqual(settings.maxSpeed + 1e-9);
    expect(Math.min(...speeds)).toBeLessThan(settings.minSpeed * 0.25);
  });

  it("can react mildly or startle strongly at the same proximity", () => {
    const fish = new FishAgent(2, { x: 0.5, y: 0.5 }, { x: 0.04, y: 0 }, 1.8);
    const responses = Array.from({ length: 240 }, (_, index) => fish.threatResponse(index / 20, 0.8));

    expect(Math.max(...responses)).toBeGreaterThan(Math.min(...responses) + 0.45);
    expect(Math.max(...responses)).toBeGreaterThan(1);
  });
});
