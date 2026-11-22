import { describe, expect, it } from "vitest";
import { linear, niceTicks } from "../../src/components/charts/scale";

describe("chart scale helpers", () => {
  it("niceTicks covers the domain with clean steps", () => {
    expect(niceTicks(0, 36)).toEqual([0, 10, 20, 30, 40]);
    expect(niceTicks(0.26, 0.31)).toEqual([0.26, 0.27, 0.28, 0.29, 0.3, 0.31]);
  });

  it("niceTicks handles a zero-width domain", () => {
    const t = niceTicks(5, 5);
    expect(t.length).toBeGreaterThan(1);
    expect(t[0]).toBeLessThanOrEqual(5);
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(5);
  });

  it("linear maps domain to range", () => {
    const s = linear([0, 10], [100, 200]);
    expect(s(5)).toBe(150);
    expect(linear([3, 3], [0, 10])(3)).toBe(0);
  });
});
