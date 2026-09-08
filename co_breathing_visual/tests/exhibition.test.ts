import { describe, expect, it } from "vitest";
import { angleDifference, length } from "../src/core/math";
import { BehaviorFlowField } from "../src/simulation/flow-field";
import { computeFlockForces } from "../src/simulation/boids";
import { DEFAULT_SETTINGS, type InteractionSource } from "../src/core/types";
import { settingsFromUrl, PRESETS, type Species } from "../src/exhibition/config";
import { ExhibitionFish, FIN_POINTS } from "../src/exhibition/fish";
import { ExhibitionFishView } from "../src/exhibition/fish-view";
import { ExhibitionWorld } from "../src/exhibition/world";
import { scenarioPeople, specimenMotion } from "../src/exhibition/scenarios";

const settings = (query = "") => settingsFromUrl(new URLSearchParams(query));
const person = (speed: number): InteractionSource => ({
  id: "test", position: { x: 0.5, y: 0.5 }, velocity: { x: speed, y: 0 },
  radius: 0.065, obstacleStrength: 1, flowStrength: 1, active: true,
});

describe("Exhibition body and simulation", () => {
  it.each<Species>(["ribbon", "fan"])("keeps %s fins curved and breathing at rest with fixed-length links", species => {
    const fish = new ExhibitionFish(0, species, { x: 0.6, y: 0.5 }, 0, 1.7, 1);
    fish.speed = 0;
    const ray = fish.finGroups[0][Math.floor(fish.finGroups[0].length / 2)];
    let minTip = Infinity, maxTip = -Infinity, bend = 0, linkError = 0;
    for (let i = 0; i < 480; i += 1) {
      fish.advance(1 / 60, 0, 0, { x: 0, y: 0 }, i / 60, true);
      if (i < 120) continue;
      const p = ray.points, last = (FIN_POINTS - 1) * 2;
      const dx = p[last] - p[0], dy = p[last + 1] - p[1];
      minTip = Math.min(minTip, dy); maxTip = Math.max(maxTip, dy);
      bend = Math.max(bend, Math.abs((p[8] - p[0]) * dy - (p[9] - p[1]) * dx) / Math.hypot(dx, dy));
      for (const fin of fish.rays) for (let j = 2; j < fin.points.length; j += 2) {
        linkError = Math.max(linkError, Math.abs(Math.hypot(fin.points[j] - fin.points[j - 2],
          fin.points[j + 1] - fin.points[j - 1]) - fin.segmentLength));
      }
      expect(fish.body.segmentError()).toBeLessThan(1e-6);
    }
    expect(ray.points.length).toBe(FIN_POINTS * 2);
    expect(maxTip - minTip).toBeGreaterThan(0.001);
    expect(bend).toBeGreaterThan(0.0003);
    expect(linkError).toBeLessThan(1e-6);
    expect(fish.heading).toBe(0);
  });

  it.each<Species>(["ribbon", "fan"])("carries a growing swim wave down the %s body", species => {
    const fish = new ExhibitionFish(0, species, { x: 0.6, y: 0.5 }, 0, 1.7, 1);
    let front = 0, rear = 0, previousTip = 0, maxTipStep = 0;
    for (let i = 0; i < 480; i += 1) {
      fish.advance(1 / 60, 0, 0.1, { x: 0, y: 0 }, i / 60, true);
      const tip = fish.body.joint(fish.body.jointCount - 1).y - fish.position.y;
      if (i > 120) {
        front = Math.max(front, Math.abs(fish.body.joint(3).y - fish.position.y));
        rear = Math.max(rear, Math.abs(tip));
        maxTipStep = Math.max(maxTipStep, Math.abs(tip - previousTip));
      }
      previousTip = tip;
    }
    expect(rear).toBeGreaterThan(front * 5);
    expect(rear).toBeGreaterThan(0.002);
    expect(maxTipStep).toBeLessThan(0.003);
  });

  it("uploads interpolated control chains without rebuilding GPU geometry", () => {
    const fish = new ExhibitionFish(0, "fan", { x: 0.6, y: 0.5 }, 0, 1, 1);
    const view = new ExhibitionFishView();
    try {
      view.update(fish, 1, settings(), 1080);
      const geometry = view.mesh.geometry, position = geometry.getAttribute("position");
      const copy = position.array.slice();
      const texture = view.mesh.material.uniforms.uControls.value;
      fish.advance(1 / 60, 0.1, 0.1, { x: 0, y: 0 }, 1 / 60);
      view.update(fish, 0.5, settings(), 1080);
      expect(view.mesh.geometry).toBe(geometry);
      expect(geometry.getAttribute("position")).toBe(position);
      expect(position.array).toEqual(copy);
      expect(view.mesh.material.uniforms.uControls.value).toBe(texture);
      expect(texture.image.data[0]).toBeCloseTo((fish.previousJoints[0] + fish.body.joint(0).x) / 2, 7);
      expect(view.mesh.material.uniforms.uPhase.value).toBeCloseTo((fish.previousPhase + fish.tailPhase) / 2, 8);
    } finally { view.dispose(); }
  });

  it("does not rotate in place when propulsion is stopped", () => {
    const fish = new ExhibitionFish(0, "fan", { x: 0.5, y: 0.5 }, 0, 1, 1);
    fish.speed = 0;
    for (let i = 0; i < 120; i += 1) fish.advance(1 / 60, Math.PI / 2, 0, { x: 0, y: 0 }, i / 60);
    expect(fish.heading).toBeCloseTo(0, 8);
    expect(fish.position.x).toBe(0.5); expect(fish.position.y).toBe(0.5);
  });

  it.each<Species>(["ribbon", "fan"])("keeps a body-scale turning radius for slow %s swimming", species => {
    const fish = new ExhibitionFish(0, species, { x: 0.5, y: 0.5 }, 0, 1, 1);
    fish.speed = 0.018;
    const minimumRadius = (fish.preset.length + fish.preset.tailLength) * fish.size * 0.8;
    for (let i = 0; i < 180; i += 1) {
      const before = fish.heading;
      fish.advance(1 / 60, Math.PI / 2, 0.018, { x: 0, y: 0 }, i / 60);
      expect(Math.abs(angleDifference(before, fish.heading)) * 60).toBeLessThanOrEqual(fish.speed / minimumRadius + 1e-8);
    }
    expect(Math.hypot(fish.position.x - 0.5, fish.position.y - 0.5)).toBeGreaterThan(0.04);
  });

  it("keeps an undisturbed fish on a forward course without periodic circling", () => {
    const world = new ExhibitionWorld(settings("scenario=none"));
    const fish = new ExhibitionFish(0, "ribbon", { x: 0.4, y: 0.5 }, 0, 1.7, 1);
    world.fish = [fish];
    for (let i = 0; i < 120; i += 1) world.step(1 / 60);
    expect(Math.abs(fish.heading)).toBeLessThan(0.03);
    expect(fish.position.x).toBeGreaterThan(0.48);
    expect(Math.abs(fish.position.y - 0.5)).toBeLessThan(0.005);
  });

  it.each<Species>(["ribbon", "fan"])("keeps the %s body and independent fins finite through all motion clips", species => {
    const fish = new ExhibitionFish(0, species, { x: 0.6, y: 0.5 }, 0, 1.7, 1.15);
    let maxError = 0;
    let foldedCells = 0;
    for (let i = 0; i < 36 * 60; i += 1) {
      const target = specimenMotion("cycle", i / 60, 1.7);
      fish.advance(1 / 60, target.heading, target.speed, { x: 0.025, y: -0.025 }, i / 60, true);
      maxError = Math.max(maxError, fish.body.segmentError());
      for (const ray of fish.rays) {
        expect(ray.points.every(v => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true);
      }
      // Adjacent ray strips must not reverse winding within a cell (apart from zero-area roots).
      for (const group of fish.finGroups) for (let r = 1; r < group.length; r += 1) {
        const a = group[r - 1].points, b = group[r].points;
        for (let j = 2; j < a.length; j += 2) {
          const areaA = (b[j - 2] - a[j - 2]) * (a[j + 1] - a[j - 1]) - (b[j - 1] - a[j - 1]) * (a[j] - a[j - 2]);
          const areaB = (b[j] - b[j - 2]) * (a[j + 1] - b[j - 1]) - (b[j + 1] - b[j - 1]) * (a[j] - b[j - 2]);
          if (areaA * areaB < -1e-16) foldedCells += 1;
        }
      }
    }
    expect(fish.body.jointCount).toBe(PRESETS[species].joints);
    expect(maxError).toBeLessThan(0.002);
    expect(foldedCells).toBe(0);
  });

  it.each([3, 4, 12, 24])("runs %i fish without changing individual sizes or losing human injections", count => {
    const world = new ExhibitionWorld(settings("fish=" + count + "&scenario=crossing"));
    const four = new ExhibitionWorld(settings("fish=4"));
    // Random positions consume the same random samples per school fish.
    expect(world.fish[0].size).toBe(four.fish[0].size);
    for (let i = 0; i < 240; i += 1) world.step(1 / 60);
    expect(world.fish).toHaveLength(count);
    for (const fish of world.fish) {
      expect(fish.body.isFinite()).toBe(true);
      expect(fish.speed).toBeLessThanOrEqual(0.17);
      for (const ray of fish.rays) expect(ray.points.every(v => v >= 0.007 && v <= 0.993)).toBe(true);
    }
    expect(world.injections().length).toBe(count + 3);
  });

  it("replays seeded CPU state and clears flow, alarm and geometry on reset", () => {
    const a = new ExhibitionWorld(settings("fish=12&scenario=fast"));
    const b = new ExhibitionWorld(settings("fish=12&scenario=fast"));
    for (let i = 0; i < 180; i += 1) { a.step(1 / 60); b.step(1 / 60); }
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(a.fish.map(f => [...f.rays[0].points])).toEqual(b.fish.map(f => [...f.rays[0].points]));
    a.reset(); b.reset();
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(a.flow.energy()).toBe(0);
    expect(a.fish.every(f => f.alert === 0)).toBe(true);
  });

  it("responds more strongly to nearby fast movement and calms after it leaves", () => {
    const slow = new ExhibitionWorld(settings("scenario=none"));
    const fast = new ExhibitionWorld(settings("scenario=none"));
    for (const world of [slow, fast]) world.fish[0].translate(0.5 - world.fish[0].position.x, 0.65 - world.fish[0].position.y);
    slow.setExternalAudience([person(0.03)]); fast.setExternalAudience([person(0.5)]);
    for (let i = 0; i < 20; i += 1) { slow.step(1 / 60); fast.step(1 / 60); }
    expect(fast.fish[0].alert).toBeGreaterThan(slow.fish[0].alert + 0.15);
    const alarm = fast.fish[0].alert;
    fast.setExternalAudience([]);
    for (let i = 0; i < 360; i += 1) fast.step(1 / 60);
    expect(fast.fish[0].alert).toBeLessThan(alarm * 0.15);
  });

  it("does not startle at distant fast motion", () => {
    const world = new ExhibitionWorld(settings("scenario=none"));
    world.fish[0].translate(0.8 - world.fish[0].position.x, 0.8 - world.fish[0].position.y);
    world.setExternalAudience([{ ...person(0.8), position: { x: 0.1, y: 0.1 } }]);
    world.step(1 / 60);
    expect(world.fish[0].alert).toBe(0);
  });

  it("passive drift changes position but not tail drive", () => {
    const fish = new ExhibitionFish(0, "ribbon", { x: 0.6, y: 0.5 }, 0, 1, 1);
    fish.speed = 0;
    fish.advance(1 / 60, 0, 0, { x: 0.08, y: -0.04 }, 0);
    expect(fish.position.x).toBeGreaterThan(0.6);
    expect(fish.position.y).toBeLessThan(0.5);
    expect(fish.activity).toBe(0);
    expect(length(fish.swimVelocity)).toBe(0);
  });

  it("uses no more than six visible flock neighbors", () => {
    const world = new ExhibitionWorld(settings("fish=24"));
    const fish = world.fish[0];
    fish.position = { x: 0.5, y: 0.5 }; fish.velocity = { x: 0.05, y: 0 };
    for (let i = 1; i < world.fish.length; i += 1) world.fish[i].position = { x: 0.51 + i * 0.002, y: 0.5 };
    expect(computeFlockForces(fish, world.fish, DEFAULT_SETTINGS, { maxNeighbors: 6, separationRadius: 0.08 }).neighborCount).toBe(6);
  });
});

describe("Exhibition flow and input", () => {
  it("uploads CPU velocities with bottom-left origin and negated Y", () => {
    const flow = new BehaviorFlowField(64, 64, 0.55, 0.8, 0.26, true);
    flow.inject({ ...person(0.1), position: { x: 0.3, y: 0.2 }, velocity: { x: 0.1, y: -0.2 } });
    const data = new Float32Array(64 * 64 * 4);
    flow.writeTexture(data);
    const top = ((63 - 12) * 64 + 19) * 4;
    expect(data[top]).toBeGreaterThan(0);
    expect(data[top + 1]).toBeGreaterThan(0);
    expect(data[(12 * 64 + 19) * 4]).toBe(0);
    const sample = flow.sample({ x: 0.3, y: 0.2 });
    expect(sample.x).toBeGreaterThan(0); expect(sample.y).toBeLessThan(0);
  });

  it("pressure projection and dissipation leave a bounded decaying field", () => {
    const flow = new BehaviorFlowField(64, 64, 0.55, 0.8, 0.26, true);
    flow.inject(person(0.5));
    flow.step(1 / 60);
    const energy = flow.energy();
    for (let i = 0; i < 600; i += 1) flow.step(1 / 60);
    expect(flow.energy()).toBeLessThan(energy * 0.03);
    expect(length(flow.sample({ x: 0.5, y: 0.5 }))).toBeLessThanOrEqual(0.26);
  });

  it("retains square coordinates, specimen counts and valid URL defaults", () => {
    expect(settings("fish=NaN").fishCount).toBe(4);
    expect(settings("fish=100").fishCount).toBe(24);
    expect(new ExhibitionWorld(settings("scene=specimen")).fish).toHaveLength(1);
    expect(new ExhibitionWorld(settings("scene=specimen&compare=1")).fish).toHaveLength(2);
    expect(settings("quality=invalid").quality).toBe("standard");
  });

  it("provides repeatable, speed-correct scenarios", () => {
    expect(scenarioPeople("none", 0)).toEqual([]);
    expect(length(scenarioPeople("slow", 1)[0].velocity)).toBeLessThan(0.08);
    expect(length(scenarioPeople("fast", 1)[0].velocity)).toBeGreaterThan(0.30);
    expect(scenarioPeople("fast", 3)).toEqual([]);
    expect(length(scenarioPeople("hold", 8)[0].velocity)).toBe(0);
    expect(scenarioPeople("crossing", 8)).toHaveLength(3);
    expect(scenarioPeople("crossing", 8)).toEqual(scenarioPeople("crossing", 8));
  });
});
