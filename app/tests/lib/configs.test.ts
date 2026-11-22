import { describe, it, expect } from "vitest";
import { MODEL_ORDER, MODEL_META, configLabel, seriesVar } from "../../src/lib/configs";

describe("configs", () => {
  it("MODEL_ORDER is the fixed five-model order", () => {
    expect([...MODEL_ORDER]).toEqual(["sd_baseline", "sd_tuned", "sd_tuned_clipskip2", "ldm_bert", "amused"]);
  });
  it("MODEL_META has an entry per model", () => {
    for (const c of MODEL_ORDER) expect((MODEL_META as Record<string, unknown>)[c]).toBeTruthy();
  });
  it("configLabel", () => {
    expect(configLabel("sweep_g7.5")).toBe("g = 7.5");
    expect(configLabel("sweep_g1")).toBe("g = 1");
    expect(configLabel("sd_tuned")).toBe("SD tuned");
  });
  it("seriesVar maps models to series colours, unknown to muted", () => {
    expect(seriesVar("sd_baseline")).toBe("var(--series-1)");
    expect(seriesVar("amused")).toBe("var(--series-5)");
    expect(seriesVar("something_else")).toBe("var(--series-muted)");
  });
});
