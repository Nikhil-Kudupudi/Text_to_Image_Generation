import { describe, it, expect } from "vitest";
import { resultUrl, imageUrl, realUrl, m3PlotUrl, m2Url } from "../../src/lib/urls";

describe("urls", () => {
  it("resultUrl prefixes results/", () => {
    expect(resultUrl("m3/x.png")).toMatch(/results\/m3\/x\.png$/);
    expect(resultUrl("m3/x.png").startsWith("/")).toBe(true);
  });
  it("imageUrl zero-pads the index", () => {
    expect(imageUrl("sd_tuned", 7).endsWith("results/m3/images/sd_tuned/007.png")).toBe(true);
    expect(imageUrl("sweep_g7.5", 123).endsWith("results/m3/images/sweep_g7.5/123.png")).toBe(true);
  });
  it("realUrl uses the real photo basename", () => {
    expect(realUrl({ image_512_path: "a.jpg" }).endsWith("results/real/a.jpg")).toBe(true);
  });
  it("m3PlotUrl and m2Url", () => {
    expect(m3PlotUrl("m3_ranking.png").endsWith("results/m3/plots/m3_ranking.png")).toBe(true);
    expect(m2Url("sweep/foo/grid.png").endsWith("results/m2/sweep/foo/grid.png")).toBe(true);
  });
});
