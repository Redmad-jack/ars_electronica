import { expect, test } from "@playwright/test";

test("uses fresh anonymous camera tracks and exposes manual reconnect", async ({ page }) => {
  let reconnectCalls = 0;
  const payload = {
    data_source: "live_camera",
    healthy: true,
    state_age_ms: 18,
    frame_age_ms: 24,
    camera_connected: true,
    raw_person_count: 1,
    capacity_exceeded: false,
    last_error: "",
    tracks: [{
      track_id: 12,
      bbox_x: 0.2,
      bbox_y: 0.3,
      bbox_w: 0.2,
      bbox_h: 0.4,
      velocity_x: 0.08,
      velocity_y: 0.02,
      activity: 0.45,
      confidence: 0.91,
      last_seen: 1,
    }],
  };

  await page.route("http://127.0.0.1:8766/**", async (route) => {
    const request = route.request();
    if (new URL(request.url()).pathname === "/v1/reconnect") {
      reconnectCalls += 1;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });

  await page.goto("/");
  await expect.poll(
    async () => page.evaluate(() => window.__CO_BREATHING_TEST__?.audienceSource),
  ).toBe("live_camera");
  await expect.poll(
    async () => page.evaluate(() => window.__CO_BREATHING_TEST__?.crowdCount),
  ).toBe(1);

  await page.keyboard.press("d");
  await expect(page.locator("#audience-state-output")).toHaveText("LIVE CAMERA");
  await expect(page.locator("#audience-tracks-output")).toHaveText("1");
  await page.locator("#audience-reconnect-button").click();
  await expect.poll(() => reconnectCalls).toBe(1);
});
