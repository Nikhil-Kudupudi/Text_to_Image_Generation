// Reads the notebook output folders and turns them into one manifest the UI fetches.
// Nothing here writes into the output folders; they are read in place.
import fs from "node:fs";
import path from "node:path";

const MODEL_ORDER = ["sd_baseline", "sd_tuned", "sd_tuned_clipskip2", "ldm_bert", "amused"];
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

export function loadSources(appDir) {
  const cfg = JSON.parse(fs.readFileSync(path.join(appDir, "results.config.json"), "utf8"));
  const out = {};
  for (const [key, candidates] of Object.entries(cfg.sources)) {
    const list = Array.isArray(candidates) ? candidates : [candidates];
    const envDir = process.env[`RESULTS_${key.toUpperCase()}`];
    const found = [envDir, ...list]
      .filter(Boolean)
      .map((p) => path.resolve(appDir, p))
      .find((p) => fs.existsSync(p) && fs.statSync(p).isDirectory());
    out[key] = found ?? null;
  }
  return out;
}

export function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, j) => [h, coerce(r[j])])));
}

function coerce(v) {
  if (v === undefined || v === "") return null;
  return /^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(v) ? Number(v) : v;
}

const readCSV = (f) => (fs.existsSync(f) ? parseCSV(fs.readFileSync(f, "utf8")) : []);
const readJSON = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null);
const listImages = (dir) =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => IMAGE_EXT.test(f)).sort() : [];
const listDirs = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];

function guidanceOf(name) {
  const m = /^sweep_g([\d.]+)$/.exec(name);
  return m ? Number(m[1]) : null;
}

function buildM3(dir) {
  if (!dir) return null;
  const tables = path.join(dir, "tables");
  const imagesDir = path.join(dir, "images");
  const folders = listDirs(imagesDir);
  const counts = Object.fromEntries(folders.map((f) => [f, listImages(path.join(imagesDir, f)).length]));

  const genLog = readCSV(path.join(tables, "m3_generation_log.csv"));
  const sweepLog = readCSV(path.join(tables, "m3_sweep_log.csv"));
  const byConfig = (rows) => Object.fromEntries(rows.map((r) => [r.config, r]));
  const gen = byConfig(genLog);
  const sw = byConfig(sweepLog);

  const modelNames = [
    ...MODEL_ORDER.filter((c) => counts[c] || gen[c]),
    ...folders.filter((f) => !MODEL_ORDER.includes(f) && guidanceOf(f) === null),
  ];
  const models = modelNames.map((c) => ({ config: c, ...(gen[c] ?? {}), images: counts[c] ?? 0 }));
  const sweep = folders
    .filter((f) => guidanceOf(f) !== null)
    .sort((a, b) => guidanceOf(a) - guidanceOf(b))
    .map((c) => ({ config: c, ...(sw[c] ?? {}), guidance: guidanceOf(c), images: counts[c] ?? 0 }));

  const metricsJson = readJSON(path.join(tables, "m3_metrics.json"));
  const metrics = metricsJson?.metrics ?? readCSV(path.join(tables, "m3_metrics.csv"));

  const clip = {};
  for (const r of readCSV(path.join(tables, "m3_clip_per_image.csv"))) {
    (clip[r.config] ??= {})[r.idx] = r.clip;
  }

  return {
    models,
    sweep,
    prompts: readCSV(path.join(tables, "m3_prompts.csv")),
    promptsGuidance: readCSV(path.join(tables, "m3_prompts_guidance.csv")),
    metrics,
    settings: metricsJson?.settings ?? null,
    ranking: readCSV(path.join(tables, "m3_ranking.csv")),
    clip,
    plots: listImages(path.join(dir, "plots")),
  };
}

function buildM2(dir) {
  if (!dir) return null;
  const sweepDir = path.join(dir, "sweep");
  const rows = readCSV(path.join(sweepDir, "all_results.csv"));
  const grids = Object.fromEntries(
    listDirs(sweepDir)
      .filter((d) => fs.existsSync(path.join(sweepDir, d, "grid.png")))
      .map((d) => [d, `sweep/${d}/grid.png`]),
  );
  return {
    sweep: rows,
    summary: readJSON(path.join(dir, "tables", "milestone_2_sd15.json")),
    grids,
    plots: listImages(path.join(dir, "plots")),
  };
}

export function buildManifest(sources) {
  return {
    generatedAt: new Date().toISOString(),
    sources: Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, Boolean(v)])),
    m3: buildM3(sources.m3),
    m2: buildM2(sources.m2),
  };
}

// "/results/m3/images/sd_tuned/000.png" -> absolute file, refusing anything outside its source.
export function resolveFile(sources, urlPath) {
  const parts = decodeURIComponent(urlPath.split("?")[0]).replace(/^\/+/, "").split("/");
  const [, key, ...rest] = parts;
  const root = sources[key];
  if (!root || !rest.length) return null;
  const file = path.resolve(root, ...rest);
  if (!file.startsWith(root + path.sep)) return null;
  return fs.existsSync(file) && fs.statSync(file).isFile() ? file : null;
}

// For a static build: copy what the UI can request into dist/results.
export function copyResults(sources, manifest, outDir) {
  const copy = (src, dest) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  };
  const copyTree = (src, dest) => fs.existsSync(src) && fs.cpSync(src, dest, { recursive: true });
  if (sources.m3) {
    for (const sub of ["images", "plots", "tables"]) copyTree(path.join(sources.m3, sub), path.join(outDir, "m3", sub));
  }
  if (sources.m2) {
    copyTree(path.join(sources.m2, "plots"), path.join(outDir, "m2", "plots"));
    for (const rel of Object.values(manifest.m2?.grids ?? {})) copy(path.join(sources.m2, rel), path.join(outDir, "m2", rel));
  }
  if (sources.real && manifest.m3) {
    const names = new Set([...manifest.m3.prompts, ...manifest.m3.promptsGuidance].map((p) => p.image_512_path));
    for (const n of names) {
      const src = path.join(sources.real, n);
      if (fs.existsSync(src)) copy(src, path.join(outDir, "real", n));
    }
  }
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest));
}
