import { useEffect, useState, type ComponentType } from "react";
import GeneratePage from "./pages/Generate";
import HomePage from "./pages/Home";
import ResultsPage from "./pages/Results";
import WorkflowPage from "./pages/Workflow";
import { Icon, type IconName } from "./components/Icon";
import { fmtTime } from "./lib/format";
import { ManifestProvider, useResults } from "./lib/ManifestContext";
import { routeHash, useRoute, type Route } from "./lib/router";
import { useTheme } from "./lib/theme";

const NAV: { route: Route; label: string; icon: IconName; page: ComponentType }[] = [
  { route: "home", label: "Models", icon: "models", page: HomePage },
  { route: "results", label: "Results", icon: "results", page: ResultsPage },
  { route: "workflow", label: "Workflow", icon: "workflow", page: WorkflowPage },
  { route: "generate", label: "Generate", icon: "generate", page: GeneratePage },
];

function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <div className="sidebar-row">
      <span>{theme === "dark" ? "Dark" : "Light"}</span>
      <button type="button" className="icon-button ghost" onClick={toggle} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
        <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
      </button>
    </div>
  );
}

function ManifestStatus() {
  const { data, error, loading, reload } = useResults();
  const state = error ? "is-error" : loading && !data ? "is-loading" : "";
  const label = error && !data ? "no manifest" : data ? `updated ${fmtTime(data.generatedAt)}` : "loading…";
  return (
    <div className="sidebar-row">
      <span className="updated" title={error ?? data?.generatedAt ?? undefined}>
        <span className={`status-dot ${state}`} aria-hidden="true" />
        <span>{label}</span>
      </span>
      <button type="button" className="icon-button ghost" onClick={reload} aria-label="Reload results" title="Reload results" disabled={loading}>
        <Icon name="refresh" size={16} className={loading ? "spin" : undefined} />
      </button>
    </div>
  );
}

function ErrorBanner() {
  const { data, error } = useResults();
  if (!error || data) return null;
  return (
    <div className="banner" role="alert">
      <Icon name="alert" size={16} />
      <span>Results unavailable</span>
      <span className="faint mono">{error}</span>
    </div>
  );
}

function Shell() {
  const [route] = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);
  const current = NAV.find((n) => n.route === route) ?? NAV[0];
  const Page = current.page;

  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo?.(0, 0);
    document.title = `${current.label} · Text-to-Image`;
  }, [current]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className="shell">
      <aside className="sidebar" data-open={menuOpen}>
        <div className="sidebar-top">
          <a className="brand" href={routeHash("home")}>
            <span className="brand-mark" aria-hidden="true">
              <Icon name="image" size={16} />
            </span>
            <span>T2I Results</span>
          </a>
          <button
            type="button"
            className="icon-button ghost menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="sidebar-body"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <Icon name={menuOpen ? "close" : "menu"} />
          </button>
        </div>
        <div className="sidebar-body" id="sidebar-body">
          <nav className="nav" aria-label="Main">
            {NAV.map((n) => (
              <a
                key={n.route}
                className="nav-link"
                href={routeHash(n.route)}
                aria-current={n.route === route ? "page" : undefined}
                onClick={() => setMenuOpen(false)}
              >
                <Icon name={n.icon} size={16} />
                <span>{n.label}</span>
              </a>
            ))}
          </nav>
          <div className="sidebar-foot">
            <ThemeToggle />
            <ManifestStatus />
          </div>
        </div>
      </aside>
      <main className="main">
        <div className="content">
          <ErrorBanner />
          <Page />
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ManifestProvider>
      <Shell />
    </ManifestProvider>
  );
}
