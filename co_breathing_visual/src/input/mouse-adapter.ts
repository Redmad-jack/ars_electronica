import { clampMagnitude, lerpVec, subtract, type Vec2 } from "../core/math";
import type { InteractionMode, InteractionSource, SimulationSettings } from "../core/types";
import { clientPointToNormalized } from "./coordinate-mapper";

export interface PointerMotionSample {
  position: Vec2;
  velocity: Vec2;
}

export class MouseInputAdapter {
  private position: Vec2 = { x: 0.5, y: 0.5 };
  private velocity: Vec2 = { x: 0, y: 0 };
  private previousPosition: Vec2 = { x: 0.5, y: 0.5 };
  private previousTime = performance.now();
  private lastMoveTime = 0;
  private active = false;
  private dragging = false;
  private mode: InteractionMode = "both";
  private readonly pendingMotionSamples: PointerMotionSample[] = [];

  constructor(private readonly element: HTMLElement) {
    this.element.addEventListener("pointerenter", this.handlePointerEnter);
    this.element.addEventListener("pointerleave", this.handlePointerLeave);
    this.element.addEventListener("pointerdown", this.handlePointerDown);
    this.element.addEventListener("pointermove", this.handlePointerMove);
    this.element.addEventListener("pointerup", this.handlePointerUp);
    this.element.addEventListener("pointercancel", this.handlePointerUp);
  }

  dispose(): void {
    this.element.removeEventListener("pointerenter", this.handlePointerEnter);
    this.element.removeEventListener("pointerleave", this.handlePointerLeave);
    this.element.removeEventListener("pointerdown", this.handlePointerDown);
    this.element.removeEventListener("pointermove", this.handlePointerMove);
    this.element.removeEventListener("pointerup", this.handlePointerUp);
    this.element.removeEventListener("pointercancel", this.handlePointerUp);
  }

  setMode(mode: InteractionMode): void {
    this.mode = mode;
  }

  tick(): void {
    if (!this.dragging || performance.now() - this.lastMoveTime > 70) {
      this.velocity = lerpVec(this.velocity, { x: 0, y: 0 }, 0.22);
    }
  }

  consumeFlowSamples(settings: SimulationSettings): InteractionSource[] {
    const samples = this.pendingMotionSamples.splice(0);
    const flowEnabled = this.mode === "flow" || this.mode === "both";
    if (!flowEnabled) {
      return [];
    }
    return samples.map((sample, index) => ({
      id: `mouse-motion-${index}`,
      position: sample.position,
      velocity: sample.velocity,
      radius: settings.obstacleRadius,
      obstacleStrength: 0,
      flowStrength: settings.flowInjection,
      active: true,
    }));
  }

  source(settings: SimulationSettings): InteractionSource {
    const obstacleEnabled = this.mode === "obstacle" || this.mode === "both";
    const flowEnabled = this.mode === "flow" || this.mode === "both";
    return {
      id: "mouse",
      position: { ...this.position },
      velocity: { ...this.velocity },
      radius: settings.obstacleRadius,
      obstacleStrength: obstacleEnabled ? 1 : 0,
      flowStrength: flowEnabled && this.dragging ? settings.flowInjection : 0,
      active: this.active,
    };
  }

  private anchorPosition(event: PointerEvent): void {
    const bounds = this.element.getBoundingClientRect();
    const nextPosition = clientPointToNormalized(event.clientX, event.clientY, bounds);
    this.position = nextPosition;
    this.previousPosition = nextPosition;
    this.previousTime = event.timeStamp;
    this.velocity = { x: 0, y: 0 };
  }

  private updatePosition(event: PointerEvent, recordMotion: boolean): void {
    const bounds = this.element.getBoundingClientRect();
    const nextPosition = clientPointToNormalized(event.clientX, event.clientY, bounds);
    const eventTime = Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now();
    const deltaSeconds = Math.max((eventTime - this.previousTime) / 1000, 1 / 240);
    const measuredVelocity = clampMagnitude(
      {
        x: (nextPosition.x - this.previousPosition.x) / deltaSeconds,
        y: (nextPosition.y - this.previousPosition.y) / deltaSeconds,
      },
      2.5,
    );

    this.velocity = lerpVec(this.velocity, measuredVelocity, 0.38);
    this.position = nextPosition;
    this.previousPosition = nextPosition;
    this.previousTime = eventTime;
    this.lastMoveTime = performance.now();

    if (recordMotion) {
      const movement = subtract(nextPosition, this.pendingMotionSamples.at(-1)?.position ?? this.previousPosition);
      if (Math.hypot(movement.x, movement.y) > 1e-5 || this.pendingMotionSamples.length === 0) {
        this.pendingMotionSamples.push({ position: { ...nextPosition }, velocity: { ...this.velocity } });
        if (this.pendingMotionSamples.length > 32) {
          this.pendingMotionSamples.shift();
        }
      }
    }
  }

  private readonly handlePointerEnter = (event: PointerEvent): void => {
    this.active = true;
    this.anchorPosition(event);
  };

  private readonly handlePointerLeave = (): void => {
    this.active = false;
    this.dragging = false;
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.active = true;
    this.dragging = true;
    this.pendingMotionSamples.length = 0;
    this.element.setPointerCapture(event.pointerId);
    this.anchorPosition(event);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    this.active = true;
    const coalescedEvents = event.getCoalescedEvents?.() ?? [];
    for (const sample of coalescedEvents) {
      this.updatePosition(sample, this.dragging);
    }
    const lastSample = coalescedEvents.at(-1);
    if (
      !lastSample ||
      lastSample.clientX !== event.clientX ||
      lastSample.clientY !== event.clientY ||
      lastSample.timeStamp !== event.timeStamp
    ) {
      this.updatePosition(event, this.dragging);
    }
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    this.dragging = false;
    if (this.element.hasPointerCapture(event.pointerId)) {
      this.element.releasePointerCapture(event.pointerId);
    }
  };
}
