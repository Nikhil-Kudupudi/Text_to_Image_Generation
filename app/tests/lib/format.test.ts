import { describe, it, expect } from "vitest";
import { fmt, fmtSeconds, plotTitle } from "../../src/lib/format";

describe("format", () => {
  it("fmt renders null/undefined/NaN as an em dash", () => {
    expect(fmt(null)).toBe("—");
    expect(fmt(undefined)).toBe("—");
    expect(fmt(NaN)).toBe("—");
  });
  it("fmt uses fixed digits, default 2", () => {
    expect(fmt(0.31987, 3)).toBe("0.320");
    expect(fmt(3.14159)).toBe("3.14");
    expect(fmt(0)).toBe("0.00");
  });
  it("fmtSeconds", () => {
    expect(fmtSeconds(2.798)).toBe("2.8 s");
    expect(fmtSeconds(null)).toBe("—");
  });
  it("plotTitle", () => {
    expect(plotTitle("m3_fid_is_bars.png")).toBe("FID IS bars");
  });
});
