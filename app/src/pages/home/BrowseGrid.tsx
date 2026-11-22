import { useMemo, useState } from "react";
import type { M3Results } from "../../types";
import { EmptyState, Section, Segmented } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { Lightbox, type LightboxItem } from "../../components/Lightbox";
import { configLabel } from "../../lib/configs";
import { fmt } from "../../lib/format";
import { imageUrl } from "../../lib/urls";
import { clipAt, hasImage, shortLabel } from "./data";
import { ImageFrame } from "./ImageFrame";

export const PAGE_SIZE = 48;

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage(p: number): void }) {
  return (
    <div className="pager">
      <button type="button" className="icon-button" aria-label="Previous page" disabled={page <= 0} onClick={() => onPage(page - 1)}>
        <Icon name="chevronLeft" />
      </button>
      <span className="pager-count num muted">
        {page + 1} / {pages}
      </span>
      <button type="button" className="icon-button" aria-label="Next page" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
        <Icon name="chevronRight" />
      </button>
    </div>
  );
}

export function BrowseGrid({ m3, selected, onSelect }: { m3: M3Results; selected: string; onSelect(config: string): void }) {
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const row = m3.models.find((r) => r.config === selected) ?? m3.models[0];
  const config = row?.config ?? "";
  const label = configLabel(config);

  const pages = Math.max(1, Math.ceil(m3.prompts.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const slice = m3.prompts.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  // The lightbox walks every rendered image of this model, not just the page.
  const { items, itemIndex } = useMemo(() => {
    const list: LightboxItem[] = [];
    const index = new Map<number, number>();
    for (const p of m3.prompts) {
      if (!hasImage(row, p.idx)) continue;
      const clip = clipAt(m3, config, p.idx);
      index.set(p.idx, list.length);
      list.push({
        src: imageUrl(config, p.idx),
        alt: p.caption,
        title: p.caption,
        meta: clip != null ? `${label} · CLIP ${fmt(clip, 3)}` : label,
      });
    }
    return { items: list, itemIndex: index };
  }, [m3, row, config, label]);

  if (!row) {
    return (
      <Section id="browse" title="Browse">
        <EmptyState title="No models" />
      </Section>
    );
  }

  const options = m3.models.map((r) => ({ value: r.config, label: shortLabel(r.config) }));
  const select = (c: string) => {
    onSelect(c);
    setOpen(null);
  };

  return (
    <Section id="browse" title="Browse" actions={<Pager page={current} pages={pages} onPage={setPage} />}>
      <div className="browse-toolbar">
        <Segmented options={options} value={config} onChange={select} ariaLabel="Model" />
      </div>
      {slice.length === 0 ? (
        <EmptyState title="No prompts" />
      ) : (
        <div className="grid-thumbs browse-grid">
          {slice.map((p) => (
            <ImageFrame
              key={`${config}-${p.idx}`}
              src={imageUrl(config, p.idx)}
              alt={p.caption}
              available={hasImage(row, p.idx)}
              onClick={() => setOpen(itemIndex.get(p.idx) ?? null)}
            />
          ))}
        </div>
      )}
      <Lightbox items={items} index={open} onClose={() => setOpen(null)} onIndex={setOpen} />
    </Section>
  );
}
