import {
  clamp,
  length,
  type Vec2,
} from "../core/math";
import { SeededRandom } from "../core/random";
import type { InteractionSource, SimulationSettings } from "../core/types";

export interface CrowdPerson extends InteractionSource {
  activity: number;
}

interface InternalPerson extends CrowdPerson {
  phase: number;
  pathStart: Vec2;
  pathEnd: Vec2;
  previousPosition: Vec2;
  wasActive: boolean;
}

/** Deterministic, low-cost crowd used only when a live audience source is unavailable. */
export class ProceduralCrowd {
  private people: InternalPerson[] = [];

  constructor(private readonly settings: SimulationSettings) {
    this.reset();
  }

  get agents(): readonly CrowdPerson[] {
    return this.people;
  }

  reset(): void {
    const random = new SeededRandom(this.settings.seed ^ 0x43524f57);
    const count = clamp(Math.round(this.settings.crowdCount), 0, 3);
    this.people = Array.from({ length: count }, (_, index) => {
      const horizontal = index % 2 === 0;
      const reverse = random.next() > 0.5;
      const lane = random.range(0.2, 0.8);
      const pathStart = horizontal
        ? { x: reverse ? 0.9 : 0.1, y: lane }
        : { x: lane, y: reverse ? 0.9 : 0.1 };
      const pathEnd = horizontal
        ? { x: reverse ? 0.1 : 0.9, y: clamp(lane + random.range(-0.18, 0.18), 0.18, 0.82) }
        : { x: clamp(lane + random.range(-0.18, 0.18), 0.18, 0.82), y: reverse ? 0.1 : 0.9 };
      return {
        id: `person-${index + 1}`,
        position: { ...pathStart },
        velocity: { x: 0, y: 0 },
        radius: this.settings.crowdRadius,
        obstacleStrength: 1,
        flowStrength: 0,
        active: true,
        activity: 0,
        phase: random.range(0, Math.PI * 2),
        pathStart,
        pathEnd,
        previousPosition: { ...pathStart },
        wasActive: false,
      };
    });
    this.update(0, 0);
  }

  step(deltaSeconds: number, time: number): void {
    this.update(time, deltaSeconds);
  }

  private update(time: number, deltaSeconds: number): void {
    const requestedSpeed = Math.max(this.settings.crowdSpeed, 0.005);
    const activeDuration = clamp(0.8 / requestedSpeed, 12, 36);
    const cycleDuration = activeDuration + 30;

    for (let index = 0; index < this.people.length; index += 1) {
      const person = this.people[index];
      const localTime = (time + index * activeDuration * 0.45) % cycleDuration;
      person.active = this.settings.crowdSpeed > 1e-6 && localTime < activeDuration;
      person.radius = this.settings.crowdRadius;
      person.obstacleStrength = this.settings.interactionMode === "flow" ? 0 : 1;
      person.flowStrength = this.settings.interactionMode === "obstacle"
        ? 0
        : this.settings.flowInjection;
      if (!person.active) {
        person.velocity = { x: 0, y: 0 };
        person.activity = 0;
        person.wasActive = false;
        continue;
      }

      const progress = clamp(localTime / activeDuration, 0, 1);
      const curve = Math.sin(progress * Math.PI) * Math.sin(person.phase) * 0.08;
      const direction = {
        x: person.pathEnd.x - person.pathStart.x,
        y: person.pathEnd.y - person.pathStart.y,
      };
      const directionLength = Math.max(length(direction), 1e-6);
      const position = {
        x: clamp(
          person.pathStart.x + direction.x * progress - direction.y / directionLength * curve,
          0.05,
          0.95,
        ),
        y: clamp(
          person.pathStart.y + direction.y * progress + direction.x / directionLength * curve,
          0.05,
          0.95,
        ),
      };
      person.velocity = person.wasActive && deltaSeconds > 0
        ? {
            x: (position.x - person.previousPosition.x) / deltaSeconds,
            y: (position.y - person.previousPosition.y) / deltaSeconds,
          }
        : { x: 0, y: 0 };
      person.position = position;
      person.previousPosition = { ...position };
      person.activity = clamp(length(person.velocity) / requestedSpeed, 0, 1);
      person.wasActive = true;
    }
  }
}
