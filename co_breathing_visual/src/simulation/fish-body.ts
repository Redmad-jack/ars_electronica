import {
  angleDifference,
  clamp,
  isFiniteVec,
  lerp,
  type Vec2,
} from "../core/math";

export class FishBody {
  readonly jointCount: number;
  readonly segmentLength: number;

  private readonly positions: Float32Array;
  private readonly previousPositions: Float32Array;

  constructor(
    head: Vec2, heading: number, private readonly phase: number, jointCount = 14,
    private readonly profile?: { length: number; width: number; peak: number },
  ) {
    this.jointCount = jointCount;
    this.segmentLength = profile ? profile.length / (jointCount - 1) : 0.0074;
    this.positions = new Float32Array(jointCount * 2);
    this.previousPositions = new Float32Array(jointCount * 2);

    const backwardX = -Math.cos(heading);
    const backwardY = -Math.sin(heading);
    for (let index = 0; index < jointCount; index += 1) {
      const x = head.x + backwardX * this.segmentLength * index;
      const y = head.y + backwardY * this.segmentLength * index;
      this.setPosition(this.positions, index, x, y);
      this.setPosition(this.previousPositions, index, x, y);
    }
  }

  update(
    head: Vec2,
    heading: number,
    turnRate: number,
    wavePhase: number,
    deltaSeconds: number,
    waveAmplitude: number,
    stiffness: number,
  ): void {
    const damping = Math.pow(0.9, deltaSeconds * 60);

    for (let index = 0; index < this.jointCount; index += 1) {
      const offset = index * 2;
      const x = this.positions[offset];
      const y = this.positions[offset + 1];
      const velocityX = (x - this.previousPositions[offset]) * damping;
      const velocityY = (y - this.previousPositions[offset + 1]) * damping;
      this.previousPositions[offset] = x;
      this.previousPositions[offset + 1] = y;
      this.positions[offset] = x + velocityX;
      this.positions[offset + 1] = y + velocityY;
    }

    this.pinHead(head);

    for (let index = 1; index < this.jointCount; index += 1) {
      const fraction = index / (this.jointCount - 1);
      const waveEnvelope = Math.pow(fraction, 1.65);
      const wave = Math.sin(wavePhase + this.phase * 0.17 - fraction * 6.6) * waveAmplitude * waveEnvelope;
      const turnCurve = clamp(turnRate * 0.14, -0.38, 0.38) * fraction;
      const targetAngle = heading + Math.PI + wave + turnCurve;
      const parent = this.joint(index - 1);
      const targetX = parent.x + Math.cos(targetAngle) * this.segmentLength;
      const targetY = parent.y + Math.sin(targetAngle) * this.segmentLength;
      const offset = index * 2;
      const targetInfluence = lerp(stiffness * 1.2, stiffness * 0.6, fraction);
      this.positions[offset] = lerp(this.positions[offset], targetX, targetInfluence);
      this.positions[offset + 1] = lerp(this.positions[offset + 1], targetY, targetInfluence);
    }

    for (let iteration = 0; iteration < 4; iteration += 1) {
      this.pinHead(head);
      this.solveDistanceConstraints();
      this.solveAngleConstraints();
    }
    this.pinHead(head);
    this.solveDistanceConstraints();
    this.pinHead(head);
  }

  joint(index: number): Vec2 {
    const clampedIndex = clamp(Math.round(index), 0, this.jointCount - 1);
    const offset = clampedIndex * 2;
    return { x: this.positions[offset], y: this.positions[offset + 1] };
  }

  widthAt(index: number): number {
    const fraction = clamp(index / (this.jointCount - 1), 0, 1);
    if (this.profile) {
      const { width, peak } = this.profile;
      const t = fraction < peak ? fraction / peak : (fraction - peak) / (1 - peak);
      const eased = t * t * (3 - 2 * t);
      return fraction < peak ? lerp(width * 0.28, width, eased) : lerp(width, width * 0.045, eased);
    }
    if (fraction < 0.3) {
      const t = fraction / 0.3;
      return lerp(0.012, 0.023, t * t * (3 - 2 * t));
    }
    const t = (fraction - 0.3) / 0.7;
    return lerp(0.023, 0.0022, t * t * (3 - 2 * t));
  }

  segmentError(): number {
    let maxError = 0;
    for (let index = 1; index < this.jointCount; index += 1) {
      const current = this.joint(index);
      const parent = this.joint(index - 1);
      maxError = Math.max(maxError, Math.abs(Math.hypot(current.x - parent.x, current.y - parent.y) - this.segmentLength));
    }
    return maxError;
  }

  isFinite(): boolean {
    for (let index = 0; index < this.jointCount; index += 1) {
      if (!isFiniteVec(this.joint(index))) {
        return false;
      }
    }
    return true;
  }

  scaleX(factor: number): void {
    for (let index = 0; index < this.jointCount; index += 1) {
      const offset = index * 2;
      this.positions[offset] *= factor;
      this.previousPositions[offset] *= factor;
    }
  }

  translate(x: number, y: number): void {
    for (let index = 0; index < this.positions.length; index += 2) {
      this.positions[index] += x;
      this.positions[index + 1] += y;
      this.previousPositions[index] += x;
      this.previousPositions[index + 1] += y;
    }
  }

  private solveDistanceConstraints(): void {
    for (let index = 1; index < this.jointCount; index += 1) {
      const parentOffset = (index - 1) * 2;
      const childOffset = index * 2;
      const dx = this.positions[childOffset] - this.positions[parentOffset];
      const dy = this.positions[childOffset + 1] - this.positions[parentOffset + 1];
      const distance = Math.max(Math.hypot(dx, dy), 1e-6);
      const error = (distance - this.segmentLength) / distance;
      const correctionX = dx * error;
      const correctionY = dy * error;

      if (index === 1) {
        this.positions[childOffset] -= correctionX;
        this.positions[childOffset + 1] -= correctionY;
      } else {
        this.positions[parentOffset] += correctionX * 0.35;
        this.positions[parentOffset + 1] += correctionY * 0.35;
        this.positions[childOffset] -= correctionX * 0.65;
        this.positions[childOffset + 1] -= correctionY * 0.65;
      }
    }
  }

  private solveAngleConstraints(): void {
    const maximumBend = 0.58;
    for (let index = 2; index < this.jointCount; index += 1) {
      const grandparent = this.joint(index - 2);
      const parent = this.joint(index - 1);
      const child = this.joint(index);
      const parentAngle = Math.atan2(parent.y - grandparent.y, parent.x - grandparent.x);
      const childAngle = Math.atan2(child.y - parent.y, child.x - parent.x);
      const bend = angleDifference(parentAngle, childAngle);
      if (Math.abs(bend) <= maximumBend) {
        continue;
      }
      const constrainedAngle = parentAngle + clamp(bend, -maximumBend, maximumBend);
      const targetX = parent.x + Math.cos(constrainedAngle) * this.segmentLength;
      const targetY = parent.y + Math.sin(constrainedAngle) * this.segmentLength;
      const offset = index * 2;
      this.positions[offset] = lerp(this.positions[offset], targetX, 0.55);
      this.positions[offset + 1] = lerp(this.positions[offset + 1], targetY, 0.55);
    }
  }

  private pinHead(head: Vec2): void {
    this.positions[0] = head.x;
    this.positions[1] = head.y;
  }

  private setPosition(array: Float32Array, index: number, x: number, y: number): void {
    const offset = index * 2;
    array[offset] = x;
    array[offset + 1] = y;
  }
}
