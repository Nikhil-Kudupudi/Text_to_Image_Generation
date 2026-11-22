// The contract between server/results.mjs (which builds the manifest) and every page.
// Change this file first, then the producer, then the consumers.

export type ModelConfig = "sd_baseline" | "sd_tuned" | "sd_tuned_clipskip2" | "ldm_bert" | "amused";

/** One rendered configuration: a row of m3_generation_log.csv / m3_sweep_log.csv plus an image count. */
export interface RenderRow {
  config: string;
  model?: string;
  encoder?: string;
  sampler?: string;
  steps?: number;
  guidance?: number;
  resolution?: number;
  n_images?: number;
  seconds_total?: number;
  sec_per_image?: number;
  peak_vram_gb?: number;
  /** PNG files found on disk in images/<config>/ */
  images: number;
}

export interface Prompt {
  idx: number;
  image_id: number;
  caption: string;
  /** basename of the real COCO photo, served at /results/real/<image_512_path> */
  image_512_path: string;
}

export interface MetricRow {
  config: string;
  group: "models" | "guidance";
  label: string;
  N: number;
  FID: number | null;
  IS_mean: number | null;
  IS_std: number | null;
  CLIP_mean: number | null;
  CLIP_std: number | null;
  sec_per_image: number | null;
  resolution: number | null;
  encoder: string | null;
  guidance: number | null;
}

export interface RankRow {
  question: "models" | "guidance" | "embedding";
  overall_rank: number;
  config: string;
  label: string;
  rank_FID: number;
  rank_IS: number;
  rank_CLIP: number;
  avg_rank: number;
  N: number;
  FID: number;
  IS_mean: number;
  CLIP_mean: number;
  sec_per_image: number | null;
}

export interface M3Results {
  models: RenderRow[];
  sweep: (RenderRow & { guidance: number })[];
  prompts: Prompt[];
  promptsGuidance: Prompt[];
  metrics: MetricRow[];
  settings: Record<string, unknown> | null;
  ranking: RankRow[];
  /** clip[config][idx] = per-image CLIP score (cosine, ~0.3) */
  clip: Record<string, Record<number, number>>;
  /** file names in m3 plots/, served at /results/m3/plots/<name> */
  plots: string[];
}

/** One row of the earlier settings sweep (milestone 2 all_results.csv). */
export interface SweepSettingRow {
  label: string;
  sampler: string;
  steps: number;
  guidance: number;
  guidance_rescale: number;
  scheduler_kwargs: string | null;
  clip_score_mean: number | null;
  clip_score_std: number | null;
  seconds: number | null;
  status: string;
  error: string | null;
  axis: "guidance" | "sampler" | "schedule" | string;
}

export interface M2Results {
  sweep: SweepSettingRow[];
  summary: {
    baseline?: { config: string; clip_text_generated: number; seconds: number };
    best?: { config: string; clip_text_generated: number };
    reference_real_photos?: number;
    total_gpu_minutes?: number;
    [k: string]: unknown;
  } | null;
  /** sweep label -> relative path of its 10-image grid, served at /results/m2/<path> */
  grids: Record<string, string>;
  plots: string[];
}

// ---- Live generation API (backend/app.py, proxied by Vite at /api) ----

export interface Preset {
  id: ModelConfig;
  label: string;
  model: string;
  sampler: string;
  steps: number;
  guidance: number;
  resolution: number;
  /** 1 = CLIP last layer, 2 = penultimate layer; null for non-CLIP models */
  clip_layer: 1 | 2 | null;
}

export interface HealthResponse {
  ok: boolean;
  device: "cuda" | "mps" | "cpu";
  gpu: string | null;
  /** preset id of the pipeline currently held in memory */
  loaded: string | null;
  busy: boolean;
}

export interface GenerateRequest {
  prompt: string;
  preset: ModelConfig;
  guidance?: number;
  steps?: number;
  seed?: number;
}

export interface GenerateResponse {
  id: string;
  /** URL path of the PNG, e.g. /api/images/<id>.png */
  image: string;
  prompt: string;
  preset: ModelConfig;
  guidance: number;
  steps: number;
  seed: number;
  seconds: number;
  /** CLIP ViT-B/32 cosine between prompt and image, same judge as the notebooks */
  clip: number | null;
  created: string;
}

export interface ApiError {
  detail: string;
}

export interface Manifest {
  generatedAt: string;
  sources: Record<"m3" | "m2" | "real", boolean>;
  m3: M3Results | null;
  m2: M2Results | null;
}
