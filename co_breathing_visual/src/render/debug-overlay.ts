import type { InteractionSource, SimulationSettings } from "../core/types";
import type { InstallationOutputState } from "../simulation/output-mapping";
import type { SimulationWorld } from "../simulation/world";

export class DebugOverlay {
  private readonly context: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private pixelRatio = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("2D debug canvas is unavailable");
    }
    this.context = context;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.pixelRatio = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = Math.round(width * this.pixelRatio);
    this.canvas.height = Math.round(height * this.pixelRatio);
    this.context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
  }

  render(
    world: SimulationWorld,
    source: InteractionSource,
    settings: SimulationSettings,
    outputs: InstallationOutputState,
  ): void {
    this.context.clearRect(0, 0, this.width, this.height);
    this.drawOutputs(outputs);
    for (const person of world.people) {
      this.drawPerson(person);
    }
    if (!settings.showField) {
      return;
    }

    this.context.lineWidth = 1;
    this.context.strokeStyle = "rgba(92, 203, 205, 0.34)";
    for (const vector of world.normalizedFlowVectors()) {
      const startX = vector.position.x * this.width;
      const startY = vector.position.y * this.height;
      const endX = startX + vector.velocity.x * this.width * 0.08;
      const endY = startY + vector.velocity.y * this.height * 0.08;
      this.context.beginPath();
      this.context.moveTo(startX, startY);
      this.context.lineTo(endX, endY);
      this.context.stroke();
    }

    if (source.active && source.obstacleStrength > 0) {
      this.context.strokeStyle = "rgba(239, 184, 111, 0.64)";
      this.context.setLineDash([5, 5]);
      this.context.beginPath();
      this.context.ellipse(
        source.position.x * this.width,
        source.position.y * this.height,
        source.radius * this.height,
        source.radius * this.height,
        0,
        0,
        Math.PI * 2,
      );
      this.context.stroke();
      this.context.setLineDash([]);
    }
  }

  private drawOutputs(outputs: InstallationOutputState): void {
    const inset = 27;
    this.drawPump("L", "→", inset, this.height / 2, outputs.pumps.left);
    this.drawPump("R", "←", this.width - inset, this.height / 2, outputs.pumps.right);
    this.drawPump("T", "↓", this.width / 2, inset, outputs.pumps.top);
    this.drawPump("B", "↑", this.width / 2, this.height - inset, outputs.pumps.bottom);

    const mistText = outputs.atomizer.active
      ? "MIST ON"
      : outputs.atomizer.cooldownRemaining > 0
        ? `MIST COOLDOWN ${outputs.atomizer.cooldownRemaining.toFixed(1)}s`
        : outputs.atomizer.armed
          ? "MIST READY"
          : "MIST WAITING";
    const active = outputs.atomizer.active;
    this.context.save();
    this.context.font = "11px ui-monospace, monospace";
    const width = this.context.measureText(mistText).width + 18;
    this.context.fillStyle = active ? "rgba(197, 232, 237, 0.25)" : "rgba(5, 14, 16, 0.68)";
    this.context.strokeStyle = active ? "rgba(213, 245, 249, 0.92)" : "rgba(126, 180, 183, 0.42)";
    this.context.lineWidth = 1;
    this.context.beginPath();
    this.context.roundRect(10, 10, width, 26, 5);
    this.context.fill();
    this.context.stroke();
    this.context.fillStyle = active ? "rgba(231, 250, 252, 0.98)" : "rgba(164, 202, 204, 0.82)";
    this.context.fillText(mistText, 19, 27);
    this.context.restore();
  }

  private drawPump(
    label: string,
    arrow: string,
    x: number,
    y: number,
    intensity: number,
  ): void {
    const value = Math.min(Math.max(intensity, 0), 1);
    this.context.save();
    this.context.lineWidth = 1.25;
    this.context.fillStyle = `rgba(67, 191, 196, ${0.08 + value * 0.55})`;
    this.context.strokeStyle = value > 0.05
      ? `rgba(127, 231, 233, ${0.48 + value * 0.5})`
      : "rgba(111, 163, 165, 0.34)";
    this.context.beginPath();
    this.context.arc(x, y, 15, 0, Math.PI * 2);
    this.context.fill();
    this.context.stroke();

    this.context.textAlign = "center";
    this.context.textBaseline = "middle";
    this.context.font = "bold 13px ui-monospace, monospace";
    this.context.fillStyle = "rgba(211, 243, 244, 0.9)";
    this.context.fillText(arrow, x, y);
    this.context.font = "9px ui-monospace, monospace";
    this.context.fillStyle = "rgba(154, 202, 204, 0.78)";
    this.context.fillText(`${label} ${Math.round(value * 100)}%`, x, y + 23);
    this.context.restore();
  }

  private drawPerson(person: InteractionSource): void {
    if (!person.active) {
      return;
    }
    const x = person.position.x * this.width;
    const y = person.position.y * this.height;
    const radius = person.radius * this.height;
    this.context.fillStyle = "rgba(224, 145, 78, 0.13)";
    this.context.strokeStyle = "rgba(239, 184, 111, 0.74)";
    this.context.lineWidth = 1.4;
    this.context.setLineDash([5, 5]);
    this.context.beginPath();
    this.context.ellipse(x, y, radius, radius, 0, 0, Math.PI * 2);
    this.context.fill();
    this.context.stroke();
    this.context.setLineDash([]);

    this.context.fillStyle = "rgba(244, 205, 157, 0.9)";
    this.context.font = "10px ui-monospace, monospace";
    this.context.fillText(person.id, x + radius + 5, y + 3);
  }
}
