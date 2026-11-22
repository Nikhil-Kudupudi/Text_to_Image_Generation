import { Section } from "../components/ui";
import { useResults } from "../lib/ManifestContext";
import FolderTree from "./workflow/FolderTree";
import Sketch from "./workflow/Sketch";
import "../styles/sketch.css";

export default function WorkflowPage() {
  const { data } = useResults();
  return (
    <div className="stack">
      <div className="page-head">
        <h1>Workflow</h1>
      </div>
      <Section id="pipeline" title="Pipeline">
        <Sketch data={data} />
      </Section>
      <Section id="folders" title="Where files live">
        <FolderTree data={data} />
      </Section>
    </div>
  );
}
