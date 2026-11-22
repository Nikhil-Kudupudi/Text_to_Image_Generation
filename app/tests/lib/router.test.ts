import { describe, it, expect } from "vitest";
import { parseHash } from "../../src/lib/router";
import type { Route } from "../../src/lib/router";

describe("parseHash", () => {
  it("parses known routes", () => {
    const cases: [string, Route][] = [
      ["#/results", "results"],
      ["#/workflow", "workflow"],
      ["#/generate", "generate"],
      ["#/home", "home"],
    ];
    for (const [h, r] of cases) expect(parseHash(h)).toBe(r);
  });
  it("falls back to home", () => {
    expect(parseHash("")).toBe("home");
    expect(parseHash("#")).toBe("home");
    expect(parseHash("#/")).toBe("home");
    expect(parseHash("#/nope")).toBe("home");
  });
});
