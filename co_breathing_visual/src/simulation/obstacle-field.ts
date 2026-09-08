import { clamp, length, normalize, scale, subtract, type Vec2 } from "../core/math";
import type { InteractionSource } from "../core/types";

export interface ObstacleSample {
  distance: number;
  normal: Vec2;
}

export class CircleObstacleField {
  sample(position: Vec2, source: InteractionSource, worldWidth: number): ObstacleSample {
    if (!source.active || source.obstacleStrength <= 0) {
      return { distance: Number.POSITIVE_INFINITY, normal: { x: 0, y: 0 } };
    }

    const center = {
      x: source.position.x * worldWidth,
      y: source.position.y,
    };
    const offset = subtract(position, center);
    const centerDistance = length(offset);

    return {
      distance: centerDistance - source.radius,
      normal: normalize(offset),
    };
  }

  avoidanceForce(
    position: Vec2,
    velocity: Vec2,
    source: InteractionSource,
    worldWidth: number,
    lookAheadSeconds: number,
    avoidDistance: number,
  ): Vec2 {
    const predicted = {
      x: position.x + velocity.x * lookAheadSeconds,
      y: position.y + velocity.y * lookAheadSeconds,
    };
    const sample = this.sample(predicted, source, worldWidth);
    if (sample.distance >= avoidDistance) {
      return { x: 0, y: 0 };
    }

    const proximity = clamp((avoidDistance - sample.distance) / avoidDistance, 0, 1.8);
    return scale(sample.normal, source.obstacleStrength * proximity * proximity);
  }
}
