import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

test("30 minute exhibition performance acceptance", async ({ page, browser }, testInfo) => {
  test.skip(process.env.EXHIBITION_BENCHMARK !== "1", "Opt-in real-time performance run");
  test.setTimeout(1_890_000);
  const directory = path.resolve("../outputs/exhibition");
  await mkdir(directory, { recursive: true });
  const errors: string[] = [];
  const bridgeRequests: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("request", request => { if (/127\.0\.0\.1:876[56]/.test(request.url())) bridgeRequests.push(request.url()); });
  await page.goto("/?view=exhibition&fish=24&scenario=crossing");
  await expect.poll(() => page.evaluate(() => window.__EXHIBITION__?.frame.time ?? 0)).toBeGreaterThan(1);
  await page.waitForTimeout(10_000);
  const environment = await page.evaluate(() => {
    const gl = (document.querySelector("canvas") as HTMLCanvasElement).getContext("webgl2")!;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    return { userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight], devicePixelRatio,
      renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unavailable",
      frame: window.__EXHIBITION__!.frame, settings: window.__EXHIBITION__!.settings };
  });
  await page.evaluate(() => window.__EXHIBITION__!.performance(true));
  const startTime = await page.evaluate(() => window.__EXHIBITION__!.world.time);
  const startedAt = new Date().toISOString();
  const samples: unknown[] = [];
  for (let minute = 1; minute <= 30; minute += 1) {
    await page.waitForTimeout(60_000);
    const sample = await page.evaluate(() => {
      const exhibit = window.__EXHIBITION__!;
      return { performance: exhibit.performance(), frame: exhibit.frame,
        visible: !document.hidden, fishCount: exhibit.world.fish.length,
        finite: exhibit.world.fish.every(f => f.body.isFinite() && f.rays.every(r => r.points.every(Number.isFinite))) };
    });
    samples.push({ minute, ...sample });
    await writeFile(path.join(directory, "benchmark-progress.json"), JSON.stringify({ startedAt, environment, samples, errors }, null, 2));
    console.log(JSON.stringify({ minute, ...sample }));
    expect(sample.finite).toBe(true);
    expect(sample.visible).toBe(true);
    expect(sample.fishCount).toBe(24);
  }
  const final = await page.evaluate(() => ({ performance: window.__EXHIBITION__!.performance(), frame: window.__EXHIBITION__!.frame }));
  const result = { startedAt, completedAt: new Date().toISOString(), platform: os.platform(), cpu: os.cpus()[0].model,
    browser: browser.version(), project: testInfo.project.name, environment, samples, errors, bridgeRequests,
    ...final, simulatedSeconds: final.frame.time - startTime,
    passed: final.performance.averageFps >= 55 && final.performance.p95FrameMs <= 25 && errors.length === 0 &&
      final.frame.time - startTime >= 1780 && bridgeRequests.length === 0 };
  await writeFile(path.join(directory, "benchmark-30min.json"), JSON.stringify(result, null, 2));
  await page.screenshot({ path: path.join(directory, "school-24-after-30min.png") });
  expect(errors).toEqual([]); expect(bridgeRequests).toEqual([]);
  expect(final.performance.averageFps).toBeGreaterThanOrEqual(55);
  expect(final.performance.p95FrameMs).toBeLessThanOrEqual(25);
  expect(final.frame.time - startTime).toBeGreaterThanOrEqual(1780);
});
