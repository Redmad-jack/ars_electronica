import {
  angleDifference,
  clamp,
  clampMagnitude,
  lerp,
  length,
  normalize,
  smoothstep,
  type Vec2,
} from "../core/math";
import type { SimulationSettings } from "../core/types";
import { FishBody } from "./fish-body";

export class FishAgent {
  readonly body: FishBody;

  position: Vec2;
  velocity: Vec2;
  heading: number;
  readonly phase: number;
  turnRate = 0;
  activity = 0;

  private angularVelocity = 0;
  private tailPhase: number;

  constructor(
    readonly id: number,
    position: Vec2,
    velocity: Vec2,
    phase: number,
  ) {
    this.position = { ...position };
    this.velocity = { ...velocity };
    this.heading = Math.atan2(velocity.y, velocity.x);
    this.phase = phase;
    this.tailPhase = phase;
    this.body = new FishBody(position, this.heading, phase);
  }

  locomotionActivity(time: number): number {
    const cycleDuration = 8.5 + (this.id % 3) * 1.75 + (this.phase / (Math.PI * 2)) * 2;
    const cyclePosition = ((time + this.phase * 1.9) % cycleDuration) / cycleDuration;
    const restStart = 0.62 + (this.id % 2) * 0.08;
    const restEnd = Math.min(restStart + 0.2, 0.94);
    if (cyclePosition >= restStart && cyclePosition <= restEnd) {
      return 0;
    }
    const primary = 0.5 + 0.5 * Math.sin(time * (1.03 + this.id * 0.013) + this.phase);
    const secondary = 0.5 + 0.5 * Math.sin(time * (2.17 + this.id * 0.009) + this.phase * 1.71);
    const burstSignal = primary * 0.7 + secondary * 0.3;
    return 0.14 + smoothstep(0.32, 0.86, burstSignal) * 0.86;
  }

  threatResponse(time: number, proximity: number): number {
    const temperament = 0.5 + 0.5 * Math.sin(this.phase * 2.73 + this.id * 1.17);
    const alertness = 0.5 + 0.5 * Math.sin(time * 0.61 + this.phase * 1.43);
    const responseThreshold = 0.18 + temperament * 0.34;
    const engaged = smoothstep(responseThreshold, 1, proximity);
    const startle = alertness > 0.72 ? smoothstep(0.48, 1, proximity) * 0.95 : 0;
    return clamp(engaged * (0.42 + temperament * 0.7) + startle, 0, 1.8);
  }

  spontaneousTurn(time: number): number {
    const activity = this.locomotionActivity(time);
    const turnSide = Math.sin(time * (0.37 + this.id * 0.004) + this.phase * 2.31);
    const irregularity = Math.sin(time * 1.29 + this.phase * 0.63 + this.id * 0.91);
    return (turnSide * 0.72 + irregularity * 0.28) * activity * 0.95;
  }

  integrate(
    force: Vec2,
    settings: SimulationSettings,
    deltaSeconds: number,
    time: number,
    threat = 0,
  ): void {
    const limitedForce = clampMagnitude(force, settings.maxForce);
    const steeredVelocity = {
      x: this.velocity.x + limitedForce.x * deltaSeconds,
      y: this.velocity.y + limitedForce.y * deltaSeconds,
    };
    const currentSpeed = clamp(length(this.velocity), 0, settings.maxSpeed);
    const forceSpeed = clamp(length(steeredVelocity), 0, settings.maxSpeed);

    const desiredDirection = normalize(steeredVelocity, {
      x: Math.cos(this.heading),
      y: Math.sin(this.heading),
    });
    const desiredHeading = Math.atan2(desiredDirection.y, desiredDirection.x);
    const headingError = angleDifference(this.heading, desiredHeading);

    const gaitActivity = this.locomotionActivity(time);
    const turnDemand = clamp(Math.abs(headingError) / 1.1, 0, 1);
    this.activity = clamp(Math.max(gaitActivity, threat) + turnDemand * 0.18, 0, 1);
    const gaitSpeed = this.activity < 0.03
      ? 0
      : lerp(settings.minSpeed, settings.maxSpeed, this.activity);
    const targetSpeed = lerp(gaitSpeed, forceSpeed, threat > 0.5 ? 0.42 : 0.16);
    const speedResponse = targetSpeed > currentSpeed
      ? 5.5 + this.activity * 5.5
      : this.activity < 0.03 ? 2.8 : 0.65 + this.activity * 0.75;
    let speed = lerp(currentSpeed, targetSpeed, 1 - Math.exp(-speedResponse * deltaSeconds));
    if (!Number.isFinite(speed)) {
      speed = 0;
    } else if (speed < 0.001) {
      speed = 0;
    }

    const targetAngularVelocity = clamp(
      headingError * (3.4 + this.activity * 3.2),
      -settings.maxTurnRate,
      settings.maxTurnRate,
    );
    const maximumAngularAcceleration = (10 + this.activity * 28) * deltaSeconds;
    this.angularVelocity += clamp(
      targetAngularVelocity - this.angularVelocity,
      -maximumAngularAcceleration,
      maximumAngularAcceleration,
    );
    this.angularVelocity = clamp(this.angularVelocity, -settings.maxTurnRate, settings.maxTurnRate);
    this.heading += this.angularVelocity * deltaSeconds;
    this.heading = Math.atan2(Math.sin(this.heading), Math.cos(this.heading));
    this.turnRate = this.angularVelocity;
    this.velocity = {
      x: Math.cos(this.heading) * speed,
      y: Math.sin(this.heading) * speed,
    };
    this.position.x += this.velocity.x * deltaSeconds;
    this.position.y += this.velocity.y * deltaSeconds;

    const speedRatio = clamp(
      (speed - settings.minSpeed) / Math.max(settings.maxSpeed - settings.minSpeed, 1e-6),
      0,
      1,
    );
    const tailDrive = clamp(this.activity * 0.72 + speedRatio * 0.28, 0, 1);
    this.tailPhase += lerp(4.2, 13.8, tailDrive) * deltaSeconds;
    const waveScale = 0.16 + tailDrive * 0.84;
    this.body.update(
      this.position,
      this.heading,
      this.turnRate,
      this.tailPhase,
      deltaSeconds,
      settings.bodyWaveAmplitude * waveScale,
      settings.bodyStiffness,
    );
  }

  scaleX(factor: number): void {
    this.position.x *= factor;
    this.velocity.x *= factor;
    this.body.scaleX(factor);
  }
}
