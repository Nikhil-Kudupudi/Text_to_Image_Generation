import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseCSV, buildManifest, resolveFile, loadSources } from "../../server/results.mjs";

describe("parseCSV", () => {
  it("handles quoted commas and escaped quotes", () => {
    const rows = parseCSV('a,b\n"x, y","say ""hi"""\n');
    expect(rows).toEqual([{ a: "x, y", b: 'say "hi"' }]);
  });
  it("handles CRLF line endings", () => {
    const rows = parseCSV("a,b\r\n1,2\r\n3,4\r\n");
    expect(rows).toEqual([{ a: 1, b: 2 }, { a: 3, b: 4 }]);
  });
  it("coerces numbers and maps empty to null", () => {
    const [r] = parseCSV("n,f,e,s,x\n3,0.5,,abc,1e-3\n");
    expect(r).toEqual({ n: 3, f: 0.5, e: null, s: "abc", x: 0.001 });
  });
  it("returns [] for empty input", () => {
    expect(parseCSV("")).toEqual([]);
  });
});

describe("server with temp dirs", () => {
  let tmp, m3, m2, real;
  const write = (f, s) => {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, s);
  };

  beforeEach(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "results-test-")));
    m3 = path.join(tmp, "m3");
    m2 = path.join(tmp, "m2");
    real = path.join(tmp, "real");
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  function fullM3() {
    // folder order deliberately scrambled relative to the expected output order
    for (const c of ["amused", "sd_tuned", "sd_baseline", "sweep_g7.5", "sweep_g1", "sweep_g11"]) {
      write(path.join(m3, "images", c, "000.png"), "x");
      write(path.join(m3, "images", c, "001.png"), "x");
    }
    write(path.join(m3, "images", "sd_tuned", "notes.txt"), "ignored");
    write(path.join(m3, "plots", "m3_ranking.png"), "x");
    write(
      path.join(m3, "tables", "m3_generation_log.csv"),
      "config,model,sampler,steps,guidance,n_images\nsd_tuned,sd15,euler_a,30,7.5,2\namused,amused,none,12,7.5,2\n",
    );
    write(path.join(m3, "tables", "m3_sweep_log.csv"), "config,guidance,n_images\nsweep_g1,1.0,2\n");
    write(
      path.join(m3, "tables", "m3_prompts.csv"),
      'idx,image_id,caption,image_512_path\n0,1,a cat,a.jpg\n1,2,"a dog, big",b.jpg\n',
    );
    write(
      path.join(m3, "tables", "m3_metrics.json"),
      JSON.stringify({ settings: { seed: 42 }, metrics: [{ config: "sd_tuned", group: "models", FID: 1.5 }] }),
    );
    write(path.join(m3, "tables", "m3_ranking.csv"), "question,overall_rank,config\nmodels,1,sd_tuned\n");
    write(path.join(m3, "tables", "m3_clip_per_image.csv"), "config,group,idx,clip\nsd_tuned,models,0,0.31\nsd_tuned,models,1,0.29\n");
  }

  it("builds m3 with fixed model order, sorted sweep and numeric clip", () => {
    fullM3();
    const mf = buildManifest({ m3, m2: null, real: null });
    expect(mf.sources).toEqual({ m3: true, m2: false, real: false });
    expect(mf.m2).toBeNull();
    expect(mf.m3.models.map((r) => r.config)).toEqual(["sd_baseline", "sd_tuned", "amused"]);
    expect(mf.m3.models.every((r) => r.images === 2)).toBe(true);
    expect(mf.m3.sweep.map((r) => r.guidance)).toEqual([1, 7.5, 11]);
    expect(mf.m3.sweep[0].config).toBe("sweep_g1");
    expect(typeof mf.m3.clip.sd_tuned[0]).toBe("number");
    expect(mf.m3.clip.sd_tuned[0]).toBeCloseTo(0.31);
    expect(mf.m3.prompts[1].caption).toBe("a dog, big");
    expect(mf.m3.metrics[0].FID).toBe(1.5);
    expect(mf.m3.settings).toEqual({ seed: 42 });
    expect(mf.m3.ranking[0].config).toBe("sd_tuned");
    expect(mf.m3.plots).toEqual(["m3_ranking.png"]);
  });

  it("returns empty arrays when tables are missing", () => {
    write(path.join(m3, "images", "sd_tuned", "000.png"), "x");
    const mf = buildManifest({ m3, m2: null, real: null });
    expect(mf.m3.prompts).toEqual([]);
    expect(mf.m3.promptsGuidance).toEqual([]);
    expect(mf.m3.metrics).toEqual([]);
    expect(mf.m3.ranking).toEqual([]);
    expect(mf.m3.clip).toEqual({});
    expect(mf.m3.plots).toEqual([]);
    expect(mf.m3.settings).toBeNull();
    expect(mf.m3.models).toHaveLength(1);
  });

  it("gives m3: null when the source is null", () => {
    const mf = buildManifest({ m3: null, m2: null, real: null });
    expect(mf.m3).toBeNull();
    expect(mf.sources.m3).toBe(false);
  });

  it("builds m2 sweep rows, grids and summary", () => {
    write(path.join(m2, "sweep", "all_results.csv"), "label,guidance,axis\nfoo,4.0,guidance\n");
    write(path.join(m2, "sweep", "foo", "grid.png"), "x");
    write(path.join(m2, "sweep", "bar", "other.png"), "x");
    write(path.join(m2, "tables", "milestone_2_sd15.json"), JSON.stringify({ total_gpu_minutes: 5 }));
    const mf = buildManifest({ m3: null, m2, real: null });
    expect(mf.m2.sweep).toEqual([{ label: "foo", guidance: 4, axis: "guidance" }]);
    expect(mf.m2.grids).toEqual({ foo: "sweep/foo/grid.png" });
    expect(mf.m2.summary).toEqual({ total_gpu_minutes: 5 });
  });

  it("resolveFile serves files, rejects traversal, returns null for missing", () => {
    write(path.join(m3, "images", "sd_tuned", "000.png"), "x");
    write(path.join(tmp, "secret.txt"), "s");
    const sources = { m3, m2: null, real };
    const ok = resolveFile(sources, "/results/m3/images/sd_tuned/000.png?v=1");
    expect(ok).toBe(path.join(m3, "images", "sd_tuned", "000.png"));
    expect(resolveFile(sources, "/results/m3/../secret.txt")).toBeNull();
    expect(resolveFile(sources, "/results/m3/%2e%2e/secret.txt")).toBeNull();
    expect(resolveFile(sources, "/results/m3/images/sd_tuned/999.png")).toBeNull();
    expect(resolveFile(sources, "/results/m3/images/sd_tuned")).toBeNull();
    expect(resolveFile(sources, "/results/m2/x.png")).toBeNull();
    expect(resolveFile(sources, "/results/nope/x.png")).toBeNull();
  });

  it("loadSources picks the first existing candidate", () => {
    const app = path.join(tmp, "app");
    fs.mkdirSync(path.join(tmp, "good"));
    write(path.join(app, "results.config.json"), JSON.stringify({ sources: { m3: ["../missing", "../good"], m2: "../absent" } }));
    const s = loadSources(app);
    expect(s.m3).toBe(path.join(tmp, "good"));
    expect(s.m2).toBeNull();
  });
});
