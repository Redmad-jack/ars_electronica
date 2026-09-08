import { expect, test, type Page } from "@playwright/test";

interface PixelStats {
  brightPixels: number;
  checksum: number;
  maximumChannel: number;
  varyingPixels: number;
}

async function readCanvasStats(page: Page): Promise<PixelStats> {
  return page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const canvas = document.getElementById("visual-canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("Visual canvas is missing");
    }
    const gl = canvas.getContext("webgl2");
    if (!gl) {
      throw new Error("WebGL2 is unavailable");
    }

    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let brightPixels = 0;
    let varyingPixels = 0;
    let maximumChannel = 0;
    let checksum = 2166136261;

    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const maximum = Math.max(red, green, blue);
      maximumChannel = Math.max(maximumChannel, maximum);
      if (maximum > 28) {
        brightPixels += 1;
      }
      if (maximum - Math.min(red, green, blue) > 3) {
        varyingPixels += 1;
      }
      if (index % 64 === 0) {
        checksum ^= red | (green << 8) | (blue << 16);
        checksum = Math.imul(checksum, 16777619) >>> 0;
      }
    }

    return { brightPixels, checksum, maximumChannel, varyingPixels };
  });
}

test("renders a live, interactive full-screen simulation", async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.route("http://127.0.0.1:8766/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data_source: "procedural_fallback",
        healthy: false,
        state_age_ms: null,
        frame_age_ms: null,
        camera_connected: false,
        raw_person_count: 0,
        capacity_exceeded: false,
        last_error: "camera_not_configured",
        tracks: [],
      }),
    });
  });

  await page.goto("/");
  const canvas = page.locator("#visual-canvas");
  await expect(canvas).toBeVisible();
  await expect.poll(async () => page.evaluate(() => window.__CO_BREATHING_TEST__?.fishCount)).toBe(4);
  await expect.poll(async () => page.evaluate(() => window.__CO_BREATHING_TEST__?.crowdCount)).toBeLessThanOrEqual(3);
  await expect.poll(async () => page.evaluate(() => window.__CO_BREATHING_TEST__?.mouseEnabled)).toBe(false);
  await expect.poll(async () => page.evaluate(() => window.__CO_BREATHING_TEST__?.simulationTime ?? 0)).toBeGreaterThan(0.2);
  await expect.poll(async () => page.evaluate(() => {
    const pumps = window.__CO_BREATHING_TEST__?.pumpTargets;
    return pumps ? Math.max(pumps.left, pumps.right, pumps.top, pumps.bottom) : 0;
  })).toBeGreaterThan(0.01);

  const viewport = page.viewportSize();
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const width = viewport?.width ?? 1280;
  const height = viewport?.height ?? 720;
  const expectedSize = Math.min(width, height);
  expect(bounds?.width).toBeCloseTo(expectedSize, 0);
  expect(bounds?.height).toBeCloseTo(expectedSize, 0);
  expect(bounds?.x).toBeCloseTo((width - expectedSize) / 2, 0);
  expect(bounds?.y).toBeCloseTo((height - expectedSize) / 2, 0);

  const canvasX = bounds?.x ?? 0;
  const canvasY = bounds?.y ?? 0;
  const canvasWidth = bounds?.width ?? expectedSize;
  const canvasHeight = bounds?.height ?? expectedSize;
  await page.mouse.move(canvasX + canvasWidth * 0.23, canvasY + canvasHeight * 0.31);
  await expect.poll(async () => {
    const x = await page.evaluate(() => window.__CO_BREATHING_TEST__?.pointerPosition.x ?? -1);
    return Math.abs(x - 0.23);
  }).toBeLessThan(0.002);
  await expect.poll(async () => {
    const y = await page.evaluate(() => window.__CO_BREATHING_TEST__?.pointerPosition.y ?? -1);
    return Math.abs(y - 0.31);
  }).toBeLessThan(0.002);

  const panel = page.locator("#debug-panel");
  await expect(page.locator("#controls-toggle")).toBeVisible();
  await page.keyboard.press("d");
  await page.locator("#mouse-toggle").check();
  await expect.poll(async () => page.evaluate(() => window.__CO_BREATHING_TEST__?.mouseEnabled)).toBe(true);
  await page.locator("#field-toggle").check();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("d");
  await page.mouse.move(canvasX + canvasWidth * 0.23, canvasY + canvasHeight * 0.31);
  await page.waitForTimeout(100);
  const obstacleRingPixels = await page.evaluate(({ centerX, centerY }) => {
    const overlay = document.getElementById("debug-overlay");
    if (!(overlay instanceof HTMLCanvasElement)) {
      return 0;
    }
    const context = overlay.getContext("2d");
    if (!context) {
      return 0;
    }
    const bounds = overlay.getBoundingClientRect();
    const scaleX = overlay.width / bounds.width;
    const scaleY = overlay.height / bounds.height;
    const radius = 0.11 * bounds.height;
    const padding = 4;
    const left = Math.max(0, Math.floor((centerX - radius - padding) * scaleX));
    const top = Math.max(0, Math.floor((centerY - radius - padding) * scaleY));
    const sampleWidth = Math.min(overlay.width - left, Math.ceil((radius * 2 + padding * 2) * scaleX));
    const sampleHeight = Math.min(overlay.height - top, Math.ceil((radius * 2 + padding * 2) * scaleY));
    const pixels = context.getImageData(left, top, sampleWidth, sampleHeight).data;
    let count = 0;

    for (let y = 0; y < sampleHeight; y += 1) {
      for (let x = 0; x < sampleWidth; x += 1) {
        const cssX = left / scaleX + x / scaleX;
        const cssY = top / scaleY + y / scaleY;
        const distance = Math.hypot(cssX - centerX, cssY - centerY);
        const alpha = pixels[(y * sampleWidth + x) * 4 + 3];
        if (Math.abs(distance - radius) < 3 && alpha > 20) {
          count += 1;
        }
      }
    }
    return count;
  }, { centerX: canvasWidth * 0.23, centerY: canvasHeight * 0.31 });
  expect(obstacleRingPixels).toBeGreaterThan(80);

  const before = await readCanvasStats(page);
  expect(before.maximumChannel).toBeGreaterThan(40);
  expect(before.brightPixels).toBeGreaterThan(250);
  expect(before.varyingPixels).toBeGreaterThan(1_000);

  await page.mouse.move(canvasX + canvasWidth * 0.32, canvasY + canvasHeight * 0.56);
  await page.mouse.down();
  await page.mouse.move(canvasX + canvasWidth * 0.68, canvasY + canvasHeight * 0.38, { steps: 18 });
  await page.mouse.up();
  await page.waitForTimeout(500);

  const after = await readCanvasStats(page);
  expect(after.checksum).not.toBe(before.checksum);
  expect(after.maximumChannel).toBeGreaterThan(40);

  await expect(panel).toHaveClass(/is-hidden/);
  await page.keyboard.press("d");
  await expect(panel).not.toHaveClass(/is-hidden/);
  await expect(page.locator("#pump-left-output")).toBeVisible();
  await expect(page.locator("#atomizer-output")).toBeVisible();
  await page.waitForTimeout(200);
  const panelBounds = await panel.boundingBox();
  expect(panelBounds).not.toBeNull();
  expect(panelBounds?.x).toBeGreaterThanOrEqual(0);
  expect(panelBounds?.y).toBeGreaterThanOrEqual(0);
  expect((panelBounds?.x ?? 0) + (panelBounds?.width ?? 0)).toBeLessThanOrEqual(width);
  expect((panelBounds?.y ?? 0) + (panelBounds?.height ?? 0)).toBeLessThanOrEqual(height);

  await page.screenshot({ path: testInfo.outputPath("simulation.png") });
  expect(consoleErrors).toEqual([]);
});
