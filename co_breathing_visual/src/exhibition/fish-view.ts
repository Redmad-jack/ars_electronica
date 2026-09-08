import * as THREE from "three";
import { lerp } from "../core/math";
import { FIN_POINTS, type ExhibitionFish } from "./fish";
import type { ExhibitionSettings } from "./config";
import { fishVertexShader, fishFragmentShader } from "./fish-shaders";

const CONTROL_WIDTH = 32;
const CONTROL_HEIGHT = 1 + FIN_POINTS * 3;

export class ExhibitionFishView {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly data = new Float32Array(CONTROL_WIDTH * CONTROL_HEIGHT * 4);
  private readonly controls = new THREE.DataTexture(this.data, CONTROL_WIDTH, CONTROL_HEIGHT, THREE.RGBAFormat, THREE.FloatType);

  constructor() {
    // Parameter grids never change: the GPU skins curves from a small control texture.
    const vertices: number[] = [], indices: number[] = [];
    for (let patch = 0; patch < 4; patch += 1) {
      const columns = patch === 0 ? 96 : 48, rows = patch === 0 ? 16 : 24;
      const start = vertices.length / 3;
      for (let y = 0; y <= rows; y += 1) for (let x = 0; x <= columns; x += 1) {
        vertices.push(x / columns, y / rows, patch);
      }
      for (let y = 0; y < rows; y += 1) for (let x = 0; x < columns; x += 1) {
        const a = start + y * (columns + 1) + x, b = a + 1, c = a + columns + 1, d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }
    this.geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    this.geometry.setIndex(indices);
    this.controls.minFilter = this.controls.magFilter = THREE.NearestFilter;
    this.controls.generateMipmaps = false;
    this.mesh = new THREE.Mesh(this.geometry, new THREE.ShaderMaterial({
      vertexShader: fishVertexShader, fragmentShader: fishFragmentShader,
      uniforms: {
        uControls: { value: this.controls }, uControlSize: { value: new THREE.Vector2(CONTROL_WIDTH, CONTROL_HEIGHT) },
        uJoints: { value: 18 }, uRayCounts: { value: new THREE.Vector3() },
        uPhase: { value: 0 }, uSize: { value: 1 }, uActivity: { value: 0 },
        uColor: { value: new THREE.Color() }, uMono: { value: 0 }, uAlert: { value: 0 },
        uBrightness: { value: 1 }, uMembrane: { value: 0.1 }, uSkeleton: { value: 0 },
        uDetail: { value: 1 }, uFan: { value: 0 },
      }, transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
  }

  update(fish: ExhibitionFish, alpha: number, settings: ExhibitionSettings, pixelWidth: number): void {
    const uniforms = this.mesh.material.uniforms;
    uniforms.uColor.value.setRGB(...fish.preset.color);
    uniforms.uJoints.value = fish.body.jointCount;
    uniforms.uRayCounts.value.set(...fish.finGroups.map(group => group.length));
    uniforms.uPhase.value = lerp(fish.previousPhase, fish.tailPhase, alpha);
    uniforms.uSize.value = fish.size;
    uniforms.uActivity.value = fish.activity;
    uniforms.uMono.value = settings.monochrome ? 1 : 0;
    uniforms.uAlert.value = fish.alert;
    uniforms.uBrightness.value = settings.lineBrightness;
    uniforms.uMembrane.value = settings.membrane;
    uniforms.uSkeleton.value = settings.skeleton ? 1 : 0;
    uniforms.uFan.value = fish.species === "fan" ? 1 : 0;
    uniforms.uDetail.value = Math.min(1, Math.max(0.4, fish.preset.length * fish.size * pixelWidth / 210));
    for (let i = 0; i < fish.body.jointCount; i += 1) {
      const p = fish.body.joint(i), k = i * 4;
      this.data[k] = lerp(fish.previousJoints[i * 2], p.x, alpha);
      this.data[k + 1] = lerp(fish.previousJoints[i * 2 + 1], p.y, alpha);
      this.data[k + 2] = fish.body.widthAt(i);
    }
    for (let g = 0; g < fish.finGroups.length; g += 1) {
      fish.finGroups[g].forEach((ray, r) => {
        for (let j = 0; j < FIN_POINTS; j += 1) {
          const k = ((1 + g * FIN_POINTS + j) * CONTROL_WIDTH + r) * 4;
          this.data[k] = lerp(ray.renderedPrevious[j * 2], ray.points[j * 2], alpha);
          this.data[k + 1] = lerp(ray.renderedPrevious[j * 2 + 1], ray.points[j * 2 + 1], alpha);
        }
      });
    }
    this.controls.needsUpdate = true;
  }

  dispose(): void { this.controls.dispose(); this.geometry.dispose(); this.mesh.material.dispose(); }
}
