import "./style.css";
import { DEFAULT_SETTINGS, type InteractionSource } from "../core/types";
import { MouseInputAdapter } from "../input/mouse-adapter";
import { settingsFromUrl, type ExhibitionSettings } from "./config";
import { ExhibitionWorld } from "./world";
import { ExhibitionRenderer } from "./renderer";
import { specimenMotion } from "./scenarios";
import { VideoComparison } from "./comparison";

const settings = settingsFromUrl(new URLSearchParams(location.search));
const app = document.getElementById("app")!;
document.body.classList.add("exhibition");
app.innerHTML = `
  <section id="reference-pane" hidden aria-label="Local reference video">
    <video id="reference-video" playsinline preload="none" aria-label="本地参考视频"></video>
    <div class="reference-caption">本地视频 / LOCAL VIDEO</div>
  </section>
  <div id="visual-stage">
    <canvas id="visual-canvas" aria-label="Generative aquatic installation"></canvas>
    <div class="exhibition-caption"><span>CO—BREATHING</span><span>程序生成 / GENERATIVE SIMULATION</span></div>
    <div id="specimen-caption"></div>
  </div>
  <aside id="exhibition-panel" class="exhibition-panel" hidden aria-label="Exhibition controls">
    <header><div><p class="exhibition-eyebrow">CO—BREATHING / 展示工作台</p><h1>水域 · Aquatics</h1></div><button id="close-panel" aria-label="Close controls">×</button></header>
    <nav><a href="?view=exhibition">展览</a><a href="?view=exhibition&scene=specimen">单鱼</a><a href="?view=exhibition&scene=flow">水流测试</a><a href="/">调试</a></nav>
    <div class="exhibition-status"><output id="exhibition-fps">— fps</output><span id="exhibition-clock">00:00</span><span>本地程序生成</span></div>
    <div class="exhibition-actions"><button id="exhibition-pause">暂停</button><button id="exhibition-reset">重置 R</button><button id="exhibition-fullscreen">全屏 F</button></div>
    <section class="comparison-controls"><h2>视频与模拟 · 左右分屏</h2>
      <button id="comparison-play">▶ 同步播放视频 + 模拟</button>
      <div class="exhibition-actions"><button id="comparison-choose">选择视频</button><button id="comparison-stop" hidden>退出分屏</button></div>
      <input id="comparison-file" type="file" accept="video/*,.mov,.mp4,.webm" hidden>
      <output id="comparison-status" role="status">使用本机配置的视频，或选择文件；不会上传视频。</output>
    </section>
    <section><h2>场景</h2><div id="scene-settings"></div></section>
    <section><h2>光与色</h2><div id="color-settings"></div></section>
    <section><h2>输出</h2><div id="output-settings"></div><button id="save-preset">保存展示参数</button><output id="save-status"></output></section>
    <footer>D 面板 · F 全屏 · Space 暂停 · R 重置</footer>
  </aside>`;

const canvas = document.getElementById("visual-canvas") as HTMLCanvasElement;
const stage = document.getElementById("visual-stage")!;
const panel = document.getElementById("exhibition-panel")!;
const controls: Array<{ refresh: () => void }> = [];
const stored = localStorage.getItem("co-breathing-exhibition-v1");
if (stored) {
  try {
    const preset = JSON.parse(stored);
    for (const [key, min, max] of [["exposure", 0.5, 2.5], ["lineBrightness", 0.3, 2], ["glow", 0, 1.5], ["membrane", 0, 0.4], ["dye", 0, 2]] as const) {
      if (typeof preset[key] === "number" && Number.isFinite(preset[key])) settings[key] = Math.min(max, Math.max(min, preset[key]));
    }
  } catch { /* Invalid saved visual preferences do not prevent startup. */ }
}
const world = new ExhibitionWorld(settings);
const renderer = new ExhibitionRenderer(canvas, settings);
const mouse = new MouseInputAdapter(canvas);
mouse.setMode("both");
const mouseSettings = { ...DEFAULT_SETTINGS, obstacleRadius: 0.07, flowInjection: 1 };
let paused = false;
let frameId = 0;
let accumulator = 0;
let lastTime = performance.now();
let uiUpdatedAt = 0;
let renderCount = 0;
let fps = 60;
let lastSource: InteractionSource | undefined;
let contextLost = false;
const performanceSamples: number[] = [];
const pendingSamples: InteractionSource[] = [];
let benchmarkStart = performance.now();
let collectAfter = benchmarkStart + 10_000;
let recording: MediaRecorder | null = null;

interface ExhibitionDiagnostics {
  settings: ExhibitionSettings;
  world: ExhibitionWorld;
  frame: { fps: number; time: number; paused: boolean; frames: number; particleCapacity: number; injectionCount: number; resources: { geometries: number; textures: number } };
  reset: () => void;
  performance: (restart?: boolean) => { elapsedSeconds: number; sampleCount: number; averageFps: number; p95FrameMs: number; maxFrameMs: number };
  record: (seconds?: number) => Promise<string>;
}
declare global { interface Window { __EXHIBITION__?: ExhibitionDiagnostics; } }

const diagnostics: ExhibitionDiagnostics = {
  settings, world,
  frame: { fps, time: 0, paused: false, frames: 0, particleCapacity: 0, injectionCount: 0, resources: { geometries: 0, textures: 0 } },
  reset,
  performance(restart = false) {
    const sorted = [...performanceSamples].sort((a, b) => a - b);
    const sum = performanceSamples.reduce((a, b) => a + b, 0);
    const result = { elapsedSeconds: (performance.now() - benchmarkStart) / 1000, sampleCount: sorted.length,
      averageFps: sum > 0 ? sorted.length * 1000 / sum : 0,
      p95FrameMs: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
      maxFrameMs: sorted.at(-1) ?? 0 };
    if (restart) { performanceSamples.length = 0; benchmarkStart = performance.now(); collectAfter = benchmarkStart; }
    return result;
  },
  async record(seconds = 18) {
    if (recording?.state === "recording") throw new Error("Recording already in progress");
    const stream = canvas.captureStream(30);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
    recording = recorder;
    const chunks: BlobPart[] = [];
    return new Promise<string>((resolve, reject) => {
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      recorder.onerror = () => { stream.getTracks().forEach(t => t.stop()); reject(new Error("Recording failed")); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        resolve(URL.createObjectURL(new Blob(chunks, { type: "video/webm" })));
      };
      recorder.start();
      setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, Math.max(1, seconds) * 1000);
    });
  },
};
window.__EXHIBITION__ = diagnostics;

function resetWorld(): void {
  world.reset(); renderer.reset(); accumulator = 0; pendingSamples.length = 0; lastTime = performance.now();
  controls.forEach(c => c.refresh());
}
function reset(): void {
  if (comparison.active) { void comparison.start(true, !paused); } else resetWorld();
}
function setPaused(value: boolean): void {
  paused = value; accumulator = 0; pendingSamples.length = 0; lastTime = performance.now();
  document.getElementById("exhibition-pause")!.textContent = paused ? "继续" : "暂停";
}
function togglePause(): void {
  if (comparison.active) { if (paused) comparison.resume(); else comparison.pause(); }
  else setPaused(!paused);
}
const comparison = new VideoComparison(
  document.getElementById("reference-video") as HTMLVideoElement,
  document.getElementById("comparison-play") as HTMLButtonElement,
  document.getElementById("comparison-status") as HTMLOutputElement,
  { pause: setPaused, reset: resetWorld, layout: active => {
    app.classList.toggle("comparison-active", active);
    section("reference-pane").hidden = !active; section("comparison-stop").hidden = !active;
    resize();
  } },
);
section("comparison-play").addEventListener("click", () => { void comparison.start(); });
section("comparison-stop").addEventListener("click", () => comparison.stop());
const videoFile = section("comparison-file") as HTMLInputElement;
section("comparison-choose").addEventListener("click", () => videoFile.click());
videoFile.addEventListener("change", () => {
  const file = videoFile.files?.[0]; if (file) comparison.choose(file); videoFile.value = "";
});
async function fullscreen(): Promise<void> {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await app.requestFullscreen(); }
  catch { document.getElementById("save-status")!.textContent = "浏览器未允许全屏，请使用窗口全屏。"; }
}
function section(id: string): HTMLElement { return document.getElementById(id)!; }
function select<K extends keyof ExhibitionSettings>(host: HTMLElement, key: K, title: string, options: Array<[ExhibitionSettings[K], string]>, rebuild = true): void {
  const label = document.createElement("label"); label.textContent = title;
  const input = document.createElement("select"); input.id = "exhibition-" + key;
  for (const [value, text] of options) { const option = document.createElement("option"); option.value = String(value); option.textContent = text; input.append(option); }
  input.value = String(settings[key]); input.addEventListener("change", () => {
    settings[key] = input.value as ExhibitionSettings[K]; if (rebuild) reset();
  }); label.append(input); host.append(label);
}
function range(host: HTMLElement, key: "fishCount" | "exposure" | "lineBrightness" | "glow" | "membrane" | "dye", title: string, min: number, max: number, step: number, rebuild = false): void {
  const label = document.createElement("label"); label.textContent = title;
  const value = document.createElement("output"); const input = document.createElement("input");
  input.id = "exhibition-" + key; input.type = "range"; input.min = String(min); input.max = String(max); input.step = String(step);
  const refresh = (): void => { input.value = String(settings[key]); value.textContent = key === "fishCount" ? String(settings[key]) : settings[key].toFixed(2); };
  input.addEventListener("input", () => { settings[key] = Number(input.value); refresh(); });
  if (rebuild) input.addEventListener("change", reset);
  label.append(value, input); host.append(label); controls.push({ refresh }); refresh();
}
function checkbox(host: HTMLElement, key: "comparison" | "skeleton" | "monochrome" | "mouse", title: string, rebuild = false): void {
  const label = document.createElement("label"); label.className = "exhibition-check";
  const input = document.createElement("input"); input.type = "checkbox"; input.id = "exhibition-" + key; input.checked = settings[key];
  input.addEventListener("change", () => { settings[key] = input.checked; if (rebuild) reset(); });
  label.append(input, document.createTextNode(title)); host.append(label);
}
const sceneControls = section("scene-settings");
if (settings.scene === "school") {
  range(sceneControls, "fishCount", "数字鱼", 3, 24, 1, true);
  select(sceneControls, "scenario", "互动片段", [["none", "无人 · 自由游动"], ["slow", "慢速经过"], ["fast", "快速横扫"], ["hold", "中心停留"], ["crossing", "三人交错"]]);
  checkbox(sceneControls, "mouse", "启用鼠标互动（拖动产生水流）");
} else if (settings.scene === "specimen") {
  select(sceneControls, "species", "物种", [["ribbon", "带状鱼 / Ribbon"], ["fan", "扇鳍鱼 / Fan"]]);
  checkbox(sceneControls, "comparison", "双鱼对照", true);
  select(sceneControls, "motion", "运动片段", [["cycle", "依次播放 · 每段 6 秒"], ["straight", "直游"], ["turn", "缓转"], ["sharp", "急转"], ["burst", "加速"], ["glide", "滑行"], ["rest", "停留"]]);
} else {
  select(sceneControls, "flowDirection", "恒定水流", [["right", "向右"], ["up", "向上"]]);
}
checkbox(sceneControls, "skeleton", "显示主骨架");
range(section("color-settings"), "exposure", "曝光", 0.5, 2.5, 0.05);
range(section("color-settings"), "lineBrightness", "线条亮度", 0.3, 2, 0.05);
range(section("color-settings"), "glow", "柔光", 0, 1.5, 0.05);
range(section("color-settings"), "membrane", "鳍膜透明度", 0, 0.4, 0.01);
range(section("color-settings"), "dye", "水中色彩", 0, 2, 0.05);
checkbox(section("color-settings"), "monochrome", "黑白检查");
select(section("output-settings"), "quality", "画质", [["standard", "标准 · 512 流体"], ["low", "低负载 · 256 流体"]]);
document.getElementById("save-preset")!.addEventListener("click", () => {
  const { exposure, lineBrightness, glow, membrane, dye } = settings;
  localStorage.setItem("co-breathing-exhibition-v1", JSON.stringify({ exposure, lineBrightness, glow, membrane, dye }));
  document.getElementById("save-status")!.textContent = "视觉参数已保存到此浏览器";
});
document.getElementById("close-panel")!.addEventListener("click", () => { panel.hidden = true; });
document.getElementById("exhibition-pause")!.addEventListener("click", togglePause);
document.getElementById("exhibition-reset")!.addEventListener("click", reset);
document.getElementById("exhibition-fullscreen")!.addEventListener("click", () => { void fullscreen(); });
const keyDown = (event: KeyboardEvent): void => {
  if (event.target instanceof Element && event.target.closest("input,textarea,select,[contenteditable=true]")) return;
  switch (event.key.toLowerCase()) {
    case "d": panel.hidden = !panel.hidden; break;
    case "f": void fullscreen(); break;
    case " ": event.preventDefault(); togglePause(); break;
    case "r": reset(); break;
  }
};
document.addEventListener("keydown", keyDown);
const resize = (): void => renderer.resize(Math.max(stage.clientWidth, 1));
window.addEventListener("resize", resize);
const visibility = (): void => {
  lastTime = performance.now(); accumulator = 0;
  if (document.hidden && comparison.active) comparison.pause();
};
document.addEventListener("visibilitychange", visibility);
canvas.addEventListener("webglcontextlost", event => { event.preventDefault(); contextLost = true; setPaused(true); if (comparison.active) comparison.pause(); panel.hidden = false; section("save-status").textContent = "图形上下文已中断，恢复后会重新初始化画面。"; });
canvas.addEventListener("webglcontextrestored", () => { location.reload(); });

function frame(now: number): void {
  const rawDt = (now - lastTime) / 1000; lastTime = now;
  if (document.hidden || contextLost) { accumulator = 0; frameId = requestAnimationFrame(frame); return; }
  if (rawDt > 0) fps += (Math.min(120, 1 / rawDt) - fps) * 0.04;
  if (!paused && now > collectAfter && rawDt > 0) performanceSamples.push(rawDt * 1000);
  mouse.tick();
  lastSource = settings.mouse ? mouse.source(mouseSettings) : undefined;
  const samples = mouse.consumeFlowSamples(mouseSettings);
  if (!paused) {
    if (settings.mouse) pendingSamples.push(...samples);
    if (pendingSamples.length > 64) pendingSamples.splice(0, pendingSamples.length - 64);
    // Buffering cannot move the simulation ahead: video time is the shared transport clock.
    accumulator = comparison.active ? Math.min(Math.max(0, comparison.video.currentTime - world.time), 5 / 60) :
      Math.min(accumulator + Math.max(0, rawDt), 5 / 60);
    let firstStep = true;
    while (accumulator >= 1 / 60) {
      const stepSamples = firstStep ? pendingSamples.splice(0) : [];
      world.step(1 / 60, lastSource, stepSamples);
      const injections = world.injections(lastSource, stepSamples);
      renderer.step(world, 1 / 60, injections);
      diagnostics.frame.injectionCount = injections.length;
      accumulator -= 1 / 60; firstStep = false;
    }
  }
  renderer.render(world, paused ? 1 : accumulator * 60);
  renderCount += 1;
  Object.assign(diagnostics.frame, { fps, time: world.time, paused, frames: renderCount,
    particleCapacity: 0,
    resources: { ...renderer.renderer.info.memory } });
  if (now - uiUpdatedAt > 250) {
    section("exhibition-fps").textContent = fps.toFixed(0) + " fps";
    section("exhibition-clock").textContent = Math.floor(world.time / 60).toString().padStart(2, "0") + ":" + Math.floor(world.time % 60).toString().padStart(2, "0");
    section("specimen-caption").textContent = settings.scene === "specimen"
      ? (settings.comparison ? "RIBBON / FAN" : settings.species.toUpperCase()) + "   ·   " + specimenMotion(settings.motion, world.time, 0).active.toUpperCase()
      : settings.scene === "flow" ? "FLOW STUDY  ·  " + settings.flowDirection.toUpperCase() : "";
    uiUpdatedAt = now;
  }
  frameId = requestAnimationFrame(frame);
}
function dispose(): void {
  cancelAnimationFrame(frameId); comparison.dispose(); mouse.dispose(); renderer.dispose();
  document.removeEventListener("keydown", keyDown); document.removeEventListener("visibilitychange", visibility);
  window.removeEventListener("resize", resize);
}
window.addEventListener("beforeunload", dispose, { once: true });
resize();
frameId = requestAnimationFrame(frame);
