import * as THREE from "three";
import { normalize, subtract, type Vec2 } from "../core/math";
import type { FishAgent } from "../simulation/fish-agent";

export class FishView {
  readonly object: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;

  private readonly geometry = new THREE.BufferGeometry();
  private readonly material = new THREE.LineBasicMaterial({
    color: 0xc8eff0,
    transparent: true,
    opacity: 0.68,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  constructor() {
    this.geometry.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
    this.object = new THREE.LineSegments(this.geometry, this.material);
    this.object.frustumCulled = false;
  }

  update(fish: FishAgent): void {
    const joints = Array.from({ length: fish.body.jointCount }, (_, index) => fish.body.joint(index));
    const left: Vec2[] = [];
    const right: Vec2[] = [];

    for (let index = 0; index < joints.length; index += 1) {
      const previous = joints[Math.max(0, index - 1)];
      const next = joints[Math.min(joints.length - 1, index + 1)];
      const tangent = normalize(subtract(next, previous), { x: Math.cos(fish.heading), y: Math.sin(fish.heading) });
      const normal = { x: -tangent.y, y: tangent.x };
      const width = fish.body.widthAt(index);
      left.push({ x: joints[index].x + normal.x * width, y: joints[index].y + normal.y * width });
      right.push({ x: joints[index].x - normal.x * width, y: joints[index].y - normal.y * width });
    }

    const vertices: number[] = [];
    const segment = (a: Vec2, b: Vec2): void => {
      vertices.push(a.x, a.y, 0, b.x, b.y, 0);
    };

    for (let index = 1; index < joints.length; index += 1) {
      segment(joints[index - 1], joints[index]);
      segment(left[index - 1], left[index]);
      segment(right[index - 1], right[index]);
    }

    for (let index = 0; index < joints.length - 1; index += 2) {
      segment(left[index], right[index]);
    }

    this.appendFin(vertices, joints, left, 3, 7, 1.15);
    this.appendFin(vertices, joints, right, 4, 7, 0.88);

    const tail = joints[joints.length - 1];
    const tailBase = joints[joints.length - 4];
    const tailDirection = normalize(subtract(tail, tailBase));
    const tailNormal = { x: -tailDirection.y, y: tailDirection.x };
    const upperTail = { x: tail.x + tailNormal.x * 0.024, y: tail.y + tailNormal.y * 0.024 };
    const lowerTail = { x: tail.x - tailNormal.x * 0.024, y: tail.y - tailNormal.y * 0.024 };
    segment(tailBase, upperTail);
    segment(tailBase, lowerTail);
    segment(upperTail, tail);
    segment(tail, lowerTail);

    this.geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }

  private appendFin(
    vertices: number[],
    joints: Vec2[],
    side: Vec2[],
    start: number,
    end: number,
    scale: number,
  ): void {
    let previousTip: Vec2 | null = null;
    for (let index = start; index <= end; index += 1) {
      const profile = Math.sin(((index - start) / Math.max(end - start, 1)) * Math.PI);
      const direction = subtract(side[index], joints[index]);
      const tip = {
        x: side[index].x + direction.x * profile * scale,
        y: side[index].y + direction.y * profile * scale,
      };
      vertices.push(joints[index].x, joints[index].y, 0, tip.x, tip.y, 0);
      if (previousTip) {
        vertices.push(previousTip.x, previousTip.y, 0, tip.x, tip.y, 0);
      }
      previousTip = tip;
    }
  }
}
