import { describe, expect, it } from "vitest";
import { clientPointToNormalized } from "../src/input/coordinate-mapper";

describe("clientPointToNormalized", () => {
  it("maps CSS client coordinates independently of canvas backing resolution", () => {
    const bounds = { left: 120.5, top: 48.25, width: 960, height: 540 };

    expect(clientPointToNormalized(360.5, 183.25, bounds)).toEqual({ x: 0.25, y: 0.25 });
    expect(clientPointToNormalized(840.5, 453.25, bounds)).toEqual({ x: 0.75, y: 0.75 });
  });

  it("clamps pointer positions outside the visual stage", () => {
    const bounds = { left: 100, top: 50, width: 800, height: 400 };

    expect(clientPointToNormalized(-20, 700, bounds)).toEqual({ x: 0, y: 1 });
  });
});
