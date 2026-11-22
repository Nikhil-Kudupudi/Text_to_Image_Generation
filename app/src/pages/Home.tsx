import { useState } from "react";
import { EmptyState } from "../components/ui";
import { useResults } from "../lib/ManifestContext";
import { BrowseGrid } from "./home/BrowseGrid";
import { CompareStrip } from "./home/CompareStrip";
import { ModelCards } from "./home/ModelCards";
import { StatTiles } from "./home/StatTiles";
import { winner } from "./home/data";
import "../styles/home.css";

function scrollToBrowse() {
  const el = document.getElementById("browse");
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  el?.scrollIntoView?.({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

export default function HomePage() {
  const { data, loading } = useResults();
  const [picked, setPicked] = useState<string | null>(null);
  const m3 = data?.m3 ?? null;

  if (!m3) {
    return (
      <div className="home">
        <header className="page-head">
          <h1>Models</h1>
        </header>
        {loading && !data ? <EmptyState title="Loading" /> : <EmptyState title="No results" hint="outputs/milestone_3/" />}
      </div>
    );
  }

  const configs = m3.models.map((r) => r.config);
  const win = winner(m3)?.config;
  const selected = picked && configs.includes(picked) ? picked : win && configs.includes(win) ? win : configs[0] ?? "";
  const pick = (config: string) => setPicked(config);
  const pickAndGo = (config: string) => {
    setPicked(config);
    scrollToBrowse();
  };

  return (
    <div className="home">
      <header className="page-head">
        <h1>Models</h1>
        <span className="home-meta num muted">
          {m3.models.length} models · {m3.prompts.length} prompts
        </span>
      </header>
      <StatTiles m3={m3} />
      {m3.models.length === 0 ? (
        <EmptyState title="No models" hint="outputs/milestone_3/tables/m3_generation_log.csv" />
      ) : (
        <>
          <ModelCards m3={m3} selected={selected} onSelect={pickAndGo} />
          <CompareStrip m3={m3} />
          <BrowseGrid m3={m3} selected={selected} onSelect={pick} />
        </>
      )}
    </div>
  );
}
