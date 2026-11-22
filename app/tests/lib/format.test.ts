import { describe, it, expect } from "vitest";
import { fmt, fmtGb, fmtSeconds, isNum, plotTitle } from "../../src/lib/format";

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
  it("fmtGb and isNum", () => {
    expect(fmtGb(2.63)).toBe("2.6 GB");
    expect(fmtGb(null)).toBe("—");
    expect(isNum(0)).toBe(true);
    expect(isNum(Infinity)).toBe(false);
    expect(isNum("1")).toBe(false);
  });
  it("plotTitle", () => {
    expect(plotTitle("m3_fid_is_bars.png")).toBe("FID IS bars");
  });
});
