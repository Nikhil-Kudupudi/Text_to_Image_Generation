import { useMemo, useState } from "react";
import type { M3Results, Prompt, RenderRow } from "../../types";
import { EmptyState, Pill, Section, Segmented, SeriesDot } from "../../components/ui";
import { Lightbox, type LightboxItem } from "../../components/Lightbox";
import { configLabel, isModelConfig } from "../../lib/configs";
import { fmt } from "../../lib/format";
import { imageUrl, realUrl } from "../../lib/urls";
import { clipAt, hasImage, shortLabel } from "./data";
import { ImageFrame } from "./ImageFrame";
import { PromptPicker } from "./PromptPicker";

type Mode = "models" | "guidance";
const MODES: { value: Mode; label: string }[] = [
  { value: "models", label: "Models" },
  { value: "guidance", label: "Guidance" },
];

interface Tile {
  key: string;
  config: string | null; // null = real photo
  src: string;
  alt: string;
  chip: string;
  clip: number | null;
  available: boolean;
}

/** clip.real is keyed by the main prompt list; only trust it when the photo matches. */
function realClip(m3: M3Results, p: Prompt): number | null {
  return m3.prompts[p.idx]?.image_id === p.image_id ? clipAt(m3, "real", p.idx) : null;
}

function buildTiles(m3: M3Results, rows: RenderRow[], p: Prompt): Tile[] {
  const real: Tile = {
    key: "real", config: null, src: realUrl(p), alt: "Real photo", chip: "Real", clip: realClip(m3, p), available: true,
  };
  return [
    real,
    ...rows.map((r) => ({
      key: r.config,
      config: r.config,
      src: imageUrl(r.config, p.idx),
      alt: configLabel(r.config),
      chip: shortLabel(r.config),
      clip: clipAt(m3, r.config, p.idx),
      available: hasImage(r, p.idx),
    })),
  ];
}

export function CompareStrip({ m3 }: { m3: M3Results }) {
  const [mode, setMode] = useState<Mode>("models");
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState(0);
  const [open, setOpen] = useState<number | null>(null);

  const all = mode === "models" ? m3.prompts : m3.promptsGuidance;
  const rows = mode === "models" ? m3.models : m3.sweep;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? all.filter((p) => p.caption.toLowerCase().includes(q)) : all;
  }, [all, query]);
  const prompt: Prompt | undefined = filtered[Math.min(pos, filtered.length - 1)];

  const tiles = prompt ? buildTiles(m3, rows, prompt) : [];
  const shown = tiles.filter((t) => t.available);
  const items: LightboxItem[] = shown.map((t) => ({
    src: t.src,
    alt: t.alt,
    title: prompt?.caption,
    meta: t.clip != null ? `${t.alt} · CLIP ${fmt(t.clip, 3)}` : t.alt,
  }));

  const changeMode = (m: Mode) => {
    setMode(m);
    setPos(0);
    setOpen(null);
  };
  const changeQuery = (q: string) => {
    setQuery(q);
    setPos(0);
  };

  return (
    <Section id="compare" title="Compare" actions={<Segmented options={MODES} value={mode} onChange={changeMode} ariaLabel="Compare by" />}>
      <PromptPicker pos={pos} total={filtered.length} query={query} onQuery={changeQuery} onPos={setPos} />
      {!prompt ? (
        <EmptyState title={all.length ? "No match" : "No prompts"} />
      ) : (
        <>
          <p className="compare-prompt">
            <span className="compare-prompt-idx mono faint">#{prompt.idx}</span>
            <span>{prompt.caption}</span>
          </p>
          <div className="compare-row">
            {tiles.map((t) => (
              <div key={t.key} className="compare-tile" data-testid="compare-tile">
                <ImageFrame
                  src={t.src}
                  alt={t.alt}
                  available={t.available}
                  onClick={() => setOpen(shown.indexOf(t))}
                />
                <span className="tile-chip">
                  {t.config && isModelConfig(t.config) && <SeriesDot config={t.config} />}
                  {t.chip}
                </span>
                {t.clip != null && (
                  <span className="tile-clip">
                    <Pill>{fmt(t.clip, 3)}</Pill>
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      <Lightbox items={items} index={open} onClose={() => setOpen(null)} onIndex={setOpen} />
    </Section>
  );
}
