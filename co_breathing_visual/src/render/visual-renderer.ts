import * as THREE from "three";
import type { FishAgent } from "../simulation/fish-agent";
import { FishView } from "./fish-view";
import { VisualFluid, type FluidInjection } from "./visual-fluid";

const backdropVertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const backdropFragmentShader = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uDye;
uniform float uTime;

void main() {
  vec3 dye = texture2D(uDye, vUv).rgb;
  float vignette = smoothstep(0.92, 0.18, distance(vUv, vec2(0.5)));
  float breathing = 0.0035 * sin(uTime * 0.42 + vUv.x * 5.0 + vUv.y * 3.0);
  vec3 base = vec3(0.004, 0.013, 0.016) + breathing * vec3(0.25, 0.5, 0.5);
  vec3 color = base + dye * vec3(0.86, 0.98, 1.0) * 1.18;
  gl_FragColor = vec4(color * (0.7 + vignette * 0.3), 1.0);
}
`;

export class VisualRenderer {
  readonly fluid: VisualFluid;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly backgroundScene = new THREE.Scene();
  private readonly backgroundCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  private readonly worldScene = new THREE.Scene();
  private readonly worldCamera = new THREE.OrthographicCamera(0, 1, 0, 1, -10, 10);
  private readonly backdropMaterial: THREE.ShaderMaterial;
  private readonly fishViews: FishView[] = [];

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x020709, 1);
    this.renderer.autoClear = false;

    this.fluid = new VisualFluid(this.renderer, width, height);
    this.backdropMaterial = new THREE.ShaderMaterial({
      vertexShader: backdropVertexShader,
      fragmentShader: backdropFragmentShader,
      uniforms: {
        uDye: { value: this.fluid.texture },
        uTime: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.backgroundScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.backdropMaterial));
    this.resize(width, height);
  }

  resize(width: number, height: number): void {
    const aspect = width / Math.max(height, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    this.worldCamera.left = 0;
    this.worldCamera.right = aspect;
    this.worldCamera.top = 0;
    this.worldCamera.bottom = 1;
    this.worldCamera.position.z = 1;
    this.worldCamera.updateProjectionMatrix();
    this.fluid.resize(width, height);
  }

  resetFluid(): void {
    this.fluid.reset();
  }

  stepFluid(deltaSeconds: number, injections: readonly FluidInjection[]): void {
    this.fluid.step(deltaSeconds, injections);
  }

  render(fish: readonly FishAgent[], time: number): void {
    this.syncFishViews(fish.length);
    for (let index = 0; index < fish.length; index += 1) {
      this.fishViews[index].update(fish[index]);
    }

    this.backdropMaterial.uniforms.uDye.value = this.fluid.texture;
    this.backdropMaterial.uniforms.uTime.value = time;
    this.renderer.setRenderTarget(null);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.backgroundScene, this.backgroundCamera);
    this.renderer.clearDepth();
    this.renderer.render(this.worldScene, this.worldCamera);
  }

  dispose(): void {
    for (const view of this.fishViews) {
      view.dispose();
    }
    this.fluid.dispose();
    this.backdropMaterial.dispose();
    this.renderer.dispose();
  }

  private syncFishViews(count: number): void {
    while (this.fishViews.length < count) {
      const view = new FishView();
      this.fishViews.push(view);
      this.worldScene.add(view.object);
    }
    while (this.fishViews.length > count) {
      const view = this.fishViews.pop();
      if (view) {
        this.worldScene.remove(view.object);
        view.dispose();
      }
    }
  }
}
