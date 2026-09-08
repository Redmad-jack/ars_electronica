import type { Vec2 } from "./math";

export type InteractionMode = "obstacle" | "flow" | "both";

/** Input adapters emit normalized top-left-origin coordinates. */
export interface InteractionSource {
  id: string;
  position: Vec2;
  velocity: Vec2;
  radius: number;
  obstacleStrength: number;
  flowStrength: number;
  active: boolean;
}

export interface SimulationSettings {
  fishCount: number;
  crowdCount: number;
  seed: number;
  interactionMode: InteractionMode;
  mouseEnabled: boolean;
  perceptionRadius: number;
  separationRadius: number;
  fieldOfViewDegrees: number;
  separationWeight: number;
  alignmentWeight: number;
  cohesionWeight: number;
  wanderWeight: number;
  boundaryWeight: number;
  obstacleWeight: number;
  flowWeight: number;
  obstacleRadius: number;
  crowdRadius: number;
  crowdSpeed: number;
  flowInjection: number;
  flowDecay: number;
  bodyWaveAmplitude: number;
  bodyStiffness: number;
  maxSpeed: number;
  minSpeed: number;
  maxForce: number;
  maxTurnRate: number;
  showField: boolean;
}

export const DEFAULT_SETTINGS: SimulationSettings = {
  fishCount: 4,
  crowdCount: 3,
  seed: 20260714,
  interactionMode: "both",
  mouseEnabled: false,
  perceptionRadius: 0.27,
  separationRadius: 0.075,
  fieldOfViewDegrees: 280,
  separationWeight: 2.25,
  alignmentWeight: 0.95,
  cohesionWeight: 0.62,
  wanderWeight: 0.48,
  boundaryWeight: 2.4,
  obstacleWeight: 2.8,
  flowWeight: 1.65,
  obstacleRadius: 0.11,
  crowdRadius: 0.07,
  crowdSpeed: 0.035,
  flowInjection: 1.45,
  flowDecay: 1.25,
  bodyWaveAmplitude: 0.36,
  bodyStiffness: 0.2,
  maxSpeed: 0.165,
  minSpeed: 0.025,
  maxForce: 0.38,
  maxTurnRate: 4.2,
  showField: false,
};
