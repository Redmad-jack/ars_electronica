import * as THREE from "three";

const MAX_SPLATS = 24;

export interface FluidInjection {
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  color: [number, number, number];
  radius: number;
  strength: number;
}

class PingPongTarget {
  read: THREE.WebGLRenderTarget;
  write: THREE.WebGLRenderTarget;

  constructor(width: number, height: number, options: THREE.RenderTargetOptions) {
    this.read = new THREE.WebGLRenderTarget(width, height, options);
    this.write = new THREE.WebGLRenderTarget(width, height, options);
  }

  swap(): void {
    [this.read, this.write] = [this.write, this.read];
  }

  dispose(): void {
    this.read.dispose();
    this.write.dispose();
  }
}

const vertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const advectionFragmentShader = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uSource;
uniform sampler2D uVelocity;
uniform float uDelta;
uniform float uDissipation;
uniform vec2 uVelocityTexel;

void main() {
  vec2 velocity = texture2D(uVelocity, vUv * (1.0 - uVelocityTexel) + uVelocityTexel * 0.5).xy;
  vec2 previousUv = clamp(vUv - velocity * uDelta, vec2(0.001), vec2(0.999));
  gl_FragColor = texture2D(uSource, previousUv) * uDissipation;
}
`;

const divergenceFragmentShader = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform vec2 uTexel;

void main() {
  float left = texture2D(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
  float right = texture2D(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
  float top = texture2D(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
  float bottom = texture2D(uVelocity, vUv + vec2(0.0, uTexel.y)).y;
  float divergence = 0.5 * ((right - left) + (bottom - top));
  gl_FragColor = vec4(divergence, 0.0, 0.0, 1.0);
}
`;

const pressureFragmentShader = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexel;

void main() {
  float left = texture2D(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float right = texture2D(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float top = texture2D(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float bottom = texture2D(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  float divergence = texture2D(uDivergence, vUv).x;
  float pressure = (left + right + top + bottom - divergence) * 0.25;
  gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
}
`;

const gradientFragmentShader = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uTexel;

void main() {
  float left = texture2D(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float right = texture2D(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float top = texture2D(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float bottom = texture2D(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  vec2 velocity = texture2D(uVelocity, vUv).xy;
  velocity -= vec2(right - left, bottom - top) * 0.5;
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}
`;

const vorticityFragmentShader = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
uniform float uDelta;
uniform float uCurl;

float curlAt(vec2 uv) {
  float left = texture2D(uVelocity, uv - vec2(uTexel.x, 0.0)).y;
  float right = texture2D(uVelocity, uv + vec2(uTexel.x, 0.0)).y;
  float top = texture2D(uVelocity, uv - vec2(0.0, uTexel.y)).x;
  float bottom = texture2D(uVelocity, uv + vec2(0.0, uTexel.y)).x;
  return 0.5 * ((right - left) - (bottom - top));
}

void main() {
  float centerCurl = curlAt(vUv);
  float leftCurl = abs(curlAt(vUv - vec2(uTexel.x, 0.0)));
  float rightCurl = abs(curlAt(vUv + vec2(uTexel.x, 0.0)));
  float topCurl = abs(curlAt(vUv - vec2(0.0, uTexel.y)));
  float bottomCurl = abs(curlAt(vUv + vec2(0.0, uTexel.y)));
  vec2 gradient = vec2(rightCurl - leftCurl, bottomCurl - topCurl);
  gradient /= max(length(gradient), 0.0001);
  vec2 force = vec2(gradient.y, -gradient.x) * centerCurl * uCurl;
  vec2 velocity = texture2D(uVelocity, vUv).xy + force * uDelta;
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}
`;

const velocitySplatFragmentShader = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uBase;
uniform int uCount;
uniform vec2 uPositions[${MAX_SPLATS}];
uniform vec2 uVelocities[${MAX_SPLATS}];
uniform float uRadii[${MAX_SPLATS}];
uniform float uStrengths[${MAX_SPLATS}];
uniform float uAspect;
uniform float uDelta;

void main() {
  vec2 velocity = texture2D(uBase, vUv).xy;
  for (int i = 0; i < ${MAX_SPLATS}; i++) {
    if (i >= uCount) break;
    vec2 offset = vUv - uPositions[i];
    offset.x *= uAspect;
    float radius = max(uRadii[i], 0.002);
    float influence = exp(-dot(offset, offset) / (radius * radius));
    velocity += uVelocities[i] * influence * uStrengths[i] * min(uDelta * 60.0, 1.5);
  }
  gl_FragColor = vec4(velocity, 0.0, 1.0);
}
`;

const dyeSplatFragmentShader = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uBase;
uniform int uCount;
uniform vec2 uPositions[${MAX_SPLATS}];
uniform vec3 uColors[${MAX_SPLATS}];
uniform float uRadii[${MAX_SPLATS}];
uniform float uStrengths[${MAX_SPLATS}];
uniform float uAspect;
uniform float uDelta;

void main() {
  vec3 dye = texture2D(uBase, vUv).rgb;
  for (int i = 0; i < ${MAX_SPLATS}; i++) {
    if (i >= uCount) break;
    vec2 offset = vUv - uPositions[i];
    offset.x *= uAspect;
    float radius = max(uRadii[i], 0.002);
    float influence = exp(-dot(offset, offset) / (radius * radius));
    dye += uColors[i] * influence * uStrengths[i] * min(uDelta * 60.0, 1.5);
  }
  gl_FragColor = vec4(min(dye, vec3(4.0)), 1.0);
}
`;

export class VisualFluid {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  private readonly quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private velocity!: PingPongTarget;
  private pressure!: PingPongTarget;
  private dye!: PingPongTarget;
  private divergence!: THREE.WebGLRenderTarget;
  private simulationWidth = 0;
  private simulationHeight = 0;
  private aspect = 1;

  private readonly advectionMaterial = this.material(advectionFragmentShader, {
    uSource: { value: null },
    uVelocity: { value: null },
    uDelta: { value: 0 },
    uDissipation: { value: 1 },
    uVelocityTexel: { value: new THREE.Vector2() },
  });
  private readonly divergenceMaterial = this.material(divergenceFragmentShader, {
    uVelocity: { value: null },
    uTexel: { value: new THREE.Vector2() },
  });
  private readonly pressureMaterial = this.material(pressureFragmentShader, {
    uPressure: { value: null },
    uDivergence: { value: null },
    uTexel: { value: new THREE.Vector2() },
  });
  private readonly gradientMaterial = this.material(gradientFragmentShader, {
    uPressure: { value: null },
    uVelocity: { value: null },
    uTexel: { value: new THREE.Vector2() },
  });
  private readonly vorticityMaterial = this.material(vorticityFragmentShader, {
    uVelocity: { value: null },
    uTexel: { value: new THREE.Vector2() },
    uDelta: { value: 0 },
    uCurl: { value: 18 },
  });
  private readonly velocitySplatMaterial = this.splatMaterial(velocitySplatFragmentShader, false);
  private readonly dyeSplatMaterial = this.splatMaterial(dyeSplatFragmentShader, true);

  constructor(private readonly renderer: THREE.WebGLRenderer, width: number, height: number,
    private readonly options: { dyeResolution?: number } = {}) {
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.advectionMaterial);
    this.scene.add(this.quad);
    this.resize(width, height);
  }

  get texture(): THREE.Texture {
    return this.dye.read.texture;
  }

  resize(viewWidth: number, viewHeight: number): void {
    const nextAspect = viewWidth / Math.max(viewHeight, 1);
    const width = this.options.dyeResolution ?? 256;
    const height = Math.max(96, Math.round(width / nextAspect));
    if (width === this.simulationWidth && height === this.simulationHeight) {
      this.aspect = nextAspect;
      return;
    }

    this.disposeTargets();
    this.simulationWidth = width;
    this.simulationHeight = height;
    this.aspect = nextAspect;
    const options: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.velocity = new PingPongTarget(width, height, options);
    this.pressure = new PingPongTarget(width, height, options);
    this.dye = new PingPongTarget(width, height, options);
    this.divergence = new THREE.WebGLRenderTarget(width, height, options);
    this.updateTexelUniforms();
    this.reset();
  }

  reset(): void {
    const targets = [
      this.velocity.read,
      this.velocity.write,
      this.pressure.read,
      this.pressure.write,
      this.dye.read,
      this.dye.write,
      this.divergence,
    ];
    const previousColor = this.renderer.getClearColor(new THREE.Color());
    const previousAlpha = this.renderer.getClearAlpha();
    this.renderer.setClearColor(0x000000, 0);
    for (const target of targets) {
      this.renderer.setRenderTarget(target);
      this.renderer.clear(true, false, false);
    }
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(previousColor, previousAlpha);
  }

  step(deltaSeconds: number, injections: readonly FluidInjection[]): void {
    const delta = Math.min(deltaSeconds, 1 / 30);
    this.advectionMaterial.uniforms.uVelocityTexel.value.set(0, 0);

    this.advectionMaterial.uniforms.uSource.value = this.velocity.read.texture;
    this.advectionMaterial.uniforms.uVelocity.value = this.velocity.read.texture;
    this.advectionMaterial.uniforms.uDelta.value = delta;
    this.advectionMaterial.uniforms.uDissipation.value = Math.exp(-0.32 * delta);
    this.pass(this.advectionMaterial, this.velocity.write);
    this.velocity.swap();

    this.applySplats(this.velocitySplatMaterial, this.velocity, injections, delta);

    this.vorticityMaterial.uniforms.uVelocity.value = this.velocity.read.texture;
    this.vorticityMaterial.uniforms.uDelta.value = delta;
    this.pass(this.vorticityMaterial, this.velocity.write);
    this.velocity.swap();

    this.divergenceMaterial.uniforms.uVelocity.value = this.velocity.read.texture;
    this.pass(this.divergenceMaterial, this.divergence);

    for (let iteration = 0; iteration < 14; iteration += 1) {
      this.pressureMaterial.uniforms.uPressure.value = this.pressure.read.texture;
      this.pressureMaterial.uniforms.uDivergence.value = this.divergence.texture;
      this.pass(this.pressureMaterial, this.pressure.write);
      this.pressure.swap();
    }

    this.gradientMaterial.uniforms.uPressure.value = this.pressure.read.texture;
    this.gradientMaterial.uniforms.uVelocity.value = this.velocity.read.texture;
    this.pass(this.gradientMaterial, this.velocity.write);
    this.velocity.swap();

    this.advectionMaterial.uniforms.uSource.value = this.dye.read.texture;
    this.advectionMaterial.uniforms.uVelocity.value = this.velocity.read.texture;
    this.advectionMaterial.uniforms.uDelta.value = delta;
    this.advectionMaterial.uniforms.uDissipation.value = Math.exp(-0.38 * delta);
    this.pass(this.advectionMaterial, this.dye.write);
    this.dye.swap();

    this.applySplats(this.dyeSplatMaterial, this.dye, injections, delta);
    this.renderer.setRenderTarget(null);
  }

  setResolution(resolution: number): void {
    this.options.dyeResolution = resolution;
    this.resize(1, 1);
  }

  /** Exhibition uses the CPU field as its only velocity source. */
  stepFromField(delta: number, velocity: THREE.Texture, injections: readonly FluidInjection[]): void {
    this.advectionMaterial.uniforms.uVelocityTexel.value.set(1 / 64, 1 / 64);
    this.advectionMaterial.uniforms.uSource.value = this.dye.read.texture;
    this.advectionMaterial.uniforms.uVelocity.value = velocity;
    this.advectionMaterial.uniforms.uDelta.value = delta;
    this.advectionMaterial.uniforms.uDissipation.value = Math.exp(-0.48 * delta);
    this.pass(this.advectionMaterial, this.dye.write);
    this.dye.swap();
    this.applySplats(this.dyeSplatMaterial, this.dye, injections, delta);
    this.renderer.setRenderTarget(null);
  }

  dispose(): void {
    this.disposeTargets();
    this.quad.geometry.dispose();
    this.advectionMaterial.dispose();
    this.divergenceMaterial.dispose();
    this.pressureMaterial.dispose();
    this.gradientMaterial.dispose();
    this.vorticityMaterial.dispose();
    this.velocitySplatMaterial.dispose();
    this.dyeSplatMaterial.dispose();
  }

  private pass(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget): void {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  private applySplats(
    material: THREE.ShaderMaterial,
    target: PingPongTarget,
    injections: readonly FluidInjection[],
    delta: number,
  ): void {
    for (let offset = 0; offset < injections.length; offset += MAX_SPLATS) {
      this.applySplatBatch(material, target, injections.slice(offset, offset + MAX_SPLATS), delta);
    }
  }

  private applySplatBatch(
    material: THREE.ShaderMaterial,
    target: PingPongTarget,
    injections: readonly FluidInjection[],
    delta: number,
  ): void {
    const count = Math.min(injections.length, MAX_SPLATS);
    const uniforms = material.uniforms;
    uniforms.uBase.value = target.read.texture;
    uniforms.uCount.value = count;
    uniforms.uAspect.value = this.aspect;
    uniforms.uDelta.value = delta;

    for (let index = 0; index < MAX_SPLATS; index += 1) {
      const injection = injections[index];
      if (index < count && injection) {
        uniforms.uPositions.value[index].set(injection.position.x, 1 - injection.position.y);
        uniforms.uVelocities.value[index].set(injection.velocity.x, -injection.velocity.y);
        uniforms.uColors.value[index].set(...injection.color);
        uniforms.uRadii.value[index] = injection.radius;
        uniforms.uStrengths.value[index] = injection.strength;
      } else {
        uniforms.uPositions.value[index].set(0, 0);
        uniforms.uVelocities.value[index].set(0, 0);
        uniforms.uColors.value[index].set(0, 0, 0);
        uniforms.uRadii.value[index] = 0;
        uniforms.uStrengths.value[index] = 0;
      }
    }

    this.pass(material, target.write);
    target.swap();
  }

  private updateTexelUniforms(): void {
    const texel = new THREE.Vector2(1 / this.simulationWidth, 1 / this.simulationHeight);
    this.divergenceMaterial.uniforms.uTexel.value.copy(texel);
    this.pressureMaterial.uniforms.uTexel.value.copy(texel);
    this.gradientMaterial.uniforms.uTexel.value.copy(texel);
    this.vorticityMaterial.uniforms.uTexel.value.copy(texel);
  }

  private material(fragmentShader: string, uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      depthTest: false,
      depthWrite: false,
    });
  }

  private splatMaterial(fragmentShader: string, includeColors: boolean): THREE.ShaderMaterial {
    return this.material(fragmentShader, {
      uBase: { value: null },
      uCount: { value: 0 },
      uPositions: { value: Array.from({ length: MAX_SPLATS }, () => new THREE.Vector2()) },
      uVelocities: { value: Array.from({ length: MAX_SPLATS }, () => new THREE.Vector2()) },
      uColors: { value: Array.from({ length: MAX_SPLATS }, () => new THREE.Vector3()) },
      uRadii: { value: Array.from({ length: MAX_SPLATS }, () => 0) },
      uStrengths: { value: Array.from({ length: MAX_SPLATS }, () => 0) },
      uAspect: { value: 1 },
      uDelta: { value: 0 },
      uIncludeColors: { value: includeColors ? 1 : 0 },
    });
  }

  private disposeTargets(): void {
    this.velocity?.dispose();
    this.pressure?.dispose();
    this.dye?.dispose();
    this.divergence?.dispose();
  }
}
