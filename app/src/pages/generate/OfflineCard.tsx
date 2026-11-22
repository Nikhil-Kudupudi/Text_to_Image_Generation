import { useEffect, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { GenIcon } from "./icons";

export const START_COMMAND = "uv run uvicorn backend.app:app --port 8000";

/** Shown while /api/health fails: the command that starts the backend, with a copy button. */
export function OfflineCard({ pollMs }: { pollMs: number }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = () => {
    const done = () => {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    };
    const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (clip?.writeText) clip.writeText(START_COMMAND).then(done, () => {});
  };

  return (
    <div className="card gen-offline" role="status">
      <div className="gen-offline-head">
        <span className="gen-dot is-off" aria-hidden="true" />
        <strong>Backend offline</strong>
        <span className="faint">checking every {Math.max(1, Math.round(pollMs / 1000))} s</span>
      </div>
      <div className="gen-command">
        <code className="mono">{START_COMMAND}</code>
        <button
          type="button"
          className="icon-button ghost"
          aria-label={copied ? "Copied" : "Copy command"}
          title={copied ? "Copied" : "Copy command"}
          onClick={copy}
        >
          {copied ? <Icon name="check" size={16} /> : <GenIcon name="copy" size={16} />}
        </button>
      </div>
      <div className="faint gen-offline-hint">from the repo root</div>
    </div>
  );
}
