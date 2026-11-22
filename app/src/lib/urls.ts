import type { Prompt } from "../types";

/** URL of anything under the served results tree (dev plugin or dist/results). */
export function resultUrl(path: string): string {
  return import.meta.env.BASE_URL + "results/" + path.replace(/^\/+/, "");
}

/** Generated image `idx` of a milestone 3 config, e.g. results/m3/images/sd_tuned/007.png */
export function imageUrl(config: string, idx: number): string {
  return resultUrl(`m3/images/${encodeURIComponent(config)}/${String(idx).padStart(3, "0")}.png`);
}

/** The real COCO photo behind a prompt. */
export function realUrl(p: Pick<Prompt, "image_512_path">): string {
  return resultUrl(`real/${p.image_512_path}`);
}

/** A notebook plot from milestone 3 plots/. */
export function m3PlotUrl(name: string): string {
  return resultUrl(`m3/plots/${name}`);
}

/** Any milestone 2 file by its path relative to the m2 folder ("plots/x.png", "sweep/a/grid.png"). */
export function m2Url(rel: string): string {
  return resultUrl(`m2/${rel.replace(/^\/+/, "")}`);
}
