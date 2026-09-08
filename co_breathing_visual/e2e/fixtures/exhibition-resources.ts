import { ExhibitionRenderer } from "../../src/exhibition/renderer";
import { ExhibitionWorld } from "../../src/exhibition/world";
import { settingsFromUrl } from "../../src/exhibition/config";

export function checkResetResources() {
  const settings = settingsFromUrl(new URLSearchParams("fish=4&quality=low"));
  const world = new ExhibitionWorld(settings);
  const renderer = new ExhibitionRenderer(document.createElement("canvas"), settings);
  renderer.resize(256);
  renderer.renderer.info.autoReset = false;
  let legacyCalls = 0, fieldCalls = 0;
  const legacyStep = renderer.fluid.step.bind(renderer.fluid);
  const fieldStep = renderer.fluid.stepFromField.bind(renderer.fluid);
  renderer.fluid.step = (...args) => { legacyCalls += 1; legacyStep(...args); };
  renderer.fluid.stepFromField = (...args) => { fieldCalls += 1; fieldStep(...args); };
  const samples = [];
  try {
    for (let cycle = 0; cycle < 12; cycle += 1) {
      settings.fishCount = cycle % 2 === 0 ? 4 : 24;
      settings.quality = cycle % 2 === 0 ? "low" : "standard";
      world.reset(); renderer.reset();
      legacyCalls = 0; fieldCalls = 0; renderer.renderer.info.reset();
      world.step(1 / 60); renderer.step(world, 1 / 60, world.injections()); renderer.render(world, 1);
      samples.push({ count: settings.fishCount, quality: settings.quality, ...renderer.renderer.info.memory,
        points: renderer.renderer.info.render.points, legacyCalls, fieldCalls, dyeResolution: renderer.fluid.texture.image.width });
    }
    return samples;
  } finally { renderer.dispose(); }
}
