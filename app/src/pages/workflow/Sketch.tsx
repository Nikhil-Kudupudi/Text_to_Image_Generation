import type { ReactNode } from "react";
import type { Manifest } from "../../types";

function Arrow({ label }: { label?: string }) {
  return (
    <div className="sk-arrow" aria-hidden="true">
      <svg viewBox="0 0 24 40" width="24" height="40">
        <path d="M12 2 C 8 12, 16 22, 12 34" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M6 28 L12 36 L18 27" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </div>
  );
}

function Stage({
  id, n, chip, title, sub, children, radius,
}: { id: string; n: number; chip: string; title: string; sub: string; children?: ReactNode; radius?: string }) {
  return (
    <div className="sk-box" data-testid="stage" data-stage={id} style={radius ? { borderRadius: radius } : undefined}>
      <div className="sk-head">
        <span className="sk-num">{n}</span>
        <span className="sk-chip">{chip}</span>
      </div>
      <div className="sk-title">{title}</div>
      <div className="sk-sub">{sub}</div>
      {children}
    </div>
  );
}

function sum(rows: { images: number }[] | undefined): number | null {
  return rows ? rows.reduce((a, r) => a + r.images, 0) : null;
}

export default function Sketch({ data }: { data: Manifest | null }) {
  const m = sum(data?.m3?.models);
  const g = sum(data?.m3?.sweep);
  const p = data?.m3 ? data.m3.plots.length : null;
  const c = (v: number | null, unit: string) => (v === null ? "—" : `${v.toLocaleString()} ${unit}`);
  return (
    <div className="sk">
      <Stage id="coco" n={1} chip="data" title="COCO 2017 val captions" sub="3,000 images × 2 captions" radius="14px 10px 16px 9px" />
      <Arrow />
      <Stage id="preprocess" n={2} chip="kaggle" title="Preprocessing" sub="clean, 512 px, CLIP/BERT embeddings" radius="10px 15px 9px 16px" />
      <Arrow label="coco-processed" />
      <Stage id="sweep" n={3} chip="notebook" title="Settings sweep, SD 1.5" sub="guidance, samplers, schedules" radius="16px 9px 14px 11px">
        <div className="sk-sub">best: Euler-a 30 steps</div>
      </Stage>
      <Arrow />
      <div className="sk-branch">
        <Stage id="render-models" n={4} chip="notebook" title="Render models" sub="500 prompts, 5 models" radius="9px 16px 11px 14px">
          <div className="sk-count" data-testid="count-models">{c(m, "images")}</div>
        </Stage>
        <Stage id="render-guidance" n={4} chip="notebook" title="Render guidance" sub="200 prompts, g = 1…15" radius="15px 10px 9px 16px">
          <div className="sk-count" data-testid="count-guidance">{c(g, "images")}</div>
        </Stage>
      </div>
      <Arrow />
      <Stage id="evaluation" n={5} chip="notebook" title="Evaluation" sub="FID, IS, CLIP score, ranking" radius="11px 14px 16px 9px">
        <div className="sk-count" data-testid="count-plots">{c(p, "plots")}</div>
      </Stage>
      <Arrow />
      <Stage id="website" n={6} chip="website" title="This website" sub="Models · Results · Workflow · Generate" radius="14px 9px 12px 16px">
        <div className="sk-sub">live generation: FastAPI + diffusers</div>
      </Stage>
    </div>
  );
}
