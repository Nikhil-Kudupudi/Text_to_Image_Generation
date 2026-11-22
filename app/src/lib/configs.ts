import type { ModelConfig } from "../types";

export const MODEL_ORDER: ModelConfig[] = ["sd_baseline", "sd_tuned", "sd_tuned_clipskip2", "ldm_bert", "amused"];

export const MODEL_META: Record<ModelConfig, { label: string; short: string }> = {
  sd_baseline: { label: "SD baseline", short: "Base" },
  sd_tuned: { label: "SD tuned", short: "Tuned" },
  sd_tuned_clipskip2: { label: "SD tuned clip-skip", short: "Skip-2" },
  ldm_bert: { label: "LDM-BERT", short: "LDM" },
  amused: { label: "aMUSEd", short: "aMUSEd" },
};

export function isModelConfig(config: string): config is ModelConfig {
  return (MODEL_ORDER as string[]).includes(config);
}

/** "sd_tuned" -> "SD tuned", "sweep_g7.5" -> "g = 7.5", anything else unchanged. */
export function configLabel(config: string): string {
  if (isModelConfig(config)) return MODEL_META[config].label;
  const m = /^sweep_g([\d.]+)$/.exec(config);
  return m ? `g = ${Number(m[1])}` : config;
}

/** CSS colour of a config's series: var(--series-1..5) in MODEL_ORDER, else var(--series-muted). */
export function seriesVar(config: string): string {
  const i = (MODEL_ORDER as string[]).indexOf(config);
  return i >= 0 ? `var(--series-${i + 1})` : "var(--series-muted)";
}
