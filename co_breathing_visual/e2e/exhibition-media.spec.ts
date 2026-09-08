import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

test("capture exhibition review images and canvas recordings", async ({ page }) => {
  test.skip(process.env.EXHIBITION_MEDIA !== "1", "Opt-in artifact capture");
  test.setTimeout(180_000);
  const directory = path.resolve("../outputs/exhibition");
  await mkdir(directory, { recursive: true });
  for (const [name, query] of [
    ["specimen-ribbon", "scene=specimen&species=ribbon"],
    ["specimen-fan", "scene=specimen&species=fan"],
    ["specimen-pair", "scene=specimen&compare=1"],
    ["school-4", "fish=4&scenario=slow"],
    ["school-12", "fish=12&scenario=slow"],
    ["school-24", "fish=24&scenario=crossing"],
  ]) {
    await page.goto("/?view=exhibition&" + query);
    await expect.poll(() => page.evaluate(() => window.__EXHIBITION__?.frame.time ?? 0), { timeout: 15_000 }).toBeGreaterThan(6);
    await page.screenshot({ path: path.join(directory, name + ".png") });
    if (name === "school-12" || name === "specimen-pair") {
      const data = await page.evaluate(async () => {
        const url = await window.__EXHIBITION__!.record(36);
        const blob = await (await fetch(url)).blob();
        const base64 = await new Promise<string>(resolve => {
          const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.readAsDataURL(blob);
        });
        URL.revokeObjectURL(url);
        return base64;
      });
      await writeFile(path.join(directory, name + ".webm"), Buffer.from(data, "base64"));
    }
  }
});
