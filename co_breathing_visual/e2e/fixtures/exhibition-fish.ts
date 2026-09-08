import * as THREE from "three";
import { ExhibitionFish } from "../../src/exhibition/fish";
import { ExhibitionFishView } from "../../src/exhibition/fish-view";
import { settingsFromUrl, type Species } from "../../src/exhibition/config";

export function checkGpuFish() {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  const target = new THREE.WebGLRenderTarget(512, 512, { depthBuffer: false });
  const camera = new THREE.OrthographicCamera(0.39, 0.63, 0.38, 0.62, -1, 1);
  const scene = new THREE.Scene();
  const settings = settingsFromUrl(new URLSearchParams("scene=specimen"));
  const view = new ExhibitionFishView();
  scene.add(view.mesh);
  renderer.setRenderTarget(target);
  renderer.setClearColor(0, 1);
  const render = (fish: ExhibitionFish) => {
    view.update(fish, 1, settings, 2200);
    renderer.clear(); renderer.render(scene, camera);
    const pixels = new Uint8Array(512 * 512 * 4);
    renderer.readRenderTargetPixels(target, 0, 0, 512, 512, pixels);
    return pixels;
  };
  const stats = (pixels: Uint8Array) => {
    let lit = 0, saturated = 0, chroma = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const max = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
      if (max > 8) lit += 1;
      if (max > 250) saturated += 1;
      chroma += max - Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
    }
    return { lit, saturated, chroma };
  };
  try {
    return (["ribbon", "fan"] as Species[]).map(species => {
      const fish = new ExhibitionFish(0, species, { x: 0.58, y: 0.5 }, 0, 1.7, 1);
      fish.speed = 0;
      settings.monochrome = false; settings.lineBrightness = 1; settings.membrane = 0.1;
      for (let i = 0; i < 120; i += 1) fish.advance(1 / 60, 0, 0, { x: 0, y: 0 }, i / 60, true);
      const first = render(fish);
      for (let i = 120; i < 210; i += 1) fish.advance(1 / 60, 0, 0, { x: 0, y: 0 }, i / 60, true);
      const second = render(fish);
      let changed = 0;
      for (let i = 0; i < first.length; i += 4) if (Math.abs(first[i + 1] - second[i + 1]) > 8) changed += 1;
      settings.monochrome = true;
      const mono = stats(render(fish));
      settings.lineBrightness = 0; settings.membrane = 0;
      const hidden = stats(render(fish));
      return { species, first: stats(first), changed, mono, hidden };
    });
  } finally { view.dispose(); target.dispose(); renderer.dispose(); }
}
