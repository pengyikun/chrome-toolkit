import { UnexpectedResponseError } from "./errors";

type Node = [role: string, description: string, children: Node[]];

/** Convert a bounded structural AX tree to ordered tab/group records. Null
 * means an unsupported or ambiguous layout; malformed transport is an error. */
export function parseAXTree(value: unknown): unknown[] | null {
  let count = 0;
  function validate(value: unknown, depth: number): asserts value is Node {
    if (
      ++count > 2000 ||
      depth > 12 ||
      !Array.isArray(value) ||
      value.length !== 3 ||
      typeof value[0] !== "string" ||
      typeof value[1] !== "string" ||
      !Array.isArray(value[2])
    ) {
      throw new UnexpectedResponseError("invalid accessibility tree");
    }
    for (const child of value[2]) validate(child, depth + 1);
  }
  validate(value, 0);
  const strips: Node[] = [];
  const hasScroll = (node: Node): boolean =>
    node[0] !== "AXWebArea" &&
    (node[0] === "AXScrollArea" || node[2].some(hasScroll));
  function find(node: Node) {
    if (node[0] === "AXWebArea") return;
    if (node[0] === "AXTabGroup" && hasScroll(node)) {
      strips.push(node);
      return;
    }
    node[2].forEach(find);
  }
  find(value);
  if (strips.length !== 1) return null;
  const rows: unknown[] = [];
  let unsupported = false;
  function tabs(node: Node): number {
    if (node[0] === "AXWebArea" || node[0] === "AXTabGroup") {
      unsupported = true;
      return 0;
    }
    return node[0] === "AXRadioButton"
      ? 1
      : node[2].reduce((n, child) => n + tabs(child), 0);
  }
  function collect(node: Node, inScroll: boolean) {
    if (node[0] === "AXWebArea") return;
    const inside = inScroll || node[0] === "AXScrollArea";
    if (inside && node[0] === "AXRadioButton") {
      rows.push(["T"]);
      return;
    }
    const labels = node[2].filter((child) => child[0] === "AXTabGroup");
    if (inside && labels.length) {
      if (node[0] !== "AXGroup" || labels.length !== 1 || !labels[0]?.[1]) {
        unsupported = true;
        return;
      }
      rows.push([
        "G",
        labels[0]![1],
        node[2]
          .filter((child) => child !== labels[0])
          .reduce((n, child) => n + tabs(child), 0),
      ]);
      return; // Group descendants are already counted.
    }
    node[2].forEach((child) => collect(child, inside));
  }
  collect(strips[0]!, false);
  return unsupported || !rows.length ? null : rows;
}
