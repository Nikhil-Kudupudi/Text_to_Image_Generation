// Deterministic Manifest fixture for page/chart tests: fixtureManifest({ size: "smoke" | "full", partial? }).
import type { Manifest, MetricRow, RankRow, RenderRow, Prompt, SweepSettingRow } from "../../src/types";

const MODELS = [
  { config: "sd_baseline", label: "SD baseline", sampler: "pndm", steps: 50, encoder: "CLIP ViT-L/14 last layer", model: "stable-diffusion-v1-5/stable-diffusion-v1-5", res: 512 },
  { config: "sd_tuned", label: "SD tuned", sampler: "euler_a", steps: 30, encoder: "CLIP ViT-L/14 last layer", model: "stable-diffusion-v1-5/stable-diffusion-v1-5", res: 512 },
  { config: "sd_tuned_clipskip2", label: "SD tuned clip-skip", sampler: "euler_a", steps: 30, encoder: "CLIP ViT-L/14 penultimate layer", model: "stable-diffusion-v1-5/stable-diffusion-v1-5", res: 512 },
  { config: "ldm_bert", label: "LDM BERT", sampler: "ddim", steps: 50, encoder: "BERT", model: "CompVis/ldm-text2im-large-256", res: 256 },
  { config: "amused", label: "aMUSEd", sampler: "none", steps: 12, encoder: "CLIP ViT-L/14", model: "amused/amused-512", res: 512 },
];
const GUIDANCE_FULL = [1, 3, 5, 7.5, 11, 15];
const WORDS = ["cat", "dog", "bus", "pizza", "bench", "kite", "train", "lamp"];

function prompts(n: number): Prompt[] {
  return Array.from({ length: n }, (_, idx) => ({
    idx,
    image_id: 100000 + idx * 7,
    caption: `a ${WORDS[idx % WORDS.length]} number ${idx}`,
    image_512_path: `${String(100000 + idx * 7).padStart(12, "0")}.jpg`,
  }));
}

export function fixtureManifest({ size, partial = false }: { size: "smoke" | "full"; partial?: boolean }): Manifest {
  const full = size === "full";
  const nPrompts = full ? 500 : 8;
  const nGuidance = full ? 200 : 4;
  const guidanceVals = full ? GUIDANCE_FULL : [1, 7.5];

  const models: RenderRow[] = MODELS.map((m, i) => ({
    config: m.config, model: m.model, encoder: m.encoder, sampler: m.sampler, steps: m.steps,
    guidance: 7.5, resolution: m.res, n_images: nPrompts,
    seconds_total: +(nPrompts * (2.5 + i * 0.4)).toFixed(1), sec_per_image: +(2.5 + i * 0.4).toFixed(3),
    peak_vram_gb: 2.6, images: partial && i === 3 ? Math.floor(nPrompts / 2) : nPrompts,
  }));
  const sweep = guidanceVals.map((g, i) => ({
    config: `sweep_g${g}`, model: MODELS[1].model, encoder: MODELS[1].encoder, sampler: "euler_a", steps: 30,
    guidance: g, resolution: 512, n_images: nGuidance, seconds_total: +(nGuidance * (1.7 + i * 0.2)).toFixed(1),
    sec_per_image: +(1.7 + i * 0.2).toFixed(3), peak_vram_gb: 2.6, images: nGuidance,
  }));

  const metrics: MetricRow[] = [];
  const rank: RankRow[] = [];
  const clip: Record<string, Record<number, number>> = {};
  if (!partial) {
    MODELS.forEach((m, i) => {
      metrics.push({
        config: m.config, group: "models", label: m.label, N: nPrompts, FID: 360 + i * 9.5, IS_mean: 3.4 - i * 0.2,
        IS_std: 0.1 + i * 0.05, CLIP_mean: 0.33 - i * 0.004, CLIP_std: 0.03, sec_per_image: 2.5 + i * 0.4,
        resolution: m.res, encoder: m.encoder, guidance: 7.5,
      });
      rank.push({
        question: "models", overall_rank: i + 1, config: m.config, label: m.label, rank_FID: i + 1, rank_IS: i + 1,
        rank_CLIP: i + 1, avg_rank: i + 1, N: nPrompts, FID: 360 + i * 9.5, IS_mean: 3.4 - i * 0.2,
        CLIP_mean: 0.33 - i * 0.004, sec_per_image: 2.5 + i * 0.4,
      });
      clip[m.config] = Object.fromEntries(Array.from({ length: nPrompts }, (_, k) => [k, +(0.3 + ((k * 7 + i * 3) % 10) / 200).toFixed(4)]));
    });
    guidanceVals.forEach((g, i) => {
      metrics.push({
        config: `sweep_g${g}`, group: "guidance", label: `g = ${g}`, N: nGuidance, FID: 400 - i * 8, IS_mean: 2.8 + i * 0.1,
        IS_std: 0.2, CLIP_mean: 0.28 + i * 0.005, CLIP_std: 0.03, sec_per_image: 1.7 + i * 0.2, resolution: 512,
        encoder: MODELS[1].encoder, guidance: g,
      });
      rank.push({
        question: "guidance", overall_rank: guidanceVals.length - i, config: `sweep_g${g}`, label: `g = ${g}`,
        rank_FID: guidanceVals.length - i, rank_IS: guidanceVals.length - i, rank_CLIP: guidanceVals.length - i,
        avg_rank: guidanceVals.length - i, N: nGuidance, FID: 400 - i * 8, IS_mean: 2.8 + i * 0.1,
        CLIP_mean: 0.28 + i * 0.005, sec_per_image: 1.7 + i * 0.2,
      });
      clip[`sweep_g${g}`] = Object.fromEntries(Array.from({ length: nGuidance }, (_, k) => [k, +(0.27 + ((k * 3 + i) % 10) / 200).toFixed(4)]));
    });
    [MODELS[1], MODELS[2]].forEach((m, i) =>
      rank.push({
        question: "embedding", overall_rank: i + 1, config: m.config, label: m.label, rank_FID: i + 1, rank_IS: i + 1,
        rank_CLIP: i + 1, avg_rank: i + 1, N: nPrompts, FID: 360 + i * 9.5, IS_mean: 3.4 - i * 0.2,
        CLIP_mean: 0.33 - i * 0.004, sec_per_image: 2.8,
      }),
    );
  }

  const m2sweep: SweepSettingRow[] = [
    ...[1, 2, 4, 7.5, 12].map((g, i) => ({
      label: `pndm_s50_g${g}_leading`, sampler: "pndm", steps: 50, guidance: g, guidance_rescale: 0,
      scheduler_kwargs: "{'timestep_spacing': 'leading'}", clip_score_mean: 0.27 + i * 0.01, clip_score_std: 0.02,
      seconds: 60 + i * 10, status: "ok", error: null, axis: "guidance",
    })),
    ...["pndm", "ddim", "euler", "euler_a", "dpmpp_2m", "unipc"].map((s, i) => ({
      label: `${s}_s30_g7.5`, sampler: s, steps: 30, guidance: 7.5, guidance_rescale: 0, scheduler_kwargs: null,
      clip_score_mean: 0.3 + i * 0.002, clip_score_std: 0.02, seconds: 40 + i * 3, status: "ok", error: null, axis: "sampler",
    })),
  ];

  return {
    generatedAt: "2026-01-01T00:00:00.000Z",
    sources: { m3: true, m2: true, real: true },
    m3: {
      models, sweep, prompts: prompts(nPrompts), promptsGuidance: prompts(nGuidance), metrics,
      settings: { seed: 42, smoke: !full, clip_model: "openai/clip-vit-base-patch32" }, ranking: rank, clip,
      plots: ["m3_fid_is_bars.png", "m3_clip_alignment.png", "m3_ranking.png", "m3_guidance_sensitivity.png"],
    },
    m2: {
      sweep: m2sweep,
      summary: {
        baseline: { config: "pndm_s50_g7.5_leading", clip_text_generated: 0.3, seconds: 100 },
        best: { config: "euler_a_s30_g7.5", clip_text_generated: 0.31 },
        reference_real_photos: 0.32, total_gpu_minutes: 42,
      },
      grids: { "pndm_s50_g1_leading": "sweep/pndm_s50_g1_leading/grid.png" },
      plots: ["m2_guidance.png"],
    },
  };
}
