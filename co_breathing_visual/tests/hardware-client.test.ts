import { describe, expect, it, vi } from "vitest";
import {
  HardwareClient,
  limitPumpTargets,
  pumpTargetsToArray,
} from "../src/hardware/hardware-client";
import type { InstallationOutputState } from "../src/simulation/output-mapping";

function output(): InstallationOutputState {
  return {
    pumps: { left: 0.8, right: 0.1, top: 0.6, bottom: 0.2 },
    activity: 0.5,
    coherence: 0.7,
    mode: "school",
    atomizer: { active: true, encounter: true, armed: false, cooldownRemaining: 9 },
  };
}

function bridgeStatus(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    state: "armed",
    serial_connected: true,
    serial_port: "/dev/cu.usbmodem-test",
    armed: true,
    hardware_interlock_verified: true,
    last_sequence: 1,
    sent_pumps: [0.35, 0, 0.35, 0],
    last_ack_age_ms: 10,
    firmware_line: "ACK 1",
    fault: null,
    atomizer_locked: true,
    ...overrides,
  };
}

function jsonResponse(payload: object, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("HardwareClient", () => {
  it("uses the fixed left, right, top, bottom channel order", () => {
    expect(pumpTargetsToArray(output())).toEqual([0.8, 0.1, 0.6, 0.2]);
  });

  it("keeps only the two strongest pumps and caps both at 35%", () => {
    expect(limitPumpTargets([0.8, 0.1, 0.6, 0.2])).toEqual([0.35, 0, 0.35, 0]);
  });

  it("sends at no more than 10Hz and never sends the atomizer preview", async () => {
    let now = 0;
    const requests: Array<{ path: string; body?: Record<string, unknown> }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
      requests.push({ path, body });
      return jsonResponse(bridgeStatus());
    }) as typeof fetch;
    const client = new HardwareClient({ fetcher, now: () => now, wallClock: () => 1000 + now });
    await client.connect();

    client.tick(output(), false);
    await settle();
    now = 50;
    client.tick(output(), false);
    await settle();
    now = 100;
    client.tick(output(), false);
    await settle();

    const commands = requests.filter((request) => request.path === "/v1/command");
    expect(commands).toHaveLength(2);
    expect(commands[0].body).toMatchObject({
      ttl_ms: 500,
      ramp_ms: 250,
      data_source: "procedural_fallback",
      pumps: [0.35, 0, 0.35, 0],
      atomizer: false,
    });
  });

  it("does not send commands while paused or before explicit arming", async () => {
    const requests: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      requests.push(path);
      return jsonResponse(bridgeStatus({ state: "connected", armed: false }));
    }) as typeof fetch;
    const client = new HardwareClient({ fetcher, now: () => 0 });
    await client.connect();

    client.tick(output(), false);
    client.tick(output(), true);
    await settle();

    expect(requests).toEqual(["/v1/status"]);
  });

  it("clears the displayed outputs before sending ALL OFF", async () => {
    const statuses: boolean[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const isOff = new URL(String(input)).pathname === "/v1/off";
      return jsonResponse(bridgeStatus({
        state: "connected",
        armed: false,
        sent_pumps: isOff ? [0, 0, 0, 0] : [0.35, 0, 0.35, 0],
      }));
    }) as typeof fetch;
    const client = new HardwareClient({
      fetcher,
      onStatus: (status) => statuses.push(status.armed),
    });
    await client.connect();
    await client.off();

    expect(statuses.at(-1)).toBe(false);
    expect(client.status.sentPumps).toEqual([0, 0, 0, 0]);
    expect(fetcher).toHaveBeenLastCalledWith(
      "http://127.0.0.1:8765/v1/off",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("reports an unreachable bridge as offline and disarmed", async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const client = new HardwareClient({ fetcher });

    await client.connect();

    expect(client.status.state).toBe("offline");
    expect(client.status.armed).toBe(false);
    expect(client.status.fault).toBe("fetch failed");
  });
});
