import { MODEL_META, isModelConfig } from "../../lib/configs";
import type { GenerateRequest, GenerateResponse, ModelConfig, Preset, Prompt } from "../../types";

/** The form keeps raw input strings; empty guidance/steps/seed means "let the server decide". */
export interface FormState {
  prompt: string;
  preset: ModelConfig;
  guidance: string;
  steps: string;
  seed: string;
}

export const DEFAULT_PRESET: ModelConfig = "sd_tuned";
export const FALLBACK_PLACEHOLDER = "a red bicycle leaning against a brick wall";
export const MAX_SEED = 2 ** 31 - 1;

export const EMPTY_FORM: FormState = { prompt: "", preset: DEFAULT_PRESET, guidance: "", steps: "", seed: "" };

const SAMPLERS: Record<string, string> = { pndm: "PNDM", euler_a: "Euler-a", ddim: "DDIM", euler: "Euler" };

export function presetName(id: string, presets: Preset[] = []): string {
  if (isModelConfig(id)) return MODEL_META[id].label;
  return presets.find((p) => p.id === id)?.label ?? id;
}

export function samplerName(sampler: string): string {
  return SAMPLERS[sampler] ?? sampler;
}

/** Switch preset and take its guidance/steps; prompt and seed stay. */
export function withPreset(form: FormState, preset: Preset): FormState {
  return { ...form, preset: preset.id, guidance: String(preset.guidance), steps: String(preset.steps) };
}

/** The preset to start with: sd_tuned when offered, otherwise the first. */
export function initialPreset(presets: Preset[], wanted: ModelConfig = DEFAULT_PRESET): Preset | undefined {
  return presets.find((p) => p.id === wanted) ?? presets[0];
}

export function fromResult(r: GenerateResponse): FormState {
  return { prompt: r.prompt, preset: r.preset, guidance: String(r.guidance), steps: String(r.steps), seed: String(r.seed) };
}

export function toRequest(form: FormState): GenerateRequest {
  const req: GenerateRequest = { prompt: form.prompt.trim(), preset: form.preset };
  if (form.guidance.trim() !== "") req.guidance = Number(form.guidance);
  if (form.steps.trim() !== "") req.steps = Number(form.steps);
  if (form.seed.trim() !== "") req.seed = Number(form.seed);
  return req;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * (MAX_SEED + 1));
}

/** SD presets share one pipeline, so only a change of family triggers a model load. */
export function needsLoad(loaded: string | null | undefined, preset: string): boolean {
  if (!loaded) return true;
  const family = (id: string) => (id.startsWith("sd_") ? "sd" : id);
  return family(loaded) !== family(preset);
}

/** Three evenly spaced captions, deterministic for a given `round` (prompts[0] is the placeholder). */
export function pickSuggestions(prompts: Prompt[], round: number, count = 3): string[] {
  const pool = prompts.length > count ? prompts.slice(1) : prompts;
  const n = pool.length;
  if (n <= count) return pool.map((p) => p.caption);
  const step = Math.floor(n / count);
  const start = (round * 7919) % n;
  return Array.from({ length: count }, (_, k) => pool[(start + k * step) % n].caption);
}
