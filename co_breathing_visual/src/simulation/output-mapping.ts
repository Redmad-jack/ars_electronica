import { clamp, length, normalize, subtract, type Vec2 } from "../core/math";
import type { SimulationAgentState, SimulationSnapshot } from "./world";

export interface PumpTargets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface AtomizerPreview {
  active: boolean;
  encounter: boolean;
  armed: boolean;
  cooldownRemaining: number;
}

export interface InstallationOutputState {
  pumps: PumpTargets;
  activity: number;
  coherence: number;
  mode: "idle" | "school" | "dispersed" | "startle";
  atomizer: AtomizerPreview;
}

const ZERO_PUMPS: PumpTargets = { left: 0, right: 0, top: 0, bottom: 0 };
const FISH_RADIUS = 0.025;

/** Maps the normalized simulation snapshot to a hardware-shaped visual preview. */
export class InstallationOutputMapper {
  private pumps: PumpTargets = { ...ZERO_PUMPS };
  private previousVelocity: Vec2 = { x: 0, y: 0 };
  private hasPreviousVelocity = false;
  private heldDirection: Vec2 = { x: 1, y: 0 };
  private directionHoldRemaining = 0;
  private encounter = false;
  private encounterDuration = 0;
  private mistRemaining = 0;
  private cooldownRemaining = 0;
  private armed = true;

  reset(): void {
    this.pumps = { ...ZERO_PUMPS };
    this.previousVelocity = { x: 0, y: 0 };
    this.hasPreviousVelocity = false;
    this.heldDirection = { x: 1, y: 0 };
    this.directionHoldRemaining = 0;
    this.encounter = false;
    this.encounterDuration = 0;
    this.mistRemaining = 0;
    this.cooldownRemaining = 0;
    this.armed = true;
  }

  update(snapshot: SimulationSnapshot, deltaSeconds: number): InstallationOutputState {
    const delta = clamp(deltaSeconds, 0, 0.1);
    const motion = this.fishMotion(snapshot.fish, delta);
    const targets = this.pumpTargets(motion.direction, motion.intensity);
    const smoothing = 1 - Math.exp(-delta / 0.45);
    this.pumps = {
      left: this.smooth(this.pumps.left, targets.left, smoothing),
      right: this.smooth(this.pumps.right, targets.right, smoothing),
      top: this.smooth(this.pumps.top, targets.top, smoothing),
      bottom: this.smooth(this.pumps.bottom, targets.bottom, smoothing),
    };

    const atomizer = this.updateAtomizer(snapshot, delta);
    let mode: InstallationOutputState["mode"] = "school";
    if (motion.intensity < 0.05) {
      mode = "idle";
    } else if (motion.startle) {
      mode = "startle";
    } else if (motion.coherence < 0.35) {
      mode = "dispersed";
    }

    return {
      pumps: { ...this.pumps },
      activity: motion.activity,
      coherence: motion.coherence,
      mode,
      atomizer,
    };
  }

  private fishMotion(
    fish: readonly SimulationAgentState[],
    deltaSeconds: number,
  ): { direction: Vec2; intensity: number; activity: number; coherence: number; startle: boolean } {
    if (fish.length === 0) {
      this.previousVelocity = { x: 0, y: 0 };
      this.hasPreviousVelocity = false;
      return { direction: this.heldDirection, intensity: 0, activity: 0, coherence: 0, startle: false };
    }

    let weightedVelocity = { x: 0, y: 0 };
    let averageVelocity = { x: 0, y: 0 };
    let directionSum = { x: 0, y: 0 };
    let activity = 0;
    let mostActive = fish[0];

    for (const agent of fish) {
      const speed = length(agent.velocity);
      const weight = 0.15 + agent.activity * 0.85;
      weightedVelocity.x += agent.velocity.x * weight;
      weightedVelocity.y += agent.velocity.y * weight;
      averageVelocity.x += agent.velocity.x;
      averageVelocity.y += agent.velocity.y;
      activity += agent.activity;
      if (speed > 0.002) {
        const unit = normalize(agent.velocity);
        directionSum.x += unit.x;
        directionSum.y += unit.y;
      }
      if (agent.activity > mostActive.activity) {
        mostActive = agent;
      }
    }

    averageVelocity.x /= fish.length;
    averageVelocity.y /= fish.length;
    activity = clamp(activity / fish.length, 0, 1);
    const coherence = clamp(length(directionSum) / fish.length, 0, 1);
    const speedRatio = clamp(length(averageVelocity) / 0.165, 0, 1);
    const acceleration = this.hasPreviousVelocity && deltaSeconds > 0
      ? length(subtract(averageVelocity, this.previousVelocity)) / deltaSeconds
      : 0;
    const startle = acceleration > 0.24 && activity > 0.45;
    this.previousVelocity = averageVelocity;
    this.hasPreviousVelocity = true;

    this.directionHoldRemaining = Math.max(this.directionHoldRemaining - deltaSeconds, 0);
    let direction = normalize(weightedVelocity, this.heldDirection);
    if (coherence < 0.35 && activity > 0.12) {
      if (this.directionHoldRemaining <= 0) {
        direction = normalize(mostActive.velocity, this.heldDirection);
        this.heldDirection = direction;
        this.directionHoldRemaining = 1;
      } else {
        direction = this.heldDirection;
      }
    } else if (length(weightedVelocity) > 0.002) {
      this.heldDirection = direction;
    }

    const intensity = clamp((activity * 0.68 + speedRatio * 0.32) * (0.55 + coherence * 0.45), 0, 1);
    return { direction, intensity, activity, coherence, startle };
  }

  private pumpTargets(direction: Vec2, intensity: number): PumpTargets {
    const applyDeadband = (value: number): number => value < 0.05 ? 0 : clamp(value, 0, 1);
    return {
      left: applyDeadband(Math.max(direction.x, 0) * intensity),
      right: applyDeadband(Math.max(-direction.x, 0) * intensity),
      top: applyDeadband(Math.max(direction.y, 0) * intensity),
      bottom: applyDeadband(Math.max(-direction.y, 0) * intensity),
    };
  }

  private updateAtomizer(snapshot: SimulationSnapshot, deltaSeconds: number): AtomizerPreview {
    this.mistRemaining = Math.max(this.mistRemaining - deltaSeconds, 0);
    this.cooldownRemaining = Math.max(this.cooldownRemaining - deltaSeconds, 0);

    let minimumGap = Number.POSITIVE_INFINITY;
    for (const fish of snapshot.fish) {
      for (const person of snapshot.people) {
        const gap = length(subtract(fish.position, person.position)) - person.radius - FISH_RADIUS;
        minimumGap = Math.min(minimumGap, gap);
      }
    }

    const threshold = this.encounter ? 0.105 : 0.065;
    this.encounter = minimumGap <= threshold;
    this.encounterDuration = this.encounter ? this.encounterDuration + deltaSeconds : 0;

    if (!this.encounter && this.cooldownRemaining <= 0) {
      this.armed = true;
    }
    if (this.armed && this.encounterDuration >= 0.2) {
      this.mistRemaining = 0.8;
      this.cooldownRemaining = 10;
      this.armed = false;
      this.encounterDuration = 0;
    }

    return {
      active: this.mistRemaining > 0,
      encounter: this.encounter,
      armed: this.armed,
      cooldownRemaining: this.cooldownRemaining,
    };
  }

  private smooth(current: number, target: number, amount: number): number {
    return clamp(current + (target - current) * amount, 0, 1);
  }
}
