export type Species = "ribbon" | "fan";
export type Scene = "school" | "specimen" | "flow";
export type Scenario = "none" | "slow" | "fast" | "hold" | "crossing";
export type Motion = "cycle" | "straight" | "turn" | "sharp" | "burst" | "glide" | "rest";
export type Quality = "standard" | "low";

export interface FishPreset {
  joints: number; length: number; width: number; peak: number;
  finLength: number; finRays: number; tailLength: number; tailSpread: number;
  wave: number; stiffness: number; turnRate: number;
  color: [number, number, number];
}

export const PRESETS: Record<Species, FishPreset> = {
  ribbon: {
    joints: 18, length: 0.094, width: 0.010, peak: 0.22,
    finLength: 0.018, finRays: 14, tailLength: 0.027, tailSpread: 0.021,
    wave: 0.78, stiffness: 0.19, turnRate: 1.7, color: [0.24, 0.87, 0.89],
  },
  fan: {
    joints: 14, length: 0.076, width: 0.018, peak: 0.32,
    finLength: 0.029, finRays: 18, tailLength: 0.041, tailSpread: 0.045,
    wave: 0.52, stiffness: 0.26, turnRate: 2.5, color: [0.48, 0.53, 0.98],
  },
};
export const RESPONSE = { gentleSpeed: 0.08, fastSpeed: 0.30, alertDecay: 3, influence: 0.24 };
export const QUALITY = {
  standard: { dye: 512, pixelRatio: 1.5 },
  low: { dye: 256, pixelRatio: 1 },
};
export interface ExhibitionSettings {
  scene: Scene; species: Species; comparison: boolean; skeleton: boolean; monochrome: boolean;
  fishCount: number; seed: number; quality: Quality; scenario: Scenario; motion: Motion;
  mouse: boolean; exposure: number; lineBrightness: number; glow: number; membrane: number;
  dye: number; flowDirection: "right" | "up";
}
export function settingsFromUrl(params: URLSearchParams): ExhibitionSettings {
  const scene = params.get("scene");
  const fishCount = Number(params.get("fish") ?? 4);
  const seed = Number(params.get("seed") ?? 20260714);
  return {
    scene: scene === "specimen" || scene === "flow" ? scene : "school",
    species: params.get("species") === "fan" ? "fan" : "ribbon",
    comparison: params.get("compare") === "1", skeleton: false, monochrome: false,
    fishCount: Number.isFinite(fishCount) ? Math.min(24, Math.max(3, Math.round(fishCount))) : 4,
    seed: Number.isFinite(seed) ? Math.max(1, Math.floor(seed)) : 20260714,
    quality: params.get("quality") === "low" ? "low" : "standard",
    scenario: ["none", "slow", "fast", "hold", "crossing"].includes(params.get("scenario") ?? "")
      ? params.get("scenario") as Scenario : "slow",
    motion: "cycle", mouse: false, exposure: 1.25, lineBrightness: 1,
    glow: 0.45, membrane: 0.10, dye: 1, flowDirection: "right",
  };
}
