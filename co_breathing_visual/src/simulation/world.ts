import {
  add,
  clamp,
  clampMagnitude,
  dot,
  isFiniteVec,
  length,
  lerp,
  normalize,
  scale,
  subtract,
  type Vec2,
} from "../core/math";
import { SeededRandom } from "../core/random";
import type { InteractionSource, SimulationSettings } from "../core/types";
import { computeFlockForces, steeringToward } from "./boids";
import { ProceduralCrowd, type CrowdPerson } from "./crowd";
import { FishAgent } from "./fish-agent";
import { BehaviorFlowField } from "./flow-field";
import { CircleObstacleField } from "./obstacle-field";

export class SimulationWorld {
  readonly flowField: BehaviorFlowField;
  readonly obstacleField = new CircleObstacleField();
  readonly crowd: ProceduralCrowd;

  private fish: FishAgent[] = [];
  private externalAudience: CrowdPerson[] | null = null;
  private readonly worldWidth = 1;

  constructor(readonly settings: SimulationSettings, _aspectRatio: number) {
    this.flowField = new BehaviorFlowField(64, 36, settings.flowDecay);
    this.crowd = new ProceduralCrowd(settings);
    this.reset();
  }

  get width(): number {
    return this.worldWidth;
  }

  get agents(): readonly FishAgent[] {
    return this.fish;
  }

  get people(): readonly CrowdPerson[] {
    return this.externalAudience ?? this.crowd.agents;
  }

  setExternalAudience(people: readonly CrowdPerson[] | null): void {
    this.externalAudience = people === null
      ? null
      : people.map((person) => ({
          ...person,
          position: { ...person.position },
          velocity: { ...person.velocity },
        }));
  }

  reset(): void {
    this.flowField.reset();
    this.crowd.reset();
    this.fish = [];
    const random = new SeededRandom(this.settings.seed);
    const count = clamp(Math.round(this.settings.fishCount), 3, 5);
    const columns = Math.ceil(Math.sqrt(count * this.worldWidth));
    const rows = Math.ceil(count / columns);

    for (let index = 0; index < count; index += 1) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const normalizedX = (column + 0.5 + random.range(-0.18, 0.18)) / columns;
      const normalizedY = (row + 0.5 + random.range(-0.18, 0.18)) / rows;
      const heading = random.range(0, Math.PI * 2);
      const speed = random.range(this.settings.minSpeed * 1.05, this.settings.maxSpeed * 0.72);
      this.fish.push(
        new FishAgent(
          index,
          {
            x: Math.min(Math.max(normalizedX, 0.1), 0.9) * this.worldWidth,
            y: Math.min(Math.max(normalizedY, 0.12), 0.88),
          },
          { x: Math.cos(heading) * speed, y: Math.sin(heading) * speed },
          random.range(0, Math.PI * 2),
        ),
      );
    }
  }

  resize(_aspectRatio: number): void {
    // The simulation plane is intentionally fixed at 1:1.
  }

  step(
    deltaSeconds: number,
    time: number,
    source: InteractionSource,
    flowSamples: readonly InteractionSource[] = [],
  ): void {
    if (this.externalAudience === null) {
      this.crowd.step(deltaSeconds, time);
    }
    const activePeople = this.people.filter((person) => person.active);
    const obstacles = source.active ? [...activePeople, source] : [...activePeople];
    this.flowField.setDecay(this.settings.flowDecay);
    const flowSources: InteractionSource[] = [...activePeople];
    if (flowSamples.length > 0) {
      flowSources.push(...flowSamples);
    } else if (source.active) {
      flowSources.push(source);
    }
    const sourceScale = 1 / Math.sqrt(Math.max(flowSources.length, 1));
    for (const flowSource of flowSources) {
      this.flowField.inject({
        ...flowSource,
        flowStrength: flowSource.flowStrength * sourceScale,
      });
    }
    this.flowField.step(deltaSeconds);

    const influences = this.fish.map((fish) => this.forceFor(fish, time, obstacles));
    for (let index = 0; index < this.fish.length; index += 1) {
      this.fish[index].integrate(
        influences[index].force,
        this.settings,
        deltaSeconds,
        time,
        influences[index].threat,
      );
      this.resolveObstaclePenetration(this.fish[index], obstacles);
      this.keepFiniteAndNearBounds(this.fish[index]);
    }
  }

  snapshot(simulationTime: number): SimulationSnapshot {
    return {
      simulationTime,
      fish: this.fish.map((fish) => ({
        id: `fish-${fish.id}`,
        position: {
          x: clamp(fish.position.x / this.worldWidth, 0, 1),
          y: clamp(fish.position.y, 0, 1),
        },
        velocity: { x: fish.velocity.x / this.worldWidth, y: fish.velocity.y },
        activity: fish.activity,
      })),
      people: this.people.filter((person) => person.active).map((person) => ({
        id: person.id,
        position: { ...person.position },
        velocity: { ...person.velocity },
        activity: person.activity,
        radius: person.radius,
      })),
    };
  }

  normalizedFlowVectors(): Array<{ position: Vec2; velocity: Vec2 }> {
    return this.flowField.debugVectors();
  }

  private forceFor(
    fish: FishAgent,
    time: number,
    obstacles: readonly InteractionSource[],
  ): { force: Vec2; threat: number } {
    const flock = computeFlockForces(fish, this.fish, this.settings);
    let force = { x: 0, y: 0 };
    force = add(force, scale(flock.separation, this.settings.separationWeight));
    force = add(force, scale(flock.alignment, this.settings.alignmentWeight));
    force = add(force, scale(flock.cohesion, this.settings.cohesionWeight));

    const activity = fish.locomotionActivity(time);
    const wanderAngle =
      fish.heading +
      Math.sin(time * 0.73 + fish.phase) * 0.3 +
      Math.sin(time * 0.29 + fish.id * 1.73) * 0.16 +
      fish.spontaneousTurn(time);
    const wanderDirection = { x: Math.cos(wanderAngle), y: Math.sin(wanderAngle) };
    const wanderSpeed = lerp(this.settings.minSpeed, this.settings.maxSpeed, 0.25 + activity * 0.75);
    const wander = steeringToward(wanderDirection, fish.velocity, wanderSpeed);
    force = add(force, scale(wander, this.settings.wanderWeight));

    const boundary = this.boundaryForce(fish.position);
    force = add(force, scale(boundary, this.settings.boundaryWeight * this.settings.maxForce));

    let threat = 0;
    for (const source of obstacles) {
      const sample = this.obstacleField.sample(fish.position, source, this.worldWidth);
      const proximity = clamp((0.15 - sample.distance) / 0.15, 0, 1);
      const response = fish.threatResponse(time, proximity);
      threat = Math.max(threat, clamp(response * proximity, 0, 1));
      const obstacle = this.obstacleField.avoidanceForce(
        fish.position,
        fish.velocity,
        source,
        this.worldWidth,
        0.72,
        0.075,
      );
      force = add(
        force,
        scale(obstacle, this.settings.obstacleWeight * this.settings.maxForce * response),
      );
    }

    const normalizedPosition = { x: fish.position.x / this.worldWidth, y: fish.position.y };
    const normalizedFlow = this.flowField.sample(normalizedPosition);
    const worldFlow = { x: normalizedFlow.x * this.worldWidth, y: normalizedFlow.y };
    const flowSteering = steeringToward(worldFlow, fish.velocity, this.settings.maxSpeed);
    force = add(force, scale(flowSteering, this.settings.flowWeight));

    return { force: clampMagnitude(force, this.settings.maxForce), threat };
  }

  private resolveObstaclePenetration(
    fish: FishAgent,
    obstacles: readonly InteractionSource[],
  ): void {
    for (const source of obstacles) {
      if (!source.active || source.obstacleStrength <= 0) {
        continue;
      }
      const center = { x: source.position.x * this.worldWidth, y: source.position.y };
      const offset = subtract(fish.position, center);
      const distance = length(offset);
      const minimumDistance = source.radius + 0.012;
      if (distance >= minimumDistance) {
        continue;
      }
      const normal = normalize(offset, normalize(scale(fish.velocity, -1)));
      fish.position = add(center, scale(normal, minimumDistance));
      const inwardSpeed = dot(fish.velocity, normal);
      if (inwardSpeed < 0) {
        fish.velocity = subtract(fish.velocity, scale(normal, inwardSpeed));
      }
    }
  }

  private boundaryForce(position: Vec2): Vec2 {
    const margin = 0.125;
    const force = { x: 0, y: 0 };
    if (position.x < margin) {
      force.x += Math.pow((margin - position.x) / margin, 2);
    }
    if (position.x > this.worldWidth - margin) {
      force.x -= Math.pow((position.x - (this.worldWidth - margin)) / margin, 2);
    }
    if (position.y < margin) {
      force.y += Math.pow((margin - position.y) / margin, 2);
    }
    if (position.y > 1 - margin) {
      force.y -= Math.pow((position.y - (1 - margin)) / margin, 2);
    }
    return force;
  }

  private keepFiniteAndNearBounds(fish: FishAgent): void {
    if (!isFiniteVec(fish.position) || !isFiniteVec(fish.velocity) || !fish.body.isFinite()) {
      this.reset();
      return;
    }

    const margin = 0.125;
    if (fish.position.x < margin) {
      fish.position.x = margin;
      fish.velocity.x = Math.abs(fish.velocity.x);
    } else if (fish.position.x > this.worldWidth - margin) {
      fish.position.x = this.worldWidth - margin;
      fish.velocity.x = -Math.abs(fish.velocity.x);
    }
    if (fish.position.y < margin) {
      fish.position.y = margin;
      fish.velocity.y = Math.abs(fish.velocity.y);
    } else if (fish.position.y > 1 - margin) {
      fish.position.y = 1 - margin;
      fish.velocity.y = -Math.abs(fish.velocity.y);
    }
  }
}

export interface SimulationAgentState {
  id: string;
  position: Vec2;
  velocity: Vec2;
  activity: number;
}

export interface SimulationPersonState extends SimulationAgentState {
  radius: number;
}

export interface SimulationSnapshot {
  simulationTime: number;
  fish: SimulationAgentState[];
  people: SimulationPersonState[];
}
