import { describe, expect, it } from "vitest";
import { SeededRandom } from "../src/core/random";

describe("SeededRandom", () => {
  it("reproduces the same sequence from the same seed", () => {
    const first = new SeededRandom(20260714);
    const second = new SeededRandom(20260714);

    const firstSequence = Array.from({ length: 12 }, () => first.next());
    const secondSequence = Array.from({ length: 12 }, () => second.next());

    expect(firstSequence).toEqual(secondSequence);
    expect(new Set(firstSequence).size).toBeGreaterThan(10);
  });
});
