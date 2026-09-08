import type { InstallationOutputState } from "../simulation/output-mapping";

export type HardwareConnectionState = "offline" | "connected" | "armed" | "fault";

export interface HardwareStatus {
  state: HardwareConnectionState;
  serialConnected: boolean;
  serialPort: string | null;
  armed: boolean;
  hardwareInterlockVerified: boolean;
  lastSequence: number | null;
  sentPumps: [number, number, number, number];
  lastAckAgeMs: number | null;
  firmwareLine: string | null;
  fault: string | null;
  atomizerLocked: boolean;
}

interface BridgeStatusPayload {
  state?: unknown;
  serial_connected?: unknown;
  serial_port?: unknown;
  armed?: unknown;
  hardware_interlock_verified?: unknown;
  last_sequence?: unknown;
  sent_pumps?: unknown;
  last_ack_age_ms?: unknown;
  firmware_line?: unknown;
  fault?: unknown;
  error?: unknown;
  atomizer_locked?: unknown;
}

interface HardwareClientOptions {
  baseUrl?: string;
  fetcher?: typeof fetch;
  now?: () => number;
  wallClock?: () => number;
  onStatus?: (status: HardwareStatus) => void;
}

const SEND_INTERVAL_MS = 100;
const REQUEST_TIMEOUT_MS = 1000;
const MAX_PUMP_INTENSITY = 0.35;
const MAX_ACTIVE_PUMPS = 2;
const ZERO_PUMPS: [number, number, number, number] = [0, 0, 0, 0];

const INITIAL_STATUS: HardwareStatus = {
  state: "offline",
  serialConnected: false,
  serialPort: null,
  armed: false,
  hardwareInterlockVerified: false,
  lastSequence: null,
  sentPumps: [...ZERO_PUMPS],
  lastAckAgeMs: null,
  firmwareLine: null,
  fault: null,
  atomizerLocked: true,
};

export function pumpTargetsToArray(
  output: InstallationOutputState,
): [number, number, number, number] {
  return [
    output.pumps.left,
    output.pumps.right,
    output.pumps.top,
    output.pumps.bottom,
  ];
}

export function limitPumpTargets(
  pumps: readonly number[],
): [number, number, number, number] {
  if (pumps.length !== 4) {
    return [...ZERO_PUMPS];
  }
  const safe = pumps.map((value) => Number.isFinite(value)
    ? Math.min(Math.max(value, 0), MAX_PUMP_INTENSITY)
    : 0);
  const active = [...safe.keys()]
    .sort((left, right) => safe[right] - safe[left])
    .slice(0, MAX_ACTIVE_PUMPS);
  const keep = new Set(active);
  return safe.map((value, index) => keep.has(index) ? value : 0) as [number, number, number, number];
}

export class HardwareClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly wallClock: () => number;
  private readonly onStatus?: (status: HardwareStatus) => void;
  private currentStatus: HardwareStatus = { ...INITIAL_STATUS, sentPumps: [...ZERO_PUMPS] };
  private lastSendAt = Number.NEGATIVE_INFINITY;
  private sequence = 0;
  private requestPending = false;
  private disposed = false;
  private safetyEpoch = 0;

  constructor(options: HardwareClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "http://127.0.0.1:8765";
    this.fetcher = options.fetcher ?? fetch.bind(globalThis);
    this.now = options.now ?? (() => performance.now());
    this.wallClock = options.wallClock ?? (() => Date.now());
    this.onStatus = options.onStatus;
    this.sequence = Math.floor(this.wallClock()) >>> 0;
    this.publish();
  }

  get status(): Readonly<HardwareStatus> {
    return this.currentStatus;
  }

  async connect(): Promise<void> {
    await this.request("/v1/status", "GET");
  }

  async arm(): Promise<void> {
    if (!this.currentStatus.serialConnected || !this.currentStatus.hardwareInterlockVerified) {
      this.setFault("hardware_interlock_not_ready");
      return;
    }
    this.safetyEpoch += 1;
    await this.request("/v1/arm", "POST", {}, this.safetyEpoch);
  }

  async off(): Promise<void> {
    this.safetyEpoch += 1;
    const epoch = this.safetyEpoch;
    this.currentStatus = {
      ...this.currentStatus,
      armed: false,
      state: this.currentStatus.serialConnected ? "connected" : "offline",
      sentPumps: [...ZERO_PUMPS],
    };
    this.publish();
    await this.request("/v1/off", "POST", {}, epoch);
  }

  tick(output: InstallationOutputState, paused: boolean): void {
    if (
      this.disposed ||
      paused ||
      !this.currentStatus.armed ||
      this.requestPending
    ) {
      return;
    }
    const now = this.now();
    if (now - this.lastSendAt < SEND_INTERVAL_MS) {
      return;
    }
    this.lastSendAt = now;
    this.sequence = this.nextSequence();
    const payload = {
      seq: this.sequence,
      ttl_ms: 500,
      ramp_ms: 250,
      data_source: "procedural_fallback",
      pumps: limitPumpTargets(pumpTargetsToArray(output)),
      atomizer: false,
    };
    const epoch = this.safetyEpoch;
    this.requestPending = true;
    void this.request("/v1/command", "POST", payload, epoch).finally(() => {
      this.requestPending = false;
      if (epoch !== this.safetyEpoch && !this.disposed) {
        void this.request("/v1/off", "POST", {}, this.safetyEpoch);
      }
    });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.safetyEpoch += 1;
    this.currentStatus = {
      ...this.currentStatus,
      armed: false,
      sentPumps: [...ZERO_PUMPS],
    };
    this.publish();
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const body = new Blob(["{}"], { type: "text/plain" });
      navigator.sendBeacon(`${this.baseUrl}/v1/off`, body);
    } else {
      void this.fetcher(`${this.baseUrl}/v1/off`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        keepalive: true,
      }).catch(() => undefined);
    }
  }

  private nextSequence(): number {
    return (this.sequence + 1) >>> 0;
  }

  private async request(
    path: string,
    method: "GET" | "POST",
    body?: object,
    expectedEpoch = this.safetyEpoch,
  ): Promise<void> {
    const abortController = new AbortController();
    const timeout = globalThis.setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: abortController.signal,
      });
      const payload = await response.json() as BridgeStatusPayload;
      if (expectedEpoch !== this.safetyEpoch || this.disposed) {
        return;
      }
      this.applyPayload(payload, response.ok);
    } catch (error) {
      if (expectedEpoch !== this.safetyEpoch || this.disposed) {
        return;
      }
      this.currentStatus = {
        ...this.currentStatus,
        state: "offline",
        serialConnected: false,
        armed: false,
        sentPumps: [...ZERO_PUMPS],
        fault: error instanceof Error ? error.message : "bridge_unreachable",
      };
      this.publish();
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }

  private applyPayload(payload: BridgeStatusPayload, ok: boolean): void {
    const sentPumps = this.parsePumps(payload.sent_pumps) ?? this.currentStatus.sentPumps;
    const armed = payload.armed === true;
    const serialConnected = payload.serial_connected === true;
    const declaredState = this.parseState(payload.state);
    const error = typeof payload.error === "string"
      ? payload.error
      : typeof payload.fault === "string"
        ? payload.fault
        : null;
    this.currentStatus = {
      state: ok ? declaredState ?? (armed ? "armed" : serialConnected ? "connected" : "offline") : "fault",
      serialConnected,
      serialPort: typeof payload.serial_port === "string" ? payload.serial_port : null,
      armed,
      hardwareInterlockVerified: payload.hardware_interlock_verified === true,
      lastSequence: Number.isInteger(payload.last_sequence) ? Number(payload.last_sequence) : null,
      sentPumps,
      lastAckAgeMs: Number.isFinite(payload.last_ack_age_ms) ? Number(payload.last_ack_age_ms) : null,
      firmwareLine: typeof payload.firmware_line === "string" ? payload.firmware_line : null,
      fault: error,
      atomizerLocked: payload.atomizer_locked !== false,
    };
    this.publish();
  }

  private parseState(value: unknown): HardwareConnectionState | null {
    return value === "offline" || value === "connected" || value === "armed" || value === "fault"
      ? value
      : null;
  }

  private parsePumps(value: unknown): [number, number, number, number] | null {
    if (!Array.isArray(value) || value.length !== 4) {
      return null;
    }
    const pumps = value.map(Number);
    return pumps.every((pump) => Number.isFinite(pump))
      ? [pumps[0], pumps[1], pumps[2], pumps[3]]
      : null;
  }

  private setFault(fault: string): void {
    this.currentStatus = {
      ...this.currentStatus,
      state: "fault",
      armed: false,
      sentPumps: [...ZERO_PUMPS],
      fault,
    };
    this.publish();
  }

  private publish(): void {
    this.onStatus?.({ ...this.currentStatus, sentPumps: [...this.currentStatus.sentPumps] });
  }
}
