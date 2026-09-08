import {
  add,
  dot,
  length,
  normalize,
  scale,
  subtract,
  type Vec2,
} from "../core/math";
import type { SimulationSettings } from "../core/types";
import type { FishAgent } from "./fish-agent";

type FlockAgent = Pick<FishAgent, "position" | "velocity">;

export interface FlockForces {
  separation: Vec2;
  alignment: Vec2;
  cohesion: Vec2;
  neighborCount: number;
}

export function computeFlockForces(
  fish: FlockAgent,
  allFish: readonly FlockAgent[],
  settings: SimulationSettings,
  options?: { maxNeighbors: number; separationRadius: number },
): FlockForces {
  let separation = { x: 0, y: 0 };
  let alignment = { x: 0, y: 0 };
  let cohesion = { x: 0, y: 0 };
  let neighborCount = 0;
  let separationCount = 0;
  const forward = normalize(fish.velocity);
  const minimumFovDot = Math.cos((settings.fieldOfViewDegrees * Math.PI) / 360);

  const neighbors = options ? allFish.filter((neighbor) => {
    const offset = subtract(neighbor.position, fish.position);
    const distance = length(offset);
    return neighbor !== fish && distance > 1e-6 && distance <= settings.perceptionRadius &&
      dot(forward, scale(offset, 1 / distance)) >= minimumFovDot;
  }).sort((a, b) => length(subtract(a.position, fish.position)) - length(subtract(b.position, fish.position)))
    .slice(0, options.maxNeighbors) : allFish;

  for (const neighbor of neighbors) {
    if (neighbor === fish) {
      continue;
    }
    const toNeighbor = subtract(neighbor.position, fish.position);
    const distance = length(toNeighbor);
    if (distance <= 1e-6 || distance > settings.perceptionRadius) {
      continue;
    }
    if (dot(forward, scale(toNeighbor, 1 / distance)) < minimumFovDot) {
      continue;
    }

    alignment = add(alignment, neighbor.velocity);
    cohesion = add(cohesion, neighbor.position);
    neighborCount += 1;

    if (distance < (options?.separationRadius ?? settings.separationRadius)) {
      const away = scale(toNeighbor, -1 / Math.max(distance * distance, 1e-5));
      separation = add(separation, away);
      separationCount += 1;
    }
  }

  if (neighborCount > 0) {
    alignment = steeringToward(scale(alignment, 1 / neighborCount), fish.velocity, settings.maxSpeed);
    const localCenter = scale(cohesion, 1 / neighborCount);
    cohesion = steeringToward(subtract(localCenter, fish.position), fish.velocity, settings.maxSpeed);
  }

  if (separationCount > 0) {
    separation = steeringToward(scale(separation, 1 / separationCount), fish.velocity, settings.maxSpeed);
  }

  return { separation, alignment, cohesion, neighborCount };
}

export function steeringToward(direction: Vec2, currentVelocity: Vec2, desiredSpeed: number): Vec2 {
  if (length(direction) <= 1e-7) {
    return { x: 0, y: 0 };
  }
  return subtract(scale(normalize(direction), desiredSpeed), currentVelocity);
}
