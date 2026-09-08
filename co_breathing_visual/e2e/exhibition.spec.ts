import { expect, test } from "@playwright/test";

test("exhibition is square, isolated from bridges, interactive, and resettable", async ({ page }, testInfo) => {
  const bridgeRequests: string[] = [];
  const errors: string[] = [];
  page.on("request", request => { if (/127\.0\.0\.1:876[56]/.test(request.url())) bridgeRequests.push(request.url()); });
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/?view=exhibition&fish=24&scenario=crossing");
  await expect.poll(() => page.evaluate(() => window.__EXHIBITION__?.frame.time ?? 0)).toBeGreaterThan(1);
  expect(await page.evaluate(() => window.__EXHIBITION__?.world.fish.length)).toBe(24);
  expect(await page.evaluate(() => window.__EXHIBITION__?.frame.injectionCount)).toBe(27);
  const canvas = page.locator("#visual-canvas");
  const box = (await canvas.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.width).toBe(Math.min(viewport.width, viewport.height));
  expect(box.height).toBe(box.width);
  expect(box.x).toBe((viewport.width - box.width) / 2);
  await expect(page.locator("#exhibition-panel")).toBeHidden();
  await expect(page.locator("#controls-toggle")).toHaveCount(0);
  await page.keyboard.press("d");
  await expect(page.locator("#exhibition-panel")).toBeVisible();
  await page.locator("#exhibition-mouse").check();
  await page.locator("#exhibition-scenario").selectOption("none");
  await page.locator("#exhibition-quality").selectOption("low");
  expect(await page.evaluate(() => window.__EXHIBITION__?.settings.quality)).toBe("low");
  await expect.poll(() => page.evaluate(() => window.__EXHIBITION__?.frame.particleCapacity)).toBe(0);
  await page.locator("#exhibition-quality").selectOption("standard");
  await expect.poll(() => page.evaluate(() => window.__EXHIBITION__?.frame.particleCapacity)).toBe(0);
  await page.locator("#close-panel").click();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5, { steps: 20 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => Math.max(...window.__EXHIBITION__!.world.fish.map(f => f.alert)))).toBeGreaterThan(0.01);
  await page.keyboard.press("Space");
  const pausedAt = await page.evaluate(() => window.__EXHIBITION__!.frame.time);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__EXHIBITION__!.frame.time)).toBe(pausedAt);
  await page.keyboard.press("r");
  expect(await page.evaluate(() => window.__EXHIBITION__!.world.time)).toBe(0);
  await page.keyboard.press("Space");
  await expect.poll(() => page.evaluate(() => window.__EXHIBITION__!.world.time)).toBeGreaterThan(0.2);
  await page.screenshot({ path: testInfo.outputPath("school-24.png") });
  expect(bridgeRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test("specimen controls select morphology and keyboard input does not leak", async ({ page }, testInfo) => {
  await page.goto("/?view=exhibition&scene=specimen");
  await expect.poll(() => page.evaluate(() => window.__EXHIBITION__?.world.fish.length)).toBe(1);
  await page.keyboard.press("d");
  await page.locator("#exhibition-species").selectOption("fan");
  expect(await page.evaluate(() => window.__EXHIBITION__!.world.fish[0].body.jointCount)).toBe(14);
  await page.locator("#exhibition-comparison").check();
  expect(await page.evaluate(() => window.__EXHIBITION__!.world.fish.length)).toBe(2);
  await page.locator("#exhibition-motion").selectOption("rest");
  await expect.poll(() => page.evaluate(() => window.__EXHIBITION__!.world.time)).toBeGreaterThan(0.2);
  const beforeEditing = await page.evaluate(() => window.__EXHIBITION__!.world.time);
  await page.locator("#exhibition-motion").press("r");
  expect(await page.evaluate(() => window.__EXHIBITION__!.world.time)).toBeGreaterThanOrEqual(beforeEditing);
  await expect(page.locator("#exhibition-panel")).toBeVisible();
  await page.locator("#exhibition-skeleton").check();
  await page.locator("#exhibition-monochrome").check();
  await page.locator("#close-panel").click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: testInfo.outputPath("specimen-monochrome.png") });
});

test("projection full screen retains a square water area and exits cleanly", async ({ page }) => {
  await page.goto("/?view=exhibition");
  await expect.poll(() => page.evaluate(() => window.__EXHIBITION__?.frame.time ?? 0)).toBeGreaterThan(0.1);
  await page.keyboard.press("f");
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe("app");
  const box = (await page.locator("#visual-canvas").boundingBox())!;
  expect(box.width).toBe(box.height);
  await page.keyboard.press("f");
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBe(null);
  for (const viewport of [{ width: 900, height: 1200 }, { width: 1536, height: 864 }]) {
    await page.setViewportSize(viewport);
    const resized = (await page.locator("#visual-canvas").boundingBox())!;
    const side = Math.min(viewport.width, viewport.height);
    expect(resized.width).toBe(side); expect(resized.height).toBe(side);
    expect(resized.x).toBe((viewport.width - side) / 2);
    expect(resized.y).toBe((viewport.height - side) / 2);
    expect(await page.evaluate(() => window.__EXHIBITION__!.world.fish.length)).toBe(4);
  }
});
