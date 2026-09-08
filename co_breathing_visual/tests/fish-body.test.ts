import { describe, expect, it } from "vitest";
import { angleDifference } from "../src/core/math";
import { FishBody } from "../src/simulation/fish-body";

describe("FishBody", () => {
  it("keeps its 14-joint chain finite and constrained during sustained swimming", () => {
    const body = new FishBody({ x: 0.8, y: 0.5 }, 0, 1.7);
    const head = { x: 0.8, y: 0.5 };
    let maximumSegmentError = 0;
    let maximumBend = 0;

    for (let step = 0; step < 60 * 120; step += 1) {
      const time = step / 60;
      const heading = Math.sin(time * 0.3) * 0.75;
      head.x += Math.cos(heading) * 0.08 / 60;
      head.y += Math.sin(heading) * 0.08 / 60;
      body.update(head, heading, Math.cos(time * 0.3) * 0.225, time * 8, 1 / 60, 0.36, 0.2);
      maximumSegmentError = Math.max(maximumSegmentError, body.segmentError());

      for (let index = 2; index < body.jointCount; index += 1) {
        const grandparent = body.joint(index - 2);
        const parent = body.joint(index - 1);
        const child = body.joint(index);
        const parentAngle = Math.atan2(parent.y - grandparent.y, parent.x - grandparent.x);
        const childAngle = Math.atan2(child.y - parent.y, child.x - parent.x);
        maximumBend = Math.max(maximumBend, Math.abs(angleDifference(parentAngle, childAngle)));
      }
    }

    expect(body.jointCount).toBe(14);
    expect(body.isFinite()).toBe(true);
    expect(maximumSegmentError).toBeLessThan(0.0015);
    expect(maximumBend).toBeLessThan(0.72);
  });
});
