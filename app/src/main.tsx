import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Kit styles load before App so page stylesheets (imported by the pages) come later and win ties.
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/ui.css";
import "./styles/shell.css";
import App from "./App";
import { initTheme } from "./lib/theme";

initTheme();

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
