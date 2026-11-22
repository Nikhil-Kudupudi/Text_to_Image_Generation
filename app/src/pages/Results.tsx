import { useResults } from "../lib/ManifestContext";
import { MetricsSection } from "./results/MetricsSection";
import { PerformanceSection } from "./results/PerformanceSection";
import { PlotGallery } from "./results/PlotGallery";
import { SettingsSection } from "./results/SettingsSection";
import { SubNav } from "./results/SubNav";
import "../styles/results.css";

export default function ResultsPage() {
  const { data } = useResults();
  const m3 = data?.m3 ?? null;
  const m2 = data?.m2 ?? null;

  return (
    <div className="results-page">
      <header className="page-head">
        <h1>Results</h1>
      </header>
      <SubNav />
      <SettingsSection models={m3?.models ?? null} m2={m2} />
      <PerformanceSection metrics={m3?.metrics ?? []} />
      <PlotGallery m3Plots={m3?.plots ?? []} m2Plots={m2?.plots ?? []} />
      <MetricsSection metrics={m3?.metrics ?? []} ranking={m3?.ranking ?? []} />
    </div>
  );
}
