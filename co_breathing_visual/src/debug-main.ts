import { clamp, length } from "./core/math";
import { DEFAULT_SETTINGS, type InteractionSource } from "./core/types";
import { HardwareClient, type HardwareStatus } from "./hardware/hardware-client";
import {
  AudienceClient,
  type AudienceInputStatus,
} from "./input/audience-client";
import { MouseInputAdapter } from "./input/mouse-adapter";
import { DebugOverlay } from "./render/debug-overlay";
import type { FluidInjection } from "./render/visual-fluid";
import { VisualRenderer } from "./render/visual-renderer";
import {
  InstallationOutputMapper,
  type InstallationOutputState,
} from "./simulation/output-mapping";
import { SimulationWorld } from "./simulation/world";
import { DebugPanel } from "./ui/debug-panel";

const FIXED_STEP = 1 / 60;

interface Diagnostics {
  fishCount: number;
  crowdCount: number;
  fps: number;
  paused: boolean;
  mouseEnabled: boolean;
  pointerPosition: { x: number; y: number };
  simulationTime: number;
  pumpTargets: InstallationOutputState["pumps"];
  atomizerActive: boolean;
  hardwareState: HardwareStatus["state"];
  sentPumpTargets: HardwareStatus["sentPumps"];
  audienceSource: AudienceInputStatus["source"];
  liveTrackCount: number;
  audienceCameraHealthy: boolean;
}

declare global {
  interface Window {
    __CO_BREATHING_TEST__?: Diagnostics;
  }
}

function requireCanvas(id: string): HTMLCanvasElement {
  const canvas = document.getElementById(id);
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`Missing required canvas: #${id}`);
  }
  return canvas;
}

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element: #${id}`);
  }
  return element;
}

const visualCanvas = requireCanvas("visual-canvas");
const overlayCanvas = requireCanvas("debug-overlay");
const stage = requireElement("visual-stage");

const settings = { ...DEFAULT_SETTINGS };
const initialWidth = Math.max(stage.clientWidth, 1);
const initialHeight = Math.max(stage.clientHeight, 1);
const world = new SimulationWorld(settings, initialWidth / initialHeight);
const mouse = new MouseInputAdapter(visualCanvas);
mouse.setMode(settings.interactionMode);
const renderer = new VisualRenderer(visualCanvas, initialWidth, initialHeight);
const debugOverlay = new DebugOverlay(overlayCanvas);
const outputMapper = new InstallationOutputMapper();
let updateHardwareStatus = (_status: HardwareStatus): void => {};
let updateAudienceStatus = (_status: AudienceInputStatus): void => {};
const hardware = new HardwareClient({
  onStatus(status) {
    updateHardwareStatus(status);
  },
});
const audience = new AudienceClient({
  onUpdate(people, status) {
    world.setExternalAudience(people);
    updateAudienceStatus(status);
  },
});

let paused = false;
let simulationTime = 0;
let accumulator = 0;
let previousFrameTime = performance.now();
let smoothedFps = 60;
let animationFrame = 0;
const pendingBehaviorSamples: InteractionSource[] = [];
let outputState = outputMapper.update(world.snapshot(simulationTime), 0);

const diagnostics: Diagnostics = {
  fishCount: world.agents.length,
  crowdCount: world.people.filter((person) => person.active).length,
  fps: smoothedFps,
  paused,
  mouseEnabled: settings.mouseEnabled,
  pointerPosition: { x: 0.5, y: 0.5 },
  simulationTime,
  pumpTargets: { ...outputState.pumps },
  atomizerActive: outputState.atomizer.active,
  hardwareState: hardware.status.state,
  sentPumpTargets: [...hardware.status.sentPumps],
  audienceSource: audience.status.source,
  liveTrackCount: audience.status.trackCount,
  audienceCameraHealthy: audience.status.cameraHealthy,
};
window.__CO_BREATHING_TEST__ = diagnostics;

const panel = new DebugPanel(settings, {
  onPauseChange(nextPaused) {
    paused = nextPaused;
    accumulator = 0;
    diagnostics.paused = paused;
    if (paused) {
      void hardware.off();
    }
  },
  onReset() {
    resetSimulation();
  },
  onRebuild() {
    settings.fishCount = clamp(Math.round(settings.fishCount), 3, 5);
    settings.crowdCount = clamp(Math.round(settings.crowdCount), 0, 3);
    settings.seed = Math.max(1, Math.round(settings.seed));
    resetSimulation();
  },
  onModeChange(mode) {
    mouse.setMode(mode);
  },
  onFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void stage.requestFullscreen();
    }
  },
  onHardwareConnect() {
    void hardware.connect();
  },
  onHardwareArm() {
    void hardware.arm();
  },
  onHardwareOff() {
    void hardware.off();
  },
  onAudienceReconnect() {
    void audience.reconnect();
  },
});
updateHardwareStatus = (status): void => {
  panel.updateHardware(status);
  diagnostics.hardwareState = status.state;
  diagnostics.sentPumpTargets = [...status.sentPumps];
};
panel.updateHardware(hardware.status);
updateAudienceStatus = (status): void => {
  panel.updateAudience(status);
  diagnostics.audienceSource = status.source;
  diagnostics.liveTrackCount = status.trackCount;
  diagnostics.audienceCameraHealthy = status.cameraHealthy;
};
panel.updateAudience(audience.status);

function resetSimulation(): void {
  simulationTime = 0;
  accumulator = 0;
  world.reset();
  outputMapper.reset();
  outputState = outputMapper.update(world.snapshot(simulationTime), 0);
  renderer.resetFluid();
  pendingBehaviorSamples.length = 0;
  diagnostics.fishCount = world.agents.length;
  diagnostics.crowdCount = world.people.filter((person) => person.active).length;
  diagnostics.simulationTime = simulationTime;
}

function resize(): void {
  const width = Math.max(stage.clientWidth, 1);
  const height = Math.max(stage.clientHeight, 1);
  renderer.resize(width, height);
  debugOverlay.resize(width, height);
  world.resize(width / height);
}

function fluidInjections(
  source: InteractionSource,
  pointerSamples: readonly InteractionSource[],
): FluidInjection[] {
  const injections: FluidInjection[] = world.agents.map((fish) => {
    const hueShift = 0.5 + 0.5 * Math.sin(fish.phase);
    return {
      position: { x: fish.position.x / world.width, y: fish.position.y },
      velocity: { x: fish.velocity.x / world.width, y: fish.velocity.y },
      color: [0.035 + hueShift * 0.016, 0.18 + hueShift * 0.035, 0.2 + hueShift * 0.045],
      radius: 0.012 + fish.activity * 0.006,
      strength: 0.012 + fish.activity * 0.026,
    };
  });

  for (const person of world.people) {
    if (!person.active || person.flowStrength <= 0 || length(person.velocity) <= 0.001) {
      continue;
    }
    injections.push({
      position: person.position,
      velocity: person.velocity,
      color: [0.34, 0.1, 0.025],
      radius: Math.max(person.radius * 0.5, 0.025),
      strength: clamp(length(person.velocity) * person.flowStrength * 0.5, 0.01, 0.05),
    });
  }

  const recentSamples = pointerSamples.slice(-8);
  for (const sample of recentSamples) {
    const speed = length(sample.velocity);
    injections.push({
      position: sample.position,
      velocity: sample.velocity,
      color: [0.42, 0.12, 0.035],
      radius: Math.max(sample.radius * 0.42, 0.02),
      strength: clamp(speed * sample.flowStrength * 0.038, 0.018, 0.09),
    });
  }

  if (
    recentSamples.length === 0 &&
    source.active &&
    source.flowStrength > 0 &&
    length(source.velocity) > 0.004
  ) {
    injections.push({
      position: source.position,
      velocity: source.velocity,
      color: [0.42, 0.12, 0.035],
      radius: Math.max(source.radius * 0.42, 0.02),
      strength: clamp(length(source.velocity) * source.flowStrength * 0.038, 0.018, 0.09),
    });
  }
  return injections;
}

function frame(now: number): void {
  const frameDelta = Math.min(Math.max((now - previousFrameTime) / 1000, 0), 0.1);
  previousFrameTime = now;
  audience.tick(settings);
  mouse.tick();
  const rawMouseSource = mouse.source(settings);
  const source = settings.mouseEnabled
    ? rawMouseSource
    : { ...rawMouseSource, active: false, obstacleStrength: 0, flowStrength: 0 };
  const capturedPointerSamples = mouse.consumeFlowSamples(settings);
  const pointerSamples = settings.mouseEnabled ? capturedPointerSamples : [];

  if (!paused) {
    pendingBehaviorSamples.push(...pointerSamples);
    if (pendingBehaviorSamples.length > 32) {
      pendingBehaviorSamples.splice(0, pendingBehaviorSamples.length - 32);
    }
    accumulator += frameDelta;
    while (accumulator >= FIXED_STEP) {
      const behaviorSamples = pendingBehaviorSamples.splice(0);
      world.step(FIXED_STEP, simulationTime, source, behaviorSamples);
      simulationTime += FIXED_STEP;
      outputState = outputMapper.update(world.snapshot(simulationTime), FIXED_STEP);
      accumulator -= FIXED_STEP;
    }
    renderer.stepFluid(frameDelta, fluidInjections(source, pointerSamples));
  }

  renderer.render(world.agents, simulationTime);
  debugOverlay.render(world, source, settings, outputState);

  if (frameDelta > 0) {
    const instantaneousFps = 1 / frameDelta;
    smoothedFps += (instantaneousFps - smoothedFps) * 0.05;
  }
  panel.updateFps(smoothedFps);
  panel.updateOutputs(outputState);
  hardware.tick(outputState, paused);
  diagnostics.fishCount = world.agents.length;
  diagnostics.crowdCount = world.people.filter((person) => person.active).length;
  diagnostics.fps = smoothedFps;
  diagnostics.pointerPosition = { ...source.position };
  diagnostics.simulationTime = simulationTime;
  diagnostics.paused = paused;
  diagnostics.mouseEnabled = settings.mouseEnabled;
  diagnostics.pumpTargets = { ...outputState.pumps };
  diagnostics.atomizerActive = outputState.atomizer.active;
  diagnostics.audienceSource = audience.status.source;
  diagnostics.liveTrackCount = audience.status.trackCount;
  diagnostics.audienceCameraHealthy = audience.status.cameraHealthy;
  animationFrame = requestAnimationFrame(frame);
}

function dispose(): void {
  cancelAnimationFrame(animationFrame);
  panel.dispose();
  hardware.dispose();
  audience.dispose();
  mouse.dispose();
  renderer.dispose();
}

window.addEventListener("resize", resize);
window.addEventListener("beforeunload", dispose, { once: true });
document.addEventListener("visibilitychange", () => {
  previousFrameTime = performance.now();
  accumulator = 0;
  if (document.hidden) {
    void hardware.off();
  }
});

resize();
animationFrame = requestAnimationFrame(frame);
