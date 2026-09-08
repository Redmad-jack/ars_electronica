import { expect, test } from "@playwright/test";

let movie: Buffer;
test.beforeAll(async ({ browser }) => {
  // Generate a small portable fixture with Chrome, without an external movie or codec dependency.
  const page = await browser.newPage();
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 160; canvas.height = 90;
    const context = canvas.getContext("2d")!;
    const stream = canvas.captureStream(15);
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8" });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = event => chunks.push(event.data);
    const finished = new Promise<void>(resolve => { recorder.onstop = () => resolve(); });
    let tick = 0;
    const timer = setInterval(() => {
      context.fillStyle = `hsl(${tick++ * 10},70%,40%)`; context.fillRect(0, 0, 160, 90);
    }, 60);
    recorder.start(); await new Promise(resolve => setTimeout(resolve, 3000)); recorder.stop();
    await finished; clearInterval(timer); stream.getTracks().forEach(track => track.stop());
    return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
  });
  movie = Buffer.from(bytes); await page.close();
});

test("video and simulation start, pause, replay and resize together", async ({ page }) => {
  let requests = 0;
  await page.route("**/__local/reference-video", route => {
    requests++; return route.fulfill({ contentType: "video/webm", body: movie });
  });
  await page.goto("/?view=exhibition");
  await expect.poll(() => page.evaluate(() => window.__EXHIBITION__?.world.time ?? 0)).toBeGreaterThan(0.2);
  expect(requests).toBe(0);
  await page.keyboard.press("d"); await page.locator("#comparison-play").click();
  const video = page.locator("#reference-video");
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0.2);
  expect(await page.evaluate(() => Math.abs((document.querySelector("video")!).currentTime - window.__EXHIBITION__!.world.time))).toBeLessThan(0.2);
  await page.keyboard.press("Space");
  const times = await page.evaluate(() => [(document.querySelector("video")!).currentTime, window.__EXHIBITION__!.world.time]);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => [(document.querySelector("video")!).currentTime, window.__EXHIBITION__!.world.time])).toEqual(times);
  await page.keyboard.press("r");
  expect(await video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(0);
  expect(await page.evaluate(() => window.__EXHIBITION__!.world.time)).toBe(0);
  await page.keyboard.press("Space");
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0.1);
  await page.keyboard.press("Space");
  await page.keyboard.press("f");
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe("app");
  await page.keyboard.press("f");
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBe(null);
  for (const viewport of [{ width: 1280, height: 720 }, { width: 900, height: 1200 }]) {
    await page.setViewportSize(viewport);
    const box = (await page.locator("#visual-canvas").boundingBox())!;
    const pane = (await page.locator("#reference-pane").boundingBox())!;
    expect(box.width).toBe(Math.min(viewport.width / 2, viewport.height));
    expect(box.height).toBe(box.width); expect(box.x).toBeGreaterThanOrEqual(viewport.width / 2);
    expect(pane.x).toBe(0); expect(pane.width).toBe(viewport.width / 2);
  }
  await page.locator("#comparison-stop").click();
  await expect(video).toBeHidden();
  expect((await page.locator("#visual-canvas").boundingBox())!.width).toBe(900);
  expect(await video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
});

test("missing video can recover through the local chooser, and end freezes both", async ({ page }) => {
  await page.route("**/__local/reference-video", route => route.fulfill({ status: 404 }));
  await page.goto("/?view=exhibition");
  await expect.poll(() => page.evaluate(() => window.__EXHIBITION__?.world.time ?? 0)).toBeGreaterThan(0.1);
  await page.keyboard.press("d"); await page.locator("#comparison-play").click();
  await expect(page.locator("#comparison-status")).toContainText(/不可用|未能播放/);
  expect(await page.evaluate(() => window.__EXHIBITION__!.world.time)).toBe(0);
  await page.locator("#comparison-file").setInputFiles({ name: "test.webm", mimeType: "video/webm", buffer: movie });
  await expect(page.locator("#comparison-status")).toContainText("test.webm");
  await page.locator("#comparison-play").click();
  await expect.poll(() => page.evaluate(() => window.__EXHIBITION__!.world.time)).toBeGreaterThan(0.2);
  await expect(page.locator("#comparison-status")).toContainText("播放结束", { timeout: 10000 });
  const end = await page.evaluate(() => window.__EXHIBITION__!.world.time);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__EXHIBITION__!.world.time)).toBe(end);
});
