import type { InteractionMode, SimulationSettings } from "../core/types";
import type { HardwareStatus } from "../hardware/hardware-client";
import type { AudienceInputStatus } from "../input/audience-client";
import type { InstallationOutputState } from "../simulation/output-mapping";

type NumericSettingKey =
  | "fishCount"
  | "crowdCount"
  | "crowdRadius"
  | "crowdSpeed"
  | "seed"
  | "obstacleRadius"
  | "obstacleWeight"
  | "flowWeight"
  | "separationWeight"
  | "alignmentWeight"
  | "cohesionWeight"
  | "wanderWeight"
  | "flowInjection"
  | "flowDecay"
  | "bodyWaveAmplitude"
  | "bodyStiffness";

const NUMERIC_SETTINGS = new Set<NumericSettingKey>([
  "fishCount",
  "crowdCount",
  "crowdRadius",
  "crowdSpeed",
  "seed",
  "obstacleRadius",
  "obstacleWeight",
  "flowWeight",
  "separationWeight",
  "alignmentWeight",
  "cohesionWeight",
  "wanderWeight",
  "flowInjection",
  "flowDecay",
  "bodyWaveAmplitude",
  "bodyStiffness",
]);

interface DebugPanelCallbacks {
  onPauseChange(paused: boolean): void;
  onReset(): void;
  onRebuild(): void;
  onModeChange(mode: InteractionMode): void;
  onFullscreen(): void;
  onHardwareConnect(): void;
  onHardwareArm(): void;
  onHardwareOff(): void;
  onAudienceReconnect(): void;
}

export class DebugPanel {
  private readonly panel: HTMLElement;
  private readonly controlsToggle: HTMLButtonElement;
  private readonly fpsOutput: HTMLOutputElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly hardwareArmButton: HTMLButtonElement;
  private paused = false;

  constructor(
    private readonly settings: SimulationSettings,
    private readonly callbacks: DebugPanelCallbacks,
  ) {
    this.panel = this.requireElement<HTMLElement>("debug-panel");
    this.controlsToggle = this.requireElement<HTMLButtonElement>("controls-toggle");
    this.fpsOutput = this.requireElement<HTMLOutputElement>("fps-output");
    this.pauseButton = this.requireElement<HTMLButtonElement>("pause-button");
    this.hardwareArmButton = this.requireElement<HTMLButtonElement>("hardware-arm-button");

    this.bindNumericSettings();
    this.bindModes();
    this.bindCommands();

    const fieldToggle = this.requireElement<HTMLInputElement>("field-toggle");
    fieldToggle.checked = settings.showField;
    fieldToggle.addEventListener("change", () => {
      this.settings.showField = fieldToggle.checked;
    });
    const mouseToggle = this.requireElement<HTMLInputElement>("mouse-toggle");
    mouseToggle.checked = settings.mouseEnabled;
    mouseToggle.addEventListener("change", () => {
      this.settings.mouseEnabled = mouseToggle.checked;
    });

    document.addEventListener("keydown", this.handleKeyDown);
    this.controlsToggle.addEventListener("click", this.handleControlsToggle);
    this.updatePanelVisibility();
  }

  updateFps(fps: number): void {
    this.fpsOutput.value = `${Math.round(fps)} fps`;
  }

  updateOutputs(state: InstallationOutputState): void {
    this.setOutput("pump-left-output", `${Math.round(state.pumps.left * 100)}%`);
    this.setOutput("pump-right-output", `${Math.round(state.pumps.right * 100)}%`);
    this.setOutput("pump-top-output", `${Math.round(state.pumps.top * 100)}%`);
    this.setOutput("pump-bottom-output", `${Math.round(state.pumps.bottom * 100)}%`);
    this.setOutput("activity-output", state.activity.toFixed(2));
    this.setOutput("coherence-output", state.coherence.toFixed(2));
    this.setOutput("mapping-mode-output", state.mode);
    const atomizerStatus = state.atomizer.active
      ? "MIST ON"
      : state.atomizer.cooldownRemaining > 0
        ? `COOLDOWN ${state.atomizer.cooldownRemaining.toFixed(1)}s`
        : state.atomizer.armed
          ? "READY"
          : "WAITING";
    this.setOutput("atomizer-output", `${atomizerStatus} · PREVIEW ONLY`);
  }

  updateHardware(status: Readonly<HardwareStatus>): void {
    const stateDot = this.requireElement<HTMLElement>("hardware-state-dot");
    stateDot.dataset.state = status.state;
    this.setOutput("hardware-state-output", status.state === "offline"
      ? "BRIDGE OFFLINE"
      : status.state.toUpperCase());
    this.setOutput("serial-output", status.serialConnected
      ? status.serialPort ?? "CONNECTED"
      : "NOT CONNECTED");
    this.setOutput("sent-left-output", `${Math.round(status.sentPumps[0] * 100)}%`);
    this.setOutput("sent-right-output", `${Math.round(status.sentPumps[1] * 100)}%`);
    this.setOutput("sent-top-output", `${Math.round(status.sentPumps[2] * 100)}%`);
    this.setOutput("sent-bottom-output", `${Math.round(status.sentPumps[3] * 100)}%`);
    this.setOutput("hardware-ack-output", status.lastAckAgeMs === null
      ? "--"
      : `${status.lastAckAgeMs} ms ago`);
    this.setOutput("hardware-atomizer-output", status.atomizerLocked ? "LOCKED" : "UNKNOWN");

    this.hardwareArmButton.disabled = status.armed ||
      !status.serialConnected ||
      !status.hardwareInterlockVerified;
    const warning = this.requireElement<HTMLElement>("hardware-warning");
    if (!status.hardwareInterlockVerified) {
      warning.textContent = "Electrical interlock is not verified. Arm remains locked.";
    } else if (status.fault) {
      warning.textContent = `Fault: ${status.fault}`;
    } else if (status.armed) {
      warning.textContent = "Supervised hardware output is armed. ALL OFF remains available.";
    } else {
      warning.textContent = "Interlock verified. Arm requires an explicit operator action.";
    }
  }

  updateAudience(status: Readonly<AudienceInputStatus>): void {
    const stateDot = this.requireElement<HTMLElement>("audience-state-dot");
    stateDot.dataset.state = status.source;
    this.setOutput(
      "audience-state-output",
      status.source === "live_camera" ? "LIVE CAMERA" : "PROCEDURAL FALLBACK",
    );
    this.setOutput("audience-tracks-output", String(status.trackCount));
    this.setOutput("audience-observed-output", String(status.rawPersonCount));
    this.setOutput("audience-frame-age-output", this.formatAge(status.frameAgeMs));
    this.setOutput("audience-state-age-output", this.formatAge(status.stateAgeMs));
    this.setOutput("audience-capacity-output", status.capacityExceeded ? "EXCEEDED" : "OK");
    const warning = this.requireElement<HTMLElement>("audience-warning");
    warning.textContent = status.source === "live_camera"
      ? "Only anonymous boxes, Track IDs, velocity and activity enter the simulation."
      : status.bridgeConnected
        ? `Camera unavailable: ${status.fault ?? "waiting for fresh tracks"}. Procedural crowd is active.`
        : "Vision bridge offline. Procedural crowd is active.";
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.pauseButton.textContent = paused ? "Resume" : "Pause";
    this.pauseButton.setAttribute("aria-pressed", String(paused));
  }

  dispose(): void {
    document.removeEventListener("keydown", this.handleKeyDown);
    this.controlsToggle.removeEventListener("click", this.handleControlsToggle);
  }

  private bindNumericSettings(): void {
    const inputs = this.panel.querySelectorAll<HTMLInputElement>("[data-setting]");
    for (const input of inputs) {
      const key = input.dataset.setting;
      if (!key || !NUMERIC_SETTINGS.has(key as NumericSettingKey)) {
        continue;
      }
      const settingKey = key as NumericSettingKey;
      input.value = String(this.settings[settingKey]);
      this.updateOutput(settingKey);

      input.addEventListener("input", () => {
        const value = Number(input.value);
        if (!Number.isFinite(value)) {
          return;
        }
        this.settings[settingKey] = settingKey === "fishCount" || settingKey === "crowdCount" || settingKey === "seed"
          ? Math.round(value)
          : value;
        this.updateOutput(settingKey);
      });

      if (settingKey === "fishCount" || settingKey === "crowdCount" || settingKey === "seed") {
        input.addEventListener("change", () => this.callbacks.onRebuild());
      }
    }
  }

  private bindModes(): void {
    const buttons = this.panel.querySelectorAll<HTMLButtonElement>("[data-mode]");
    for (const button of buttons) {
      const mode = button.dataset.mode as InteractionMode;
      button.classList.toggle("is-active", mode === this.settings.interactionMode);
      button.setAttribute("aria-pressed", String(mode === this.settings.interactionMode));
      button.addEventListener("click", () => {
        this.settings.interactionMode = mode;
        this.callbacks.onModeChange(mode);
        for (const candidate of buttons) {
          const active = candidate === button;
          candidate.classList.toggle("is-active", active);
          candidate.setAttribute("aria-pressed", String(active));
        }
      });
    }
  }

  private bindCommands(): void {
    this.pauseButton.addEventListener("click", () => {
      this.setPaused(!this.paused);
      this.callbacks.onPauseChange(this.paused);
    });
    this.requireElement<HTMLButtonElement>("reset-button").addEventListener(
      "click",
      () => this.callbacks.onReset(),
    );
    this.requireElement<HTMLButtonElement>("fullscreen-button").addEventListener(
      "click",
      () => this.callbacks.onFullscreen(),
    );
    this.requireElement<HTMLButtonElement>("hardware-connect-button").addEventListener(
      "click",
      () => this.callbacks.onHardwareConnect(),
    );
    this.hardwareArmButton.addEventListener("click", () => this.callbacks.onHardwareArm());
    this.requireElement<HTMLButtonElement>("hardware-off-button").addEventListener(
      "click",
      () => this.callbacks.onHardwareOff(),
    );
    this.requireElement<HTMLButtonElement>("audience-reconnect-button").addEventListener(
      "click",
      () => this.callbacks.onAudienceReconnect(),
    );
  }

  private updateOutput(key: NumericSettingKey): void {
    const output = this.panel.querySelector<HTMLOutputElement>(`[data-output="${key}"]`);
    if (!output) {
      return;
    }
    const value = this.settings[key];
    output.value = key === "fishCount" || key === "crowdCount" || key === "seed"
      ? String(value)
      : value.toFixed(2);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      return;
    }
    if (event.key.toLowerCase() === "d") {
      this.panel.classList.toggle("is-hidden");
      this.updatePanelVisibility();
    }
  };

  private readonly handleControlsToggle = (): void => {
    this.panel.classList.toggle("is-hidden");
    this.updatePanelVisibility();
  };

  private updatePanelVisibility(): void {
    const visible = !this.panel.classList.contains("is-hidden");
    this.controlsToggle.textContent = visible ? "Hide controls (D)" : "Controls (D)";
    this.controlsToggle.setAttribute("aria-expanded", String(visible));
  }

  private setOutput(id: string, value: string): void {
    this.requireElement<HTMLOutputElement>(id).value = value;
  }

  private formatAge(value: number | null): string {
    return value === null ? "--" : `${Math.round(value)} ms`;
  }

  private requireElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Missing required element: #${id}`);
    }
    return element as T;
  }
}
