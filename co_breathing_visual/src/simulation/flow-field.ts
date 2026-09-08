import { clamp, type Vec2 } from "../core/math";
import type { InteractionSource } from "../core/types";

export class BehaviorFlowField {
  readonly width: number;
  readonly height: number;

  private velocityX: Float32Array;
  private velocityY: Float32Array;
  private advectedX: Float32Array;
  private advectedY: Float32Array;
  private decay: number;
  private readonly diffusion: number;
  private readonly maxVelocity: number;
  private readonly pressure: Float32Array;
  private readonly nextPressure: Float32Array;
  private readonly divergence: Float32Array;

  constructor(width = 64, height = 36, decay = 1.25, diffusion = 0.7, maxVelocity = 1.8, private readonly project = false) {
    this.width = width;
    this.height = height;
    const size = width * height;
    this.velocityX = new Float32Array(size);
    this.velocityY = new Float32Array(size);
    this.advectedX = new Float32Array(size);
    this.advectedY = new Float32Array(size);
    this.pressure = new Float32Array(size);
    this.nextPressure = new Float32Array(size);
    this.divergence = new Float32Array(size);
    this.decay = decay;
    this.diffusion = diffusion;
    this.maxVelocity = maxVelocity;
  }

  setDecay(decay: number): void {
    this.decay = Math.max(0, decay);
  }

  reset(): void {
    this.velocityX.fill(0);
    this.velocityY.fill(0);
    this.advectedX.fill(0);
    this.advectedY.fill(0);
    this.pressure.fill(0);
    this.nextPressure.fill(0);
    this.divergence.fill(0);
  }

  inject(source: InteractionSource): void {
    if (!source.active || source.flowStrength <= 0) {
      return;
    }

    const radius = Math.max(source.radius, 0.001);
    const minX = Math.max(0, Math.floor((source.position.x - radius) * this.width));
    const maxX = Math.min(this.width - 1, Math.ceil((source.position.x + radius) * this.width));
    const minY = Math.max(0, Math.floor((source.position.y - radius) * this.height));
    const maxY = Math.min(this.height - 1, Math.ceil((source.position.y + radius) * this.height));

    for (let y = minY; y <= maxY; y += 1) {
      const normalizedY = (y + 0.5) / this.height;
      for (let x = minX; x <= maxX; x += 1) {
        const normalizedX = (x + 0.5) / this.width;
        const dx = normalizedX - source.position.x;
        const dy = normalizedY - source.position.y;
        const distance = Math.hypot(dx, dy);
        if (distance >= radius) {
          continue;
        }
        const falloff = 1 - distance / radius;
        const weight = falloff * falloff * source.flowStrength;
        const index = this.index(x, y);
        this.velocityX[index] += source.velocity.x * weight;
        this.velocityY[index] += source.velocity.y * weight;
      }
    }
  }

  step(deltaSeconds: number): void {
    const dissipation = Math.exp(-this.decay * deltaSeconds);

    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const index = this.index(x, y);
        const normalizedX = (x + 0.5) / this.width;
        const normalizedY = (y + 0.5) / this.height;
        const backX = normalizedX - this.velocityX[index] * deltaSeconds;
        const backY = normalizedY - this.velocityY[index] * deltaSeconds;
        const sampled = this.sampleArrays(backX, backY, this.velocityX, this.velocityY);
        this.advectedX[index] = sampled.x * dissipation;
        this.advectedY[index] = sampled.y * dissipation;
      }
    }

    const diffusionAmount = clamp(this.diffusion * deltaSeconds, 0, 0.24);
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const index = this.index(x, y);
        const left = this.index(Math.max(0, x - 1), y);
        const right = this.index(Math.min(this.width - 1, x + 1), y);
        const top = this.index(x, Math.max(0, y - 1));
        const bottom = this.index(x, Math.min(this.height - 1, y + 1));
        const averageX =
          (this.advectedX[left] + this.advectedX[right] + this.advectedX[top] + this.advectedX[bottom]) * 0.25;
        const averageY =
          (this.advectedY[left] + this.advectedY[right] + this.advectedY[top] + this.advectedY[bottom]) * 0.25;
        let nextX = this.advectedX[index] + (averageX - this.advectedX[index]) * diffusionAmount;
        let nextY = this.advectedY[index] + (averageY - this.advectedY[index]) * diffusionAmount;
        const speed = Math.hypot(nextX, nextY);
        if (speed > this.maxVelocity) {
          const factor = this.maxVelocity / speed;
          nextX *= factor;
          nextY *= factor;
        }
        this.velocityX[index] = nextX;
        this.velocityY[index] = nextY;
      }
    }
    if (this.project) this.projectPressure();
  }

  setUniform(velocity: Vec2): void {
    this.velocityX.fill(clamp(velocity.x, -this.maxVelocity, this.maxVelocity));
    this.velocityY.fill(clamp(velocity.y, -this.maxVelocity, this.maxVelocity));
  }

  /** Convert the top-left simulation grid to bottom-left texture coordinates exactly once. */
  writeTexture(target: Float32Array): void {
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const source = this.index(x, y);
        const dest = ((this.height - 1 - y) * this.width + x) * 4;
        target[dest] = this.velocityX[source];
        target[dest + 1] = -this.velocityY[source];
        target[dest + 2] = 0;
        target[dest + 3] = 1;
      }
    }
  }

  private projectPressure(): void {
    const w = this.width;
    const h = this.height;
    this.pressure.fill(0);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = y * w + x;
        const l = y * w + Math.max(0, x - 1);
        const r = y * w + Math.min(w - 1, x + 1);
        const t = Math.max(0, y - 1) * w + x;
        const b = Math.min(h - 1, y + 1) * w + x;
        this.divergence[i] = 0.5 * (this.velocityX[r] - this.velocityX[l] + this.velocityY[b] - this.velocityY[t]);
      }
    }
    for (let iteration = 0; iteration < 16; iteration += 1) {
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const i = y * w + x;
          this.nextPressure[i] = (this.pressure[y * w + Math.max(0, x - 1)] +
            this.pressure[y * w + Math.min(w - 1, x + 1)] +
            this.pressure[Math.max(0, y - 1) * w + x] +
            this.pressure[Math.min(h - 1, y + 1) * w + x] - this.divergence[i]) * 0.25;
        }
      }
      this.pressure.set(this.nextPressure);
    }
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = y * w + x;
        this.velocityX[i] -= 0.5 * (this.pressure[y * w + Math.min(w - 1, x + 1)] - this.pressure[y * w + Math.max(0, x - 1)]);
        this.velocityY[i] -= 0.5 * (this.pressure[Math.min(h - 1, y + 1) * w + x] - this.pressure[Math.max(0, y - 1) * w + x]);
        const speed = Math.hypot(this.velocityX[i], this.velocityY[i]);
        if (speed > this.maxVelocity) {
          this.velocityX[i] *= this.maxVelocity / speed;
          this.velocityY[i] *= this.maxVelocity / speed;
        }
        if (x === 0 || x === w - 1) this.velocityX[i] = 0;
        if (y === 0 || y === h - 1) this.velocityY[i] = 0;
      }
    }
  }

  sample(normalizedPosition: Vec2): Vec2 {
    return this.sampleArrays(
      normalizedPosition.x,
      normalizedPosition.y,
      this.velocityX,
      this.velocityY,
    );
  }

  energy(): number {
    let total = 0;
    for (let index = 0; index < this.velocityX.length; index += 1) {
      total += this.velocityX[index] * this.velocityX[index] + this.velocityY[index] * this.velocityY[index];
    }
    return total / this.velocityX.length;
  }

  debugVectors(columnStep = 5, rowStep = 4): Array<{ position: Vec2; velocity: Vec2 }> {
    const vectors: Array<{ position: Vec2; velocity: Vec2 }> = [];
    for (let y = 0; y < this.height; y += rowStep) {
      for (let x = 0; x < this.width; x += columnStep) {
        const index = this.index(x, y);
        vectors.push({
          position: { x: (x + 0.5) / this.width, y: (y + 0.5) / this.height },
          velocity: { x: this.velocityX[index], y: this.velocityY[index] },
        });
      }
    }
    return vectors;
  }

  private index(x: number, y: number): number {
    return y * this.width + x;
  }

  private sampleArrays(
    normalizedX: number,
    normalizedY: number,
    velocityX: Float32Array,
    velocityY: Float32Array,
  ): Vec2 {
    const gridX = clamp(normalizedX, 0, 1) * (this.width - 1);
    const gridY = clamp(normalizedY, 0, 1) * (this.height - 1);
    const x0 = Math.floor(gridX);
    const y0 = Math.floor(gridY);
    const x1 = Math.min(this.width - 1, x0 + 1);
    const y1 = Math.min(this.height - 1, y0 + 1);
    const tx = gridX - x0;
    const ty = gridY - y0;

    const i00 = this.index(x0, y0);
    const i10 = this.index(x1, y0);
    const i01 = this.index(x0, y1);
    const i11 = this.index(x1, y1);

    const topX = velocityX[i00] + (velocityX[i10] - velocityX[i00]) * tx;
    const bottomX = velocityX[i01] + (velocityX[i11] - velocityX[i01]) * tx;
    const topY = velocityY[i00] + (velocityY[i10] - velocityY[i00]) * tx;
    const bottomY = velocityY[i01] + (velocityY[i11] - velocityY[i01]) * tx;

    return {
      x: topX + (bottomX - topX) * ty,
      y: topY + (bottomY - topY) * ty,
    };
  }
}
