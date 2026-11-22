import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error plain JS module shared with the build step
import { buildManifest, copyResults, loadSources, resolveFile } from "./server/results.mjs";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const TYPES: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".json": "application/json", ".csv": "text/csv",
};

// Serves the notebook output folders live under /results/*, so new outputs show up on refresh
// without rebuilding the app. The manifest is rebuilt on every request.
function resultsPlugin(): Plugin {
  const handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url ?? "";
    if (!url.startsWith("/results/")) return next();
    const sources = loadSources(appDir);
    if (url.startsWith("/results/manifest.json")) {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify(buildManifest(sources)));
      return;
    }
    const file = resolveFile(sources, url);
    if (!file) { res.statusCode = 404; res.end(); return; }
    const stat = fs.statSync(file);
    const modified = stat.mtime.toUTCString();
    if (req.headers["if-modified-since"] === modified) { res.statusCode = 304; res.end(); return; }
    res.setHeader("Content-Type", TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream");
    res.setHeader("Last-Modified", modified);
    res.setHeader("Cache-Control", "no-cache");
    fs.createReadStream(file).pipe(res);
  };
  let outDir = "dist";
  return {
    name: "results",
    configResolved(cfg) { outDir = path.resolve(cfg.root, cfg.build.outDir); },
    configureServer(server) { server.middlewares.use(handler); },
    closeBundle() {
      const sources = loadSources(appDir);
      copyResults(sources, buildManifest(sources), path.join(outDir, "results"));
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), resultsPlugin()],
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: true } },
  },
});
