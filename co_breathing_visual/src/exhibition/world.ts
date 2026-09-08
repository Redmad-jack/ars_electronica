import { angleDifference, clamp, length, normalize, smoothstep } from "../core/math";
import { SeededRandom } from "../core/random";
import { DEFAULT_SETTINGS, type InteractionSource } from "../core/types";
import { computeFlockForces } from "../simulation/boids";
import { BehaviorFlowField } from "../simulation/flow-field";
import type { SimulationSnapshot } from "../simulation/world";
import type { FluidInjection } from "../render/visual-fluid";
import { RESPONSE, type ExhibitionSettings } from "./config";
import { ExhibitionFish } from "./fish";
import { scenarioPeople, specimenMotion } from "./scenarios";

export class ExhibitionWorld {
  readonly flow = new BehaviorFlowField(64, 64, 0.55, 0.8, 0.26, true);
  fish: ExhibitionFish[] = [];
  people: readonly InteractionSource[] = [];
  time = 0;
  private externalPeople: readonly InteractionSource[] | null = null;
  readonly flockSettings = { ...DEFAULT_SETTINGS, perceptionRadius: 0.24, maxSpeed: 0.10, fieldOfViewDegrees: 280 };

  constructor(readonly settings: ExhibitionSettings) { this.reset(); }

  reset(): void {
    this.time = 0; this.flow.reset(); this.people = []; this.fish = [];
    const random = new SeededRandom(this.settings.seed);
    const count = this.settings.scene === "flow" ? 1 : this.settings.scene === "specimen" ? (this.settings.comparison ? 2 : 1) : this.settings.fishCount;
    const columns = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / columns);
    for (let i = 0; i < count; i += 1) {
      const specimen = this.settings.scene === "specimen";
      const position = specimen ? { x: 0.54, y: count === 1 ? 0.5 : 0.40 + i * 0.20 } : {
        x: 0.19 + ((i % columns) + 0.45 + random.range(-0.12, 0.12)) / columns * 0.66,
        y: 0.15 + (Math.floor(i / columns) + 0.5 + random.range(-0.12, 0.12)) / rows * 0.7,
      };
      this.fish.push(new ExhibitionFish(i,
        specimen && !this.settings.comparison ? this.settings.species : i % 2 === 0 ? "ribbon" : "fan",
        position, specimen ? 0.2 : random.range(-Math.PI, Math.PI),
        random.range(0, Math.PI * 2), random.range(0.85, 1.15)));
    }
  }

  setExternalAudience(people: readonly InteractionSource[] | null): void {
    this.externalPeople = people?.map(p => ({ ...p, position: { ...p.position }, velocity: { ...p.velocity } })) ?? null;
  }

  step(dt: number, mouse?: InteractionSource, samples: readonly InteractionSource[] = []): void {
    this.people = this.settings.scene === "school"
      ? this.externalPeople ?? scenarioPeople(this.settings.scenario, this.time) : [];
    const sources = mouse?.active ? [...this.people, mouse] : [...this.people];
    if (this.settings.scene === "flow") {
      this.flow.setUniform(this.settings.flowDirection === "right" ? { x: 0.045, y: 0 } : { x: 0, y: -0.045 });
    } else {
      const flowSources = samples.length ? [...this.people, ...samples] : sources;
      for (const source of flowSources) this.flow.inject({ ...source,
        radius: Math.max(source.radius * 1.6, 0.06),
        flowStrength: source.flowStrength * dt * 1.8 / Math.sqrt(Math.max(1, this.people.length)),
      });
      const density = 1 / Math.sqrt(Math.max(1, this.fish.length / 4));
      for (const fish of this.fish) {
        const tail = fish.previousTail;
        const nx = -Math.sin(fish.heading), ny = Math.cos(fish.heading);
        for (const side of [-1, 1]) {
          this.flow.inject({ id: `wake-${fish.id}-${side}`, active: true, obstacleStrength: 0,
            position: { x: tail.x + nx * side * 0.008, y: tail.y + ny * side * 0.008 }, radius: 0.026 * fish.size,
            velocity: { x: fish.tailVelocity.x * 0.6 + nx * side * fish.activity * 0.04,
              y: fish.tailVelocity.y * 0.6 + ny * side * fish.activity * 0.04 },
            flowStrength: dt * density * 0.5,
          });
        }
      }
      this.flow.step(dt);
    }

    const targets = this.fish.map(fish => this.target(fish, sources, dt));
    for (let i = 0; i < this.fish.length; i += 1) {
      const fish = this.fish[i];
      const target = targets[i];
      fish.advance(dt, target.heading, target.speed, this.flow.sample(fish.position), this.time, this.settings.scene === "specimen");
      if (this.settings.scene === "school") this.resolvePeople(fish, sources);
    }
    this.time += dt;
  }

  injections(mouse?: InteractionSource, samples: readonly InteractionSource[] = []): FluidInjection[] {
    const result: FluidInjection[] = [];
    const density = 1 / Math.sqrt(Math.max(1, this.fish.length / 4));
    for (const fish of this.fish) {
      const hueShift = 0.5 + 0.5 * Math.sin(fish.phase);
      result.push({ position: { ...fish.position }, velocity: fish.velocity,
        color: [0.035 + hueShift * 0.016, 0.18 + hueShift * 0.035, 0.2 + hueShift * 0.045],
        radius: 0.012 + fish.activity * 0.006,
        strength: (0.012 + fish.activity * 0.026) * density * this.settings.dye });
    }
    for (const person of this.people) {
      const speed = length(person.velocity);
      if (!person.active || speed < 0.001 || person.flowStrength <= 0) continue;
      result.push({ position: person.position, velocity: person.velocity, radius: Math.max(person.radius * 0.5, 0.025),
        color: [0.34, 0.1, 0.025], strength: clamp(speed * person.flowStrength * 0.5, 0.01, 0.05) * this.settings.dye });
    }
    const pointerSamples = samples.length ? samples.slice(-8) : mouse?.active ? [mouse] : [];
    for (const sample of pointerSamples) {
      if (!sample.active || sample.flowStrength <= 0 || length(sample.velocity) <= 0.004) continue;
      result.push({ position: sample.position, velocity: sample.velocity,
        color: [0.42, 0.12, 0.035], radius: Math.max(sample.radius * 0.42, 0.02),
        strength: clamp(length(sample.velocity) * sample.flowStrength * 0.038, 0.018, 0.09) * this.settings.dye });
    }
    if (this.settings.scene === "flow") result.push({ position: { x: 0.3, y: 0.7 }, velocity: { x: 0, y: 0 },
      color: [0.03, 0.12, 0.13], radius: 0.012, strength: 0.03 * this.settings.dye });
    return result;
  }

  snapshot(): SimulationSnapshot {
    return { simulationTime: this.time,
      fish: this.fish.map(f => ({ id: `fish-${f.id}`, position: { ...f.position }, velocity: { ...f.velocity }, activity: f.activity })),
      people: this.people.filter(p => p.active).map(p => ({ id: p.id, position: { ...p.position }, velocity: { ...p.velocity }, radius: p.radius, activity: clamp(length(p.velocity), 0, 1) })),
    };
  }

  private target(fish: ExhibitionFish, sources: readonly InteractionSource[], dt: number): { heading: number; speed: number } {
    if (this.settings.scene === "specimen") return specimenMotion(this.settings.motion, this.time, fish.phase);
    if (this.settings.scene === "flow") return { heading: fish.heading, speed: 0 };
    // Keep a forward course until neighbors, people or the boundary require a turn.
    let dx = Math.cos(fish.heading) * 0.10;
    let dy = Math.sin(fish.heading) * 0.10;
    const flock = computeFlockForces(fish, this.fish, this.flockSettings, {
      maxNeighbors: 6, separationRadius: 0.05 + fish.radius * 1.8,
    });
    dx += flock.separation.x * 1.5 + flock.alignment.x * 0.4 + flock.cohesion.x * 0.20;
    dy += flock.separation.y * 1.5 + flock.alignment.y * 0.4 + flock.cohesion.y * 0.20;
    let threat = 0;
    for (const person of sources) {
      if (!person.active || person.obstacleStrength <= 0) continue;
      const ox = fish.position.x - person.position.x, oy = fish.position.y - person.position.y;
      const distance = Math.hypot(ox, oy);
      const gap = distance - person.radius - fish.radius;
      const near = 1 - smoothstep(0, RESPONSE.influence, gap);
      const fast = smoothstep(RESPONSE.gentleSpeed, RESPONSE.fastSpeed, length(person.velocity));
      const close = 1 - smoothstep(0, 0.04, gap);
      threat = Math.max(threat, near * fast + close * 0.28);
      const away = normalize({ x: ox, y: oy });
      const avoidance = (near * near * (0.035 + fast * 0.45) + close * 0.15) * person.obstacleStrength;
      dx += away.x * avoidance; dy += away.y * avoidance;
      // Approach the outside of personal space without an artificial orbiting force.
      if (fish.id % 3 === 0 && fast < 0.1 && fish.alert < 0.15 && gap > 0.10 && gap < 0.22) {
        dx -= away.x * 0.015; dy -= away.y * 0.015;
      }
    }
    fish.alert = threat > fish.alert ? lerpAlert(fish.alert, threat, dt) : fish.alert * Math.exp(-dt / RESPONSE.alertDecay);
    const margin = 0.18;
    const aheadX = fish.position.x + Math.cos(fish.heading) * Math.max(0.025, fish.speed * 1.4);
    const aheadY = fish.position.y + Math.sin(fish.heading) * Math.max(0.025, fish.speed * 1.4);
    dx += Math.pow(Math.max(0, margin - aheadX) / margin, 2) * 0.6;
    dx -= Math.pow(Math.max(0, aheadX - (1 - margin)) / margin, 2) * 0.6;
    dy += Math.pow(Math.max(0, margin - aheadY) / margin, 2) * 0.6;
    dy -= Math.pow(Math.max(0, aheadY - (1 - margin)) / margin, 2) * 0.6;
    const flow = this.flow.sample(fish.position);
    dx += flow.x * 0.20; dy += flow.y * 0.20;
    const heading = Math.atan2(dy, dx);
    const cycle = (this.time + fish.phase * 4) % (14 + fish.id % 4);
    const resting = smoothstep(9, 10, cycle) * (1 - smoothstep(12, 14, cycle));
    const cruise = (0.036 + 0.026 * (0.5 + 0.5 * Math.sin(this.time * 0.6 + fish.phase))) * (1 - resting * 0.45);
    const turnSlowdown = 1 - clamp(Math.abs(angleDifference(fish.heading, heading)) / Math.PI, 0, 1) * 0.25;
    return { heading, speed: (cruise + fish.alert * 0.105) * turnSlowdown };
  }

  private resolvePeople(fish: ExhibitionFish, sources: readonly InteractionSource[]): void {
    for (let pass = 0; pass < 2; pass += 1) {
      for (const p of sources) {
        if (!p.active || p.obstacleStrength <= 0) continue;
        for (let j = 0; j < fish.body.jointCount; j += 2) {
          const joint = fish.body.joint(j);
          const offset = { x: joint.x - p.position.x, y: joint.y - p.position.y };
          const distance = length(offset), minimum = p.radius + fish.body.widthAt(j) + 0.004;
          if (distance >= minimum) continue;
          const away = normalize(offset, { x: Math.cos(fish.heading), y: Math.sin(fish.heading) });
          fish.translate(away.x * (minimum - distance), away.y * (minimum - distance));
        }
      }
    }
    fish.contain();
  }
}

function lerpAlert(current: number, target: number, dt: number): number {
  return clamp(current + (target - current) * (1 - Math.exp(-dt * 9)), 0, 1);
}
