import type { Manifest } from "../../types";

interface Node {
  name: string;
  note?: string;
  children?: Node[];
}

function buildTree(data: Manifest | null): Node[] {
  const configs = data?.m3?.models.map((m) => ({ name: `${m.config}/`, note: `${m.images} png` })) ?? [];
  const plots = data?.m3 ? `${data.m3.plots.length} png` : "—";
  return [
    {
      name: "outputs/milestone_3/",
      children: [
        { name: "images/", children: configs.length ? configs : [{ name: "<config>/NNN.png" }] },
        { name: "plots/", note: `${plots}` },
        { name: "tables/", note: "csv, json" },
      ],
    },
    { name: "outputs/milestone_2/", children: [{ name: "sweep/" }, { name: "plots/" }, { name: "tables/" }] },
    { name: "outputs/live/", children: [{ name: "<id>.png" }, { name: "history.jsonl" }] },
    { name: "data/processed/images_512/", note: "real photos" },
  ];
}

function Branch({ node }: { node: Node }) {
  return (
    <li>
      <span className="sk-file">{node.name}</span>
      {node.note && <span className="sk-note"> {node.note}</span>}
      {node.children && (
        <ul>
          {node.children.map((c) => (
            <Branch key={c.name} node={c} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function FolderTree({ data }: { data: Manifest | null }) {
  return (
    <ul className="sk-tree" aria-label="Output folders">
      {buildTree(data).map((n) => (
        <Branch key={n.name} node={n} />
      ))}
    </ul>
  );
}
