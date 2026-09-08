import { clamp, clampMagnitude } from "../core/math";
import type { SimulationSettings } from "../core/types";
import type { CrowdPerson } from "../simulation/crowd";

export type AudienceInputSource = "live_camera" | "procedural_fallback";

export interface AudienceInputStatus {
  source: AudienceInputSource;
  bridgeConnected: boolean;
  cameraHealthy: boolean;
  trackCount: number;
  rawPersonCount: number;
  frameAgeMs: number | null;
  stateAgeMs: number | null;
  capacityExceeded: boolean;
  fault: string | null;
}

interface AudienceTrackPayload {
  track_id: number;
  bbox_x: number;
  bbox_y: number;
  bbox_w: number;
  bbox_h: number;
  velocity_x: number;
  velocity_y: number;
  activity: number;
  confidence: number;
  last_seen: number;
}

interface AudiencePayload {
  data_source: AudienceInputSource;
  healthy: boolean;
  state_age_ms: number | null;
  frame_age_ms: number | null;
  camera_connected: boolean;
  raw_person_count: number;
  capacity_exceeded: boolean;
  tracks: AudienceTrackPayload[];
  last_error: string;
}

interface AudienceClientOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
  now?: () => number;
  onUpdate?: (people: readonly CrowdPerson[] | null, status: Readonly<AudienceInputStatus>) => void;
}

const POLL_INTERVAL_MS = 100;
const MAX_RETRY_INTERVAL_MS = 5000;
const REQUEST_TIMEOUT_MS = 1000;

const INITIAL_STATUS: AudienceInputStatus = {
  source: "procedural_fallback",
  bridgeConnected: false,
  cameraHealthy: false,
  trackCount: 0,
  rawPersonCount: 0,
  frameAgeMs: null,
  stateAgeMs: null,
  capacityExceeded: false,
  fault: null,
};

export function tracksToCrowd(
  tracks: readonly AudienceTrackPayload[],
  settings: Pick<SimulationSettings, "interactionMode" | "crowdRadius" | "flowInjection">,
): CrowdPerson[] {
  return tracks.map((track) => ({
    id: `camera-person-${track.track_id}`,
    position: {
      x: clamp(track.bbox_x + track.bbox_w * 0.5, 0, 1),
      y: clamp(track.bbox_y + track.bbox_h * 0.5, 0, 1),
    },
    velocity: clampMagnitude({ x: track.velocity_x, y: track.velocity_y }, 0.5),
    radius: clamp(settings.crowdRadius, 0.035, 0.14),
    obstacleStrength: settings.interactionMode === "flow" ? 0 : 1,
    flowStrength: settings.interactionMode === "obstacle" ? 0 : settings.flowInjection,
    active: true,
    activity: clamp(track.activity, 0, 1),
  }));
}

export class AudienceClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly onUpdate?: AudienceClientOptions["onUpdate"];
  private currentStatus: AudienceInputStatus = { ...INITIAL_STATUS };
  private lastPollAt = Number.NEGATIVE_INFINITY;
  private pollIntervalMs = POLL_INTERVAL_MS;
  private pending = false;
  private disposed = false;

  constructor(options: AudienceClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "http://127.0.0.1:8766";
    this.fetcher = options.fetcher ?? fetch.bind(globalThis);
    this.now = options.now ?? (() => performance.now());
    this.onUpdate = options.onUpdate;
    this.publish(null);
  }

  get status(): Readonly<AudienceInputStatus> {
    return this.currentStatus;
  }

  tick(settings: Pick<SimulationSettings, "interactionMode" | "crowdRadius" | "flowInjection">): void {
    if (this.disposed || this.pending) {
      return;
    }
    const now = this.now();
    if (now - this.lastPollAt < this.pollIntervalMs) {
      return;
    }
    this.lastPollAt = now;
    this.pending = true;
    void this.fetchAudience(settings).finally(() => {
      this.pending = false;
    });
  }

  async reconnect(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.useFallback("camera_reconnect_requested", true);
    await this.request("/v1/reconnect", "POST").catch((error: unknown) => {
      this.useFallback(error instanceof Error ? error.message : "audience_bridge_unreachable", false);
    });
    this.pollIntervalMs = POLL_INTERVAL_MS;
    this.lastPollAt = Number.NEGATIVE_INFINITY;
  }

  dispose(): void {
    this.disposed = true;
    this.useFallback("audience_client_disposed", this.currentStatus.bridgeConnected);
  }

  private async fetchAudience(
    settings: Pick<SimulationSettings, "interactionMode" | "crowdRadius" | "flowInjection">,
  ): Promise<void> {
    try {
      const payload = await this.request("/v1/audience", "GET");
      this.pollIntervalMs = POLL_INTERVAL_MS;
      if (!payload.healthy || payload.data_source !== "live_camera") {
        this.applyStatus(payload, null);
        return;
      }
      this.applyStatus(payload, tracksToCrowd(payload.tracks, settings));
    } catch (error) {
      this.pollIntervalMs = Math.min(
        Math.max(this.pollIntervalMs * 2, 500),
        MAX_RETRY_INTERVAL_MS,
      );
      this.useFallback(error instanceof Error ? error.message : "audience_bridge_unreachable", false);
    }
  }

  private async request(path: string, method: "GET" | "POST"): Promise<AudiencePayload> {
    const abortController = new AbortController();
    const timeout = globalThis.setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        method,
        headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
        body: method === "POST" ? "{}" : undefined,
        signal: abortController.signal,
      });
      if (!response.ok) {
        throw new Error(`audience_bridge_http_${response.status}`);
      }
      return parseAudiencePayload(await response.json());
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }

  private applyStatus(payload: AudiencePayload, people: CrowdPerson[] | null): void {
    const healthy = payload.healthy && payload.data_source === "live_camera";
    this.currentStatus = {
      source: healthy ? "live_camera" : "procedural_fallback",
      bridgeConnected: true,
      cameraHealthy: healthy && payload.camera_connected,
      trackCount: healthy ? payload.tracks.length : 0,
      rawPersonCount: healthy ? payload.raw_person_count : 0,
      frameAgeMs: payload.frame_age_ms,
      stateAgeMs: payload.state_age_ms,
      capacityExceeded: healthy && payload.capacity_exceeded,
      fault: healthy ? null : payload.last_error || "camera_not_ready",
    };
    this.publish(healthy ? people ?? [] : null);
  }

  private useFallback(fault: string, bridgeConnected: boolean): void {
    this.currentStatus = {
      ...INITIAL_STATUS,
      bridgeConnected,
      fault,
    };
    this.publish(null);
  }

  private publish(people: readonly CrowdPerson[] | null): void {
    this.onUpdate?.(people, { ...this.currentStatus });
  }
}

function parseAudiencePayload(value: unknown): AudiencePayload {
  if (!isRecord(value)) {
    throw new Error("invalid_audience_payload");
  }
  const healthy = value.healthy === true;
  const dataSource = value.data_source;
  const rawTracks = value.tracks;
  if (
    (dataSource !== "live_camera" && dataSource !== "procedural_fallback") ||
    !Array.isArray(rawTracks) ||
    rawTracks.length > 10
  ) {
    throw new Error("invalid_audience_payload");
  }
  const tracks = rawTracks.map(parseTrack);
  return {
    data_source: dataSource,
    healthy,
    state_age_ms: nullableNonNegative(value.state_age_ms),
    frame_age_ms: nullableNonNegative(value.frame_age_ms),
    camera_connected: value.camera_connected === true,
    raw_person_count: nonNegativeInteger(value.raw_person_count),
    capacity_exceeded: value.capacity_exceeded === true,
    tracks,
    last_error: typeof value.last_error === "string" ? value.last_error : "",
  };
}

function parseTrack(value: unknown): AudienceTrackPayload {
  if (!isRecord(value)) {
    throw new Error("invalid_audience_track");
  }
  const track = {
    track_id: nonNegativeInteger(value.track_id),
    bbox_x: unitNumber(value.bbox_x),
    bbox_y: unitNumber(value.bbox_y),
    bbox_w: unitNumber(value.bbox_w),
    bbox_h: unitNumber(value.bbox_h),
    velocity_x: finiteNumber(value.velocity_x),
    velocity_y: finiteNumber(value.velocity_y),
    activity: unitNumber(value.activity),
    confidence: unitNumber(value.confidence),
    last_seen: nonNegativeNumber(value.last_seen),
  };
  if (track.bbox_w <= 0 || track.bbox_h <= 0 || track.bbox_x + track.bbox_w > 1 || track.bbox_y + track.bbox_h > 1) {
    throw new Error("invalid_audience_bbox");
  }
  return track;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finiteNumber(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error("invalid_audience_number");
  }
  return number;
}

function unitNumber(value: unknown): number {
  const number = finiteNumber(value);
  if (number < 0 || number > 1) {
    throw new Error("invalid_audience_range");
  }
  return number;
}

function nonNegativeNumber(value: unknown): number {
  const number = finiteNumber(value);
  if (number < 0) {
    throw new Error("invalid_audience_range");
  }
  return number;
}

function nonNegativeInteger(value: unknown): number {
  const number = finiteNumber(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error("invalid_audience_integer");
  }
  return number;
}

function nullableNonNegative(value: unknown): number | null {
  return value === null ? null : nonNegativeNumber(value);
}
