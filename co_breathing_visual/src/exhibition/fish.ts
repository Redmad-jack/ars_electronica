import { angleDifference, clamp, lerp, normalize, type Vec2 } from "../core/math";
import { ExhibitionBody } from "./body";
import { PRESETS, type FishPreset, type Species } from "./config";

export interface FinRay {
  points: Float32Array;
  renderedPrevious: Float32Array;
  side: number;
  fraction: number;
  tail: boolean;
  angles: Float64Array;
  angularVelocity: Float64Array;
  segmentLength: number;
}

export const FIN_POINTS = 9;

export class ExhibitionFish {
  readonly body: ExhibitionBody;
  readonly preset: FishPreset;
  readonly rays: FinRay[] = [];
  readonly previousJoints: Float32Array;
  readonly finGroups: FinRay[][] = [];
  velocity: Vec2 = { x: 0, y: 0 };
  swimVelocity: Vec2 = { x: 0, y: 0 };
  heading: number;
  turnRate = 0;
  speed = 0.045;
  activity = 0;
  alert = 0;
  tailPhase: number;
  previousPhase: number;
  private drive = 0;
  previousTail: Vec2;
  tailVelocity: Vec2 = { x: 0, y: 0 };

  constructor(
    readonly id: number, readonly species: Species, public position: Vec2,
    heading: number, readonly phase: number, readonly size: number,
  ) {
    this.heading = heading;
    this.tailPhase = phase;
    this.previousPhase = phase;
    this.preset = PRESETS[species];
    this.body = new ExhibitionBody(position, heading, this.preset, size);
    this.previousJoints = new Float32Array(this.body.jointCount * 2);
    this.previousTail = this.body.joint(this.body.jointCount - 1);
    for (const side of [-1, 1, 0]) {
      const group: FinRay[] = [];
      const count = side === 0 ? 22 : this.preset.finRays;
      for (let i = 0; i < count; i += 1) {
        const ray: FinRay = {
          side, fraction: i / (count - 1), tail: side === 0,
          points: new Float32Array(FIN_POINTS * 2),
          renderedPrevious: new Float32Array(FIN_POINTS * 2), angles: new Float64Array(FIN_POINTS),
          angularVelocity: new Float64Array(FIN_POINTS), segmentLength: 0,
        };
        this.rays.push(ray);
        group.push(ray);
      }
      this.finGroups.push(group);
    }
    this.updateFins(0, { x: 0, y: 0 }, 1 / 60, true);
    this.capturePrevious();
  }

  get radius(): number { return this.preset.width * this.size; }

  capturePrevious(): void {
    this.previousPhase = this.tailPhase;
    for (let i = 0; i < this.body.jointCount; i += 1) {
      const p = this.body.joint(i);
      this.previousJoints[i * 2] = p.x;
      this.previousJoints[i * 2 + 1] = p.y;
    }
    for (const ray of this.rays) ray.renderedPrevious.set(ray.points);
  }

  advance(dt: number, desiredHeading: number, targetSpeed: number, flow: Vec2, time: number, anchored = false): void {
    this.capturePrevious();
    const response = targetSpeed > this.speed ? 3.5 : this.species === "ribbon" ? 0.9 : 1.3;
    this.speed = lerp(this.speed, clamp(targetSpeed, 0, 0.17), 1 - Math.exp(-dt * response));
    const error = angleDifference(this.heading, desiredHeading);
    // Turning requires forward travel: slowing down must not become a pivot in place.
    const minimumRadius = (this.preset.length + this.preset.tailLength) * this.size * 0.8;
    const maxTurn = Math.min(this.preset.turnRate * (1 + this.alert * 0.65), this.speed / minimumRadius);
    const angularTarget = clamp(error * 3.5, -maxTurn, maxTurn);
    this.turnRate = clamp(lerp(this.turnRate, angularTarget, 1 - Math.exp(-dt * 6)), -maxTurn, maxTurn);
    this.heading += this.turnRate * dt;
    this.heading = Math.atan2(Math.sin(this.heading), Math.cos(this.heading));
    this.swimVelocity = { x: Math.cos(this.heading) * this.speed, y: Math.sin(this.heading) * this.speed };
    this.velocity = { x: this.swimVelocity.x + flow.x * 0.55, y: this.swimVelocity.y + flow.y * 0.55 };
    if (!anchored) {
      this.position.x += this.velocity.x * dt;
      this.position.y += this.velocity.y * dt;
    }
    // Tail drive is based on propulsion, never on passive water transport.
    this.activity = clamp(this.speed / 0.14, 0, 1);
    this.drive = lerp(this.drive, this.activity, 1 - Math.exp(-dt * 3));
    this.tailPhase += lerp(1.7, 10.5, this.drive) * dt;
    this.body.update(this.position, this.heading, this.turnRate, this.tailPhase, dt,
      this.preset.wave * (0.08 + this.drive * 0.92));
    this.updateFins(time, flow, dt);
    this.contain();
    const tail = this.body.joint(this.body.jointCount - 1);
    this.tailVelocity = {
      x: clamp((tail.x - this.previousTail.x) / dt, -0.4, 0.4),
      y: clamp((tail.y - this.previousTail.y) / dt, -0.4, 0.4),
    };
    this.previousTail = tail;
  }

  translate(dx: number, dy: number): void {
    this.position.x += dx;
    this.position.y += dy;
    this.body.translate(dx, dy);
    this.previousTail.x += dx;
    this.previousTail.y += dy;
    for (let i = 0; i < this.previousJoints.length; i += 2) {
      this.previousJoints[i] += dx;
      this.previousJoints[i + 1] += dy;
    }
    for (const ray of this.rays) {
      for (const points of [ray.points, ray.renderedPrevious]) {
        for (let i = 0; i < points.length; i += 2) {
          points[i] += dx;
          points[i + 1] += dy;
        }
      }
    }
  }

  contain(): void {
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    const include = (x: number, y: number, radius = 0): void => {
      minX = Math.min(minX, x - radius); maxX = Math.max(maxX, x + radius);
      minY = Math.min(minY, y - radius); maxY = Math.max(maxY, y + radius);
    };
    for (let i = 0; i < this.body.jointCount; i += 1) {
      const p = this.body.joint(i);
      include(p.x, p.y, this.body.widthAt(i));
    }
    // Reserve the bounded GPU micro-ripple and interpolated curve overshoot as well.
    for (const ray of this.rays) for (let i = 0; i < ray.points.length; i += 2) include(ray.points[i], ray.points[i + 1], 0.0015 * this.size);
    const dx = minX < 0.008 ? 0.008 - minX : maxX > 0.992 ? 0.992 - maxX : 0;
    const dy = minY < 0.008 ? 0.008 - minY : maxY > 0.992 ? 0.992 - maxY : 0;
    if (dx || dy) this.translate(dx, dy);
  }

  private updateFins(time: number, flow: Vec2, dt: number, initialize = false): void {
    for (const ray of this.rays) {
      const f = ray.fraction;
      const jointIndex = ray.tail ? this.body.jointCount - 1 :
        (this.species === "ribbon" ? 0.20 + f * 0.42 : 0.24 + f * 0.06) * (this.body.jointCount - 1);
      const first = this.body.joint(Math.floor(jointIndex));
      const second = this.body.joint(Math.ceil(jointIndex));
      const blend = jointIndex - Math.floor(jointIndex);
      const root = { x: lerp(first.x, second.x, blend), y: lerp(first.y, second.y, blend) };
      const ahead = this.body.joint(Math.max(0, Math.floor(jointIndex) - 1));
      const behind = this.body.joint(Math.min(this.body.jointCount - 1, Math.ceil(jointIndex) + 1));
      const forward = normalize({ x: ahead.x - behind.x, y: ahead.y - behind.y }, { x: Math.cos(this.heading), y: Math.sin(this.heading) });
      const nx = -forward.y, ny = forward.x;
      const rootWidth = ray.tail ? 0 : this.body.widthAt(jointIndex) * 0.78;
      const rx = root.x + nx * rootWidth * ray.side;
      const ry = root.y + ny * rootWidth * ray.side;
      const spread = Math.atan2(this.preset.tailSpread, this.preset.tailLength * 0.72);
      const finEnvelope = this.species === "fan" ? 0.85 + 0.15 * Math.sin(f * Math.PI) :
        0.55 + 0.45 * Math.sin(f * Math.PI);
      const rayLength = (ray.tail ? this.preset.tailLength * (1 + 0.16 * Math.sin(f * Math.PI)) :
        this.preset.finLength * finEnvelope) * this.size;
      const baseAngle = Math.atan2(-forward.y, -forward.x) -
        (ray.tail ? (f - 0.5) * 2 * spread : ray.side * (1.8 - f * 1.6));
      const beat = ray.tail ? this.tailPhase - 4.5 : this.tailPhase * 0.64 + ray.side * 0.65 - f * 0.35;
      const crossFlow = clamp((flow.x * nx + flow.y * ny) * 2, -0.25, 0.25);
      ray.segmentLength = rayLength / (FIN_POINTS - 1);
      ray.points[0] = rx; ray.points[1] = ry;
      for (let j = 1; j < FIN_POINTS; j += 1) {
        const k = j * 2, t = j / (FIN_POINTS - 1);
        const envelope = t * t;
        const sweep = Math.sin(beat - t * 2.7) * (ray.tail ? 0.18 + this.drive * 0.45 : 0.38 + this.drive * 0.20);
        const ripple = Math.sin(beat * 1.7 - t * 5.5 + f * 0.7 + time * 0.12) * 0.11 * envelope;
        const curl = (ray.tail ? (f - 0.5) * 0.22 : ray.side * 0.32) * t;
        const target = baseAngle + sweep * (0.2 + 0.8 * envelope) + ripple + curl - crossFlow * t;
        if (initialize) ray.angles[j] = target;
        else {
          // Damped angular springs keep ray lengths exact while the tips lag and recover.
          const omega = lerp(25, 12, t);
          const acceleration = omega * omega * angleDifference(ray.angles[j], target) - 1.65 * omega * ray.angularVelocity[j];
          ray.angularVelocity[j] += acceleration * dt;
          ray.angles[j] += ray.angularVelocity[j] * dt;
        }
        if (j > 1) ray.angles[j] = ray.angles[j - 1] + clamp(angleDifference(ray.angles[j - 1], ray.angles[j]), -0.42, 0.42);
        ray.points[k] = ray.points[k - 2] + Math.cos(ray.angles[j]) * ray.segmentLength;
        ray.points[k + 1] = ray.points[k - 1] + Math.sin(ray.angles[j]) * ray.segmentLength;
      }
    }
  }
}
