import { Icon } from "../../components/Icon";

/** Prev/next through the (filtered) prompt list, "k / n", and a caption search box. */
export function PromptPicker({
  pos,
  total,
  query,
  onQuery,
  onPos,
}: {
  pos: number;
  total: number;
  query: string;
  onQuery(q: string): void;
  onPos(p: number): void;
}) {
  const step = (d: number) => total > 0 && onPos((pos + d + total) % total);
  return (
    <div className="prompt-picker">
      <div className="prompt-picker-nav">
        <button type="button" className="icon-button" aria-label="Previous prompt" disabled={total < 2} onClick={() => step(-1)}>
          <Icon name="chevronLeft" />
        </button>
        <span className="prompt-picker-count num muted">
          {total === 0 ? 0 : pos + 1} / {total}
        </span>
        <button type="button" className="icon-button" aria-label="Next prompt" disabled={total < 2} onClick={() => step(1)}>
          <Icon name="chevronRight" />
        </button>
      </div>
      <input
        type="search"
        className="input prompt-picker-search"
        placeholder="Search"
        aria-label="Search prompts"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
      />
    </div>
  );
}
