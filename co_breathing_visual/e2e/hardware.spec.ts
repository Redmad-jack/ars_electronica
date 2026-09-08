import { expect, test } from "@playwright/test";

test("requires explicit arming and sends safe four-pump commands to a local bridge", async ({ page }) => {
  let armed = false;
  let offCalls = 0;
  const commands: Array<Record<string, unknown>> = [];
  const origin = "http://127.0.0.1:4173";

  await page.route("http://127.0.0.1:8765/**", async (route) => {
    const request = route.request();
    const headers = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Content-Type": "application/json",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }

    const path = new URL(request.url()).pathname;
    if (path === "/v1/arm") {
      armed = true;
    } else if (path === "/v1/off") {
      armed = false;
      offCalls += 1;
    } else if (path === "/v1/command") {
      commands.push(request.postDataJSON() as Record<string, unknown>);
    }
    const sentPumps = path === "/v1/command"
      ? commands.at(-1)?.pumps ?? [0, 0, 0, 0]
      : [0, 0, 0, 0];
    await route.fulfill({
      status: 200,
      headers,
      body: JSON.stringify({
        state: armed ? "armed" : "connected",
        serial_connected: true,
        serial_port: "/dev/cu.usbmodem-e2e",
        armed,
        hardware_interlock_verified: true,
        last_sequence: commands.length,
        sent_pumps: sentPumps,
        last_ack_age_ms: 8,
        firmware_line: "accepted",
        fault: null,
        atomizer_locked: true,
      }),
    });
  });

  await page.goto("/");
  await expect.poll(() => page.evaluate(() => window.__CO_BREATHING_TEST__?.simulationTime ?? 0)).toBeGreaterThan(0);
  await page.keyboard.press("d");
  await page.locator("#hardware-connect-button").click();
  await expect(page.locator("#hardware-state-output")).toHaveText("CONNECTED");
  await expect(page.locator("#hardware-arm-button")).toBeEnabled();

  await page.locator("#hardware-arm-button").click();
  await expect(page.locator("#hardware-state-output")).toHaveText("ARMED");
  await expect.poll(() => commands.length).toBeGreaterThan(0);
  const command = commands[0];
  const pumps = command.pumps as number[];
  expect(pumps).toHaveLength(4);
  expect(pumps.filter((pump) => pump > 0).length).toBeGreaterThan(0);
  expect(pumps.filter((pump) => pump > 0).length).toBeLessThanOrEqual(2);
  expect(Math.max(...pumps)).toBeLessThanOrEqual(0.35);
  expect(command.atomizer).toBe(false);
  expect(command.data_source).toBe("procedural_fallback");

  await page.locator("#pause-button").click();
  await expect.poll(() => offCalls).toBeGreaterThan(0);
  await expect(page.locator("#hardware-state-output")).toHaveText("CONNECTED");
  await expect(page.locator("#sent-left-output")).toHaveText("0%");
  await expect(page.locator("#sent-right-output")).toHaveText("0%");
  await expect(page.locator("#sent-top-output")).toHaveText("0%");
  await expect(page.locator("#sent-bottom-output")).toHaveText("0%");

  await page.reload();
  await expect(page.locator("#hardware-state-output")).toHaveText("BRIDGE OFFLINE");
  await expect(page.locator("#hardware-arm-button")).toBeDisabled();
});
