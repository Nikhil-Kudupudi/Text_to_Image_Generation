import type { GenerateRequest, GenerateResponse, HealthResponse, Preset } from "../types";

const API = "/api";

/** FastAPI errors: { detail: string }, or { detail: [{ msg, loc }, ...] } for 422 validation errors. */
function detailOf(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("detail" in body)) return null;
  const d = (body as { detail: unknown }).detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    const msgs = d
      .map((x) => (x && typeof x === "object" && "msg" in x ? String((x as { msg: unknown }).msg) : null))
      .filter((m): m is string => Boolean(m));
    return msgs.length ? msgs.join("; ") : null;
  }
  return null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API + path, { cache: "no-store", ...init });
  if (!res.ok) {
    let detail: string | null = null;
    try {
      detail = detailOf(await res.json());
    } catch {
      // non-JSON error body
    }
    const status = res.statusText ? `HTTP ${res.status} ${res.statusText}` : `HTTP ${res.status}`;
    throw new Error(detail ?? status);
  }
  return (await res.json()) as T;
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}

export function getPresets(): Promise<Preset[]> {
  return request<Preset[]>("/presets");
}

/** Throws Error(detail) on non-2xx (409 busy, 422 validation, 5xx). */
export function generate(req: GenerateRequest): Promise<GenerateResponse> {
  return request<GenerateResponse>("/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
}

export function getHistory(): Promise<GenerateResponse[]> {
  return request<GenerateResponse[]>("/history");
}
