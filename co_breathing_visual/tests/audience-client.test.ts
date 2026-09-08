import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../src/core/types";
import {
  AudienceClient,
  tracksToCrowd,
} from "../src/input/audience-client";
import type { CrowdPerson } from "../src/simulation/crowd";

const LIVE_PAYLOAD = {
  data_source: "live_camera",
  healthy: true,
  state_age_ms: 20,
  frame_age_ms: 30,
  camera_connected: true,
  raw_person_count: 1,
  capacity_exceeded: false,
  last_error: "",
  tracks: [{
    track_id: 4,
    bbox_x: 0.1,
    bbox_y: 0.2,
    bbox_w: 0.2,
    bbox_h: 0.4,
    velocity_x: 0.1,
    velocity_y: -0.2,
    activity: 0.5,
    confidence: 0.9,
    last_seen: 1,
  }],
};

describe("AudienceClient", () => {
  it("maps normalized camera tracks into active crowd obstacles and flow", () => {
    const people = tracksToCrowd(LIVE_PAYLOAD.tracks, DEFAULT_SETTINGS);

    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({
      id: "camera-person-4",
      position: { x: 0.2, y: 0.4 },
      velocity: { x: 0.1, y: -0.2 },
      obstacleStrength: 1,
      flowStrength: DEFAULT_SETTINGS.flowInjection,
      active: true,
      activity: 0.5,
    });
  });

  it("uses an empty live list instead of procedural people when no person is present", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      ...LIVE_PAYLOAD,
      raw_person_count: 0,
      tracks: [],
    }), { status: 200 }));
    let people: readonly CrowdPerson[] | null = null;
    const client = new AudienceClient({
      fetcher,
      now: () => 100,
      onUpdate(nextPeople, nextStatus) {
        people = nextPeople;
        void nextStatus;
      },
    });

    client.tick(DEFAULT_SETTINGS);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(client.status.source).toBe("live_camera"));
    expect(people).toEqual([]);
    client.dispose();
  });

  it("falls back and rejects malformed track values", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      ...LIVE_PAYLOAD,
      tracks: [{ ...LIVE_PAYLOAD.tracks[0], bbox_x: 0.9, bbox_w: 0.2 }],
    }), { status: 200 }));
    let people: readonly CrowdPerson[] | null = [];
    const client = new AudienceClient({
      fetcher,
      now: () => 100,
      onUpdate(nextPeople, nextStatus) {
        people = nextPeople;
        void nextStatus;
      },
    });

    client.tick(DEFAULT_SETTINGS);
    await vi.waitFor(() => expect(client.status.fault).toBe("invalid_audience_bbox"));
    expect(client.status.source).toBe("procedural_fallback");
    expect(people).toBeNull();
    client.dispose();
  });

  it("polls at no more than 10Hz", async () => {
    let now = 0;
    const fetcher = vi.fn(async () => new Response(JSON.stringify(LIVE_PAYLOAD), { status: 200 }));
    const client = new AudienceClient({ fetcher, now: () => now });

    client.tick(DEFAULT_SETTINGS);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(client.status.source).toBe("live_camera"));
    client.tick(DEFAULT_SETTINGS);
    expect(fetcher).toHaveBeenCalledTimes(1);
    now = 100;
    client.tick(DEFAULT_SETTINGS);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    client.dispose();
  });
});
