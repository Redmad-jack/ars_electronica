import { expect, test } from "@playwright/test";

test("flow study dye follows its field and the original GPU solver is restored without state leakage", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/?view=exhibition&scene=flow");
  await expect.poll(() => page.evaluate(() => window.__EXHIBITION__?.frame.time ?? 0)).toBeGreaterThan(0.1);
  await page.keyboard.press("Space");
  const result = await page.evaluate(async () => {
    // Vite serves this test-only module; it is not imported into the application bundle.
    const url = "/e2e/fixtures/exhibition-flow.ts";
    const fixture = await import(/* @vite-ignore */ url);
    return fixture.checkGpuFlow();
  });
  for (const sample of result.directions) {
    expect(sample.dyeBefore.mass).toBeGreaterThan(1);
    expect(sample.dyeAfter.x - sample.dyeBefore.x).toBeCloseTo(sample.vector.x, 2);
    expect(sample.dyeAfter.y - sample.dyeBefore.y).toBeCloseTo(-sample.vector.y, 2);
  }
  for (let i = 1; i < result.decay.length; i += 1) expect(result.decay[i]).toBeLessThan(result.decay[i - 1]);
  expect(result.decay.at(-1)).toBeLessThan(result.decay[0] * 0.2);
  expect(result.finalInjection.mass).toBeGreaterThan(1);
  expect(result.finalInjection.x).toBeCloseTo(0.8, 2);
  expect(result.finalInjection.y).toBeCloseTo(0.8, 2);
  expect(result.legacyDifference).toBeLessThan(1e-5);
  expect(errors).toEqual([]);
});

test("exhibition uses the original GPU fluid, draws no particles, and releases resources on reset", async ({ page }) => {
  await page.goto("/?view=exhibition&scene=specimen");
  await expect.poll(() => page.evaluate(() => window.__EXHIBITION__?.frame.time ?? 0)).toBeGreaterThan(0.1);
  await page.keyboard.press("Space");
  const samples = await page.evaluate(async () => {
    const url = "/e2e/fixtures/exhibition-resources.ts";
    const fixture = await import(/* @vite-ignore */ url);
    return fixture.checkResetResources();
  });
  expect(samples).toHaveLength(12);
  for (let i = 2; i < samples.length; i += 1) expect(samples[i]).toEqual(samples[i % 2]);
  expect(samples[0].geometries).toBeGreaterThan(0);
  expect(samples[1].geometries - samples[0].geometries).toBe(20);
  for (const sample of samples) {
    expect(sample.points).toBe(0);
    expect(sample.legacyCalls).toBe(1);
    expect(sample.fieldCalls).toBe(0);
    expect(sample.dyeResolution).toBe(sample.quality === "low" ? 256 : 512);
  }
});
