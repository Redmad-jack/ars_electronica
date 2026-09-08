import * as THREE from "three";
import { VisualFluid, type FluidInjection } from "../render/visual-fluid";
import { QUALITY, type ExhibitionSettings } from "./config";
import type { ExhibitionWorld } from "./world";
import { ExhibitionFishView } from "./fish-view";

const quadVertex = `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const backdropFragment = `
varying vec2 vUv;
uniform sampler2D uDye;
uniform float uMono;
uniform float uZoom;
void main(){
  vec3 dye=texture2D(uDye,(vUv-0.5)/uZoom+0.5).rgb;
  dye=mix(dye,vec3(dot(dye,vec3(.2126,.7152,.0722))),uMono);
  float edge=smoothstep(0.,.04,min(min(vUv.x,vUv.y),min(1.-vUv.x,1.-vUv.y)));
  float vignette=smoothstep(.92,.18,distance(vUv,vec2(.5)));
  gl_FragColor=vec4(dye*vec3(.86,.98,1.)*1.18*(.7+vignette*.3)*edge,1.);
}`;
const blurFragment = `
varying vec2 vUv;uniform sampler2D uSource;uniform vec2 uDirection;
void main(){
  vec3 color=texture2D(uSource,vUv).rgb*.227027;
  color+=texture2D(uSource,vUv+uDirection*1.384615).rgb*.316216;
  color+=texture2D(uSource,vUv-uDirection*1.384615).rgb*.316216;
  color+=texture2D(uSource,vUv+uDirection*3.230769).rgb*.070270;
  color+=texture2D(uSource,vUv-uDirection*3.230769).rgb*.070270;
  gl_FragColor=vec4(color,1.);
}`;
const compositeFragment = `
varying vec2 vUv;uniform sampler2D uScene;uniform sampler2D uBloom;
uniform float uExposure;uniform float uGlow;
void main(){
  vec3 color=texture2D(uScene,vUv).rgb+texture2D(uBloom,vUv).rgb*uGlow;
  color=vec3(1.)-exp(-color*uExposure);
  gl_FragColor=vec4(color,1.);
  #include <colorspace_fragment>
}`;

export class ExhibitionRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly fluid: VisualFluid;
  private readonly worldScene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(0, 1, 0, 1, -1, 1);
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.Camera();
  private readonly quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly backdrop: THREE.ShaderMaterial;
  private readonly blur: THREE.ShaderMaterial;
  private readonly composite: THREE.ShaderMaterial;
  private readonly target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, samples: 4 });
  private readonly blurA = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  private readonly blurB = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  private readonly velocityData = new Float32Array(64 * 64 * 4);
  private readonly velocity = new THREE.DataTexture(this.velocityData, 64, 64, THREE.RGBAFormat, THREE.FloatType);
  private readonly views: ExhibitionFishView[] = [];
  private size = 1080;
  private currentQuality: string;

  constructor(canvas: HTMLCanvasElement, readonly settings: ExhibitionSettings) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.renderer.setClearColor(0, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;
    this.currentQuality = settings.quality;
    this.fluid = new VisualFluid(this.renderer, 1, 1, { dyeResolution: QUALITY[settings.quality].dye });
    this.velocity.minFilter = THREE.LinearFilter; this.velocity.magFilter = THREE.LinearFilter;
    this.velocity.needsUpdate = true;
    this.backdrop = new THREE.ShaderMaterial({ vertexShader: quadVertex, fragmentShader: backdropFragment,
      depthTest: false, depthWrite: false, uniforms: { uDye: { value: this.fluid.texture }, uMono: { value: 0 }, uZoom: { value: 1 } } });
    this.blur = new THREE.ShaderMaterial({ vertexShader: quadVertex, fragmentShader: blurFragment,
      depthTest: false, depthWrite: false, uniforms: { uSource: { value: null }, uDirection: { value: new THREE.Vector2() } } });
    this.composite = new THREE.ShaderMaterial({ vertexShader: quadVertex, fragmentShader: compositeFragment,
      depthTest: false, depthWrite: false, uniforms: {
        uScene: { value: this.target.texture }, uBloom: { value: this.blurB.texture },
        uExposure: { value: settings.exposure }, uGlow: { value: settings.glow },
      } });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.backdrop);
    this.quadScene.add(this.quad);
  }

  resize(size: number): void {
    this.size = size;
    const ratio = Math.min(devicePixelRatio, QUALITY[this.settings.quality].pixelRatio);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(size, size, false);
    const pixels = Math.round(size * ratio);
    this.target.setSize(pixels, pixels);
    this.blurA.setSize(Math.max(1, Math.round(pixels / 4)), Math.max(1, Math.round(pixels / 4)));
    this.blurB.setSize(this.blurA.width, this.blurA.height);
  }

  reset(): void {
    if (this.currentQuality !== this.settings.quality) {
      this.currentQuality = this.settings.quality;
      this.fluid.setResolution(QUALITY[this.settings.quality].dye);
      this.resize(this.size);
    }
    this.fluid.reset();
    this.velocityData.fill(0); this.velocity.needsUpdate = true;
  }

  step(world: ExhibitionWorld, dt: number, injections: readonly FluidInjection[]): void {
    if (this.settings.scene === "flow") {
      world.flow.writeTexture(this.velocityData); this.velocity.needsUpdate = true;
      this.fluid.stepFromField(dt, this.velocity, injections);
    } else {
      // Restore the original visual solver, including its vorticity and dye diffusion.
      this.fluid.step(dt, injections);
    }
  }

  render(world: ExhibitionWorld, alpha: number): void {
    while (this.views.length < world.fish.length) {
      const view = new ExhibitionFishView(); this.views.push(view); this.worldScene.add(view.mesh);
    }
    while (this.views.length > world.fish.length) {
      const view = this.views.pop()!; this.worldScene.remove(view.mesh); view.dispose();
    }
    const zoom = this.settings.scene === "specimen" ? (this.settings.comparison ? 1.85 : 2.2) : 1;
    this.camera.left = 0.5 - 0.5 / zoom; this.camera.right = 0.5 + 0.5 / zoom;
    this.camera.top = 0.5 - 0.5 / zoom; this.camera.bottom = 0.5 + 0.5 / zoom;
    this.camera.updateProjectionMatrix();
    for (let i = 0; i < this.views.length; i += 1) this.views[i].update(world.fish[i], alpha, this.settings, this.size * zoom);
    this.backdrop.uniforms.uDye.value = this.fluid.texture;
    this.backdrop.uniforms.uMono.value = this.settings.monochrome ? 1 : 0;
    this.backdrop.uniforms.uZoom.value = zoom;
    this.renderer.setRenderTarget(this.target); this.renderer.clear();
    this.quad.material = this.backdrop; this.renderer.render(this.quadScene, this.quadCamera);
    this.renderer.render(this.worldScene, this.camera);
    this.blur.uniforms.uSource.value = this.target.texture;
    this.blur.uniforms.uDirection.value.set(1 / this.blurA.width, 0);
    this.quad.material = this.blur;
    this.renderer.setRenderTarget(this.blurA); this.renderer.render(this.quadScene, this.quadCamera);
    this.blur.uniforms.uSource.value = this.blurA.texture;
    this.blur.uniforms.uDirection.value.set(0, 1 / this.blurA.height);
    this.renderer.setRenderTarget(this.blurB); this.renderer.render(this.quadScene, this.quadCamera);
    this.composite.uniforms.uExposure.value = this.settings.exposure;
    this.composite.uniforms.uGlow.value = this.settings.glow;
    this.quad.material = this.composite;
    this.renderer.setRenderTarget(null); this.renderer.render(this.quadScene, this.quadCamera);
  }

  dispose(): void {
    for (const view of this.views) view.dispose();
    this.fluid.dispose(); this.velocity.dispose();
    this.target.dispose(); this.blurA.dispose(); this.blurB.dispose();
    this.backdrop.dispose(); this.blur.dispose(); this.composite.dispose(); this.quad.geometry.dispose();
    this.renderer.dispose();
  }
}
