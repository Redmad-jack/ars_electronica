import type { InteractionSource } from "../core/types";
import { smoothstep } from "../core/math";
import type { Motion, Scenario } from "./config";

export function scenarioPeople(scenario: Scenario, time: number): InteractionSource[] {
  if (scenario === "none") return [];
  const person = (id: string, x: number, y: number, vx: number, vy: number): InteractionSource => ({
    id, position: { x, y }, velocity: { x: vx, y: vy }, radius: 0.065,
    obstacleStrength: 1, flowStrength: 1, active: true,
  });
  if (scenario === "slow") {
    const angle = time * 0.18;
    return [person("slow", 0.5 + Math.sin(angle) * 0.32, 0.5 + Math.cos(angle) * 0.17,
      Math.cos(angle) * 0.0576, -Math.sin(angle) * 0.0306)];
  }
  if (scenario === "fast") {
    const t = time % 12;
    if (t > 2) return [];
    return [person("fast", -0.1 + t * 0.6, 0.5 + 0.07 * Math.sin(time * 0.5), 0.6, 0.035 * Math.cos(time * 0.5))];
  }
  if (scenario === "hold") {
    const t = time % 24;
    if (t >= 20) return [];
    const enter = smoothstep(0, 5, t);
    const velocity = t < 5 ? 0.6 * (6 * (t / 5) * (1 - t / 5)) / 5 : 0;
    return [person("hold", -0.1 + enter * 0.6, 0.5, velocity, 0)];
  }
  return [0, 1, 2].map((i) => {
    const a = time * (0.25 + i * 0.06) + i * 2.094;
    const b = time * 0.21 + i * 1.9;
    return person(`crossing-${i}`, 0.5 + 0.37 * Math.sin(a), 0.5 + 0.32 * Math.sin(b),
      0.37 * (0.25 + i * 0.06) * Math.cos(a), 0.32 * 0.21 * Math.cos(b));
  });
}

export function specimenMotion(motion: Motion, time: number, phase: number): { heading: number; speed: number; active: Motion } {
  const cycle: Motion[] = ["straight", "turn", "sharp", "burst", "glide", "rest"];
  const active = motion === "cycle" ? cycle[Math.floor(time / 6) % cycle.length] : motion;
  const t = motion === "cycle" ? time % 6 : time;
  const base = phase > 3 ? -0.25 : 0.25;
  switch (active) {
    case "turn": return { heading: base + Math.sin(t * 0.65) * 1.1, speed: 0.055, active };
    case "sharp": return { heading: base + Math.tanh(Math.sin(t * 1.3) * 4) * 1.1, speed: 0.07, active };
    case "burst": return { heading: base, speed: 0.035 + smoothstep(0, 0.7, t % 3) * (1 - smoothstep(1, 3, t % 3)) * 0.10, active };
    case "glide": return { heading: base, speed: 0.08 * Math.exp(-(t % 6) * 0.55), active };
    case "rest": return { heading: base, speed: 0, active };
    default: return { heading: base, speed: 0.055, active };
  }
}
