import { expect, test } from "@playwright/test";

test("GPU fish surfaces render both species, animated fins, monochrome and opacity controls", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/?view=exhibition&scene=specimen");
  await expect.poll(() => page.evaluate(() => window.__EXHIBITION__?.frame.time ?? 0)).toBeGreaterThan(0.1);
  await page.keyboard.press("Space");
  const results = await page.evaluate(async () => {
    const url = "/e2e/fixtures/exhibition-fish.ts";
    const fixture = await import(/* @vite-ignore */ url);
    return fixture.checkGpuFish();
  });
  for (const result of results) {
    expect(result.first.lit).toBeGreaterThan(2000);
    expect(result.first.chroma).toBeGreaterThan(1000);
    expect(result.first.saturated).toBeLessThan(result.first.lit * 0.01);
    expect(result.changed).toBeGreaterThan(400);
    expect(result.mono.lit).toBeGreaterThan(2000);
    expect(result.mono.chroma).toBe(0);
    expect(result.hidden.lit).toBe(0);
  }
  expect(errors).toEqual([]);
});
