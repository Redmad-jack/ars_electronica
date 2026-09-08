import { angleDifference, clamp, lerp, type Vec2 } from "../core/math";
import type { FishPreset } from "./config";

/** Exhibition-only angular chain; the original simulator keeps its Verlet body. */
export class ExhibitionBody {
  readonly jointCount: number;
  readonly segmentLength: number;
  private readonly positions: Float32Array;
  private readonly angles: Float64Array;

  constructor(head: Vec2, heading: number, private readonly preset: FishPreset, private readonly size: number) {
    this.jointCount = preset.joints;
    this.segmentLength = preset.length * size / (this.jointCount - 1);
    this.positions = new Float32Array(this.jointCount * 2);
    this.angles = new Float64Array(this.jointCount).fill(heading + Math.PI);
    this.place(head);
  }

  update(head: Vec2, heading: number, turnRate: number, phase: number, dt: number, amplitude: number): void {
    for (let i = 1; i < this.jointCount; i += 1) {
      const u = i / (this.jointCount - 1);
      // A quiet forebody and a growing, rearward travelling wave, not a rigid tail hinge.
      const wave = Math.sin(phase - u * 4.8) + 0.16 * Math.sin(phase * 2 - u * 7.2);
      const target = heading + Math.PI + wave * amplitude * Math.pow(u, 1.65) - turnRate * u * 0.32;
      const response = lerp(22, 10, u) * (0.8 + this.preset.stiffness);
      this.angles[i] += angleDifference(this.angles[i], target) * (1 - Math.exp(-response * dt));
      if (i > 1) this.angles[i] = this.angles[i - 1] + clamp(angleDifference(this.angles[i - 1], this.angles[i]), -0.36, 0.36);
    }
    this.place(head);
  }

  joint(index: number): Vec2 {
    const i = clamp(Math.round(index), 0, this.jointCount - 1) * 2;
    return { x: this.positions[i], y: this.positions[i + 1] };
  }

  widthAt(index: number): number {
    const u = clamp(index / (this.jointCount - 1), 0, 1);
    const peak = this.preset.peak;
    const t = u < peak ? u / peak : (u - peak) / (1 - peak);
    // Rounded shoulders taper into a narrow peduncle, with no corner at the widest point.
    const shape = u < peak ? lerp(0.12, 1, Math.sqrt(Math.max(0, 1 - (1 - t) ** 2))) :
      lerp(1, 0.055, Math.pow(t * t * (3 - 2 * t), 0.85));
    return shape * this.preset.width * this.size;
  }

  translate(dx: number, dy: number): void {
    for (let i = 0; i < this.positions.length; i += 2) {
      this.positions[i] += dx; this.positions[i + 1] += dy;
    }
  }

  isFinite(): boolean { return this.positions.every(Number.isFinite); }

  segmentError(): number {
    let error = 0;
    for (let i = 2; i < this.positions.length; i += 2) {
      error = Math.max(error, Math.abs(Math.hypot(this.positions[i] - this.positions[i - 2],
        this.positions[i + 1] - this.positions[i - 1]) - this.segmentLength));
    }
    return error;
  }

  private place(head: Vec2): void {
    this.positions[0] = head.x; this.positions[1] = head.y;
    for (let i = 1; i < this.jointCount; i += 1) {
      this.positions[i * 2] = this.positions[i * 2 - 2] + Math.cos(this.angles[i]) * this.segmentLength;
      this.positions[i * 2 + 1] = this.positions[i * 2 - 1] + Math.sin(this.angles[i]) * this.segmentLength;
    }
  }
}
