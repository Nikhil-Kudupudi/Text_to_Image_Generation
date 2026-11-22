import { useMemo, useState } from "react";
import { Lightbox, type LightboxItem } from "../../components/Lightbox";
import { Pill, Section, Thumb } from "../../components/ui";
import { fmt, fmtSeconds } from "../../lib/format";
import type { GenerateResponse, Preset } from "../../types";
import { presetName } from "./form";
import { GenIcon } from "./icons";

/** Earlier live generations, newest first. A thumb opens the Lightbox; the corner button reuses its settings. */
export function HistoryStrip({
  items,
  presets,
  onReuse,
}: {
  items: GenerateResponse[];
  presets: Preset[];
  onReuse(r: GenerateResponse): void;
}) {
  const [index, setIndex] = useState<number | null>(null);

  const lightboxItems = useMemo<LightboxItem[]>(
    () =>
      items.map((r) => ({
        src: r.image,
        alt: r.prompt,
        title: r.prompt,
        meta: [
          presetName(r.preset, presets),
          `CLIP ${fmt(r.clip, 3)}`,
          fmtSeconds(r.seconds),
          `g ${r.guidance}`,
          `${r.steps} steps`,
          `seed ${r.seed}`,
        ].join(" · "),
      })),
    [items, presets],
  );

  if (items.length === 0) return null;

  return (
    <Section id="history" title="History" actions={<Pill>{items.length}</Pill>}>
      <ul className="gen-history">
        {items.map((r, i) => (
          <li key={r.id} className="gen-history-item" data-testid="history-item">
            <Thumb src={r.image} alt={r.prompt} onClick={() => setIndex(i)} />
            <button
              type="button"
              className="icon-button gen-reuse"
              aria-label={`Reuse settings: ${r.prompt}`}
              title="Reuse settings"
              onClick={() => onReuse(r)}
            >
              <GenIcon name="reuse" size={14} />
            </button>
          </li>
        ))}
      </ul>
      <Lightbox
        items={lightboxItems}
        index={index}
        onClose={() => setIndex(null)}
        onIndex={setIndex}
        actions={
          index !== null && items[index] ? (
            <button
              type="button"
              className="button lightbox-action"
              onClick={() => {
                onReuse(items[index]);
                setIndex(null);
              }}
            >
              <GenIcon name="reuse" size={16} />
              Reuse settings
            </button>
          ) : undefined
        }
      />
    </Section>
  );
}
