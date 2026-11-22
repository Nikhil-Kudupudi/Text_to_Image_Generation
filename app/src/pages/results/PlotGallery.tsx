import { useState } from "react";
import { Lightbox, type LightboxItem } from "../../components/Lightbox";
import { EmptyState, Section, Thumb } from "../../components/ui";
import { plotTitle } from "../../lib/format";
import { m2Url, m3PlotUrl } from "../../lib/urls";

/** Notebook PNGs: milestone 3 first, then milestone 2. Click opens the lightbox. */
export function PlotGallery({ m3Plots, m2Plots }: { m3Plots: string[]; m2Plots: string[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const items: LightboxItem[] = [
    ...m3Plots.map((f) => ({ src: m3PlotUrl(f), alt: plotTitle(f), title: plotTitle(f), meta: `milestone 3 · ${f}` })),
    ...m2Plots.map((f) => ({ src: m2Url(`plots/${f}`), alt: plotTitle(f), title: plotTitle(f), meta: `milestone 2 · ${f}` })),
  ];

  return (
    <Section id="plots" title="Plots">
      {items.length === 0 ? (
        <EmptyState title="No plots yet" hint="outputs/milestone_3/plots/" />
      ) : (
        <div className="plot-grid">
          {items.map((it, i) => (
            <figure key={it.src} className="plot-item">
              <figcaption className="plot-title" aria-hidden="true">{it.title}</figcaption>
              <Thumb src={it.src} alt={it.alt} onClick={() => setOpen(i)} />
            </figure>
          ))}
        </div>
      )}
      <Lightbox items={items} index={open} onClose={() => setOpen(null)} onIndex={setOpen} />
    </Section>
  );
}
