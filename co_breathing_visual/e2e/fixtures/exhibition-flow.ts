import * as THREE from "three";
import { BehaviorFlowField } from "../../src/simulation/flow-field";
import { VisualFluid, type FluidInjection } from "../../src/render/visual-fluid";

/** Read actual shader output; no screenshot colors or private target access. */
export function checkGpuFlow() {
  const renderer = new THREE.WebGLRenderer({ canvas: document.createElement("canvas") });
  renderer.setSize(128, 128);
  const fluid = new VisualFluid(renderer, 128, 128, { dyeResolution: 128 });
  const field = new BehaviorFlowField(64, 64);
  const data = new Float32Array(64 * 64 * 4);
  const velocity = new THREE.DataTexture(data, 64, 64, THREE.RGBAFormat, THREE.FloatType);
  velocity.minFilter = velocity.magFilter = THREE.LinearFilter;
  const scene = new THREE.Scene(), camera = new THREE.Camera();
  const material = new THREE.ShaderMaterial({
    vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader: "varying vec2 vUv;uniform sampler2D source;void main(){gl_FragColor=texture2D(source,vUv);}",
    uniforms: { source: { value: null } }, depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(quad);
  const read = (texture: THREE.Texture, width: number, height: number): Float32Array => {
    const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.FloatType, depthBuffer: false });
    material.uniforms.source.value = texture;
    renderer.setRenderTarget(target); renderer.render(scene, camera);
    const pixels = new Float32Array(width * height * 4);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    renderer.setRenderTarget(null); target.dispose();
    return pixels;
  };
  const dyeStats = () => {
    const pixels = read(fluid.texture, 128, 128);
    let mass = 0, x = 0, y = 0;
    for (let i = 0; i < 128 * 128; i += 1) {
      const weight = pixels[i * 4] + pixels[i * 4 + 1] + pixels[i * 4 + 2];
      mass += weight; x += ((i % 128) + 0.5) / 128 * weight;
      y += (Math.floor(i / 128) + 0.5) / 128 * weight;
    }
    return { mass, x: x / mass, y: y / mass };
  };
  const setFlow = (x: number, y: number) => {
    field.setUniform({ x, y }); field.writeTexture(data); velocity.needsUpdate = true;
  };
  const source: FluidInjection = { position: { x: 0.4, y: 0.6 }, velocity: { x: 0, y: 0 },
    color: [0.2, 0.4, 0.6], strength: 1, radius: 0.025 };
  const directions = [];
  try {
    for (const vector of [{ x: 0.05, y: 0 }, { x: 0, y: -0.05 }]) {
      fluid.reset(); setFlow(vector.x, vector.y);
      fluid.stepFromField(1 / 60, velocity, [source]);
      const dyeBefore = dyeStats();
      for (let i = 0; i < 60; i += 1) {
        fluid.stepFromField(1 / 60, velocity, []);
      }
      directions.push({ vector, dyeBefore, dyeAfter: dyeStats() });
    }
    setFlow(0, 0);
    const decay = [dyeStats().mass];
    for (let second = 0; second < 4; second += 1) {
      for (let i = 0; i < 60; i += 1) fluid.stepFromField(1 / 60, velocity, []);
      decay.push(dyeStats().mass);
    }
    fluid.reset();
    const injections = Array.from({ length: 99 }, (_, i): FluidInjection => ({ ...source,
      position: { x: 0.8, y: 0.2 }, strength: i === 98 ? 1 : 0 }));
    fluid.stepFromField(1 / 60, velocity, injections);
    const finalInjection = dyeStats();
    // Switching away from the field study must recover exactly the original solver.
    fluid.reset();
    const original = new VisualFluid(renderer, 128, 128, { dyeResolution: 128 });
    let legacyDifference = 0;
    try {
      for (let i = 0; i < 60; i += 1) {
        const splats = [{ ...source, velocity: { x: 0.12, y: -0.03 }, strength: 0.04 }];
        fluid.step(1 / 60, splats); original.step(1 / 60, splats);
      }
      const restored = read(fluid.texture, 128, 128), baseline = read(original.texture, 128, 128);
      for (let i = 0; i < restored.length; i += 1) legacyDifference = Math.max(legacyDifference, Math.abs(restored[i] - baseline[i]));
    } finally { original.dispose(); }
    return { directions, decay, finalInjection, legacyDifference };
  } finally {
    fluid.dispose(); velocity.dispose(); material.dispose(); quad.geometry.dispose(); renderer.dispose();
  }
}
