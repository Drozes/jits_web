/**
 * What a rendered screen draws above one element, for layout-stability
 * tests (timekeeper mode PM31 (1)). A unit test has no layout, but an
 * element's place on screen is decided by everything drawn before it in
 * reading order: when that prefix is the same, the element has not moved.
 * So a test captures `renderedAbove(tree, id)` before and after a change it
 * does not want to move the element (a notice coming or going) and compares
 * the two.
 *
 * That premise holds only in a top-anchored flow layout, such as the match
 * wizard's ScrollView content on the face-off (`match-flow-wizard.tsx`: no
 * `justifyContent`, no `flexGrow`). In a bottom-anchored footer, a sheet or a
 * centred column, content after the element can move it too, so this check
 * would pass while the control moves: do not use it there.
 *
 * Each entry is one host node, `type` plus its props without callbacks, or
 * one text child, in depth-first reading order. The element itself and
 * everything after it are left out.
 */

/** A host node as `toJSON()` returns it (the test renderer's JSON shape). */
interface RenderedNode {
  type: string;
  props: Record<string, unknown>;
  children: (RenderedNode | string)[] | null;
}

type Rendered = RenderedNode | RenderedNode[] | string | null;

function plainProps(props: Record<string, unknown>): string {
  const keep = Object.keys(props)
    .filter((k) => typeof props[k] !== "function")
    .sort();
  return JSON.stringify(keep.map((k) => [k, props[k]]));
}

export function renderedAbove(tree: Rendered, testID: string): string[] {
  const out: string[] = [];
  let found = false;
  const walk = (node: Rendered): void => {
    if (found || node == null) return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (typeof node === "string") {
      out.push(JSON.stringify(node));
      return;
    }
    if (node.props?.testID === testID) {
      found = true;
      return;
    }
    out.push(`${node.type} ${plainProps(node.props ?? {})}`);
    for (const child of node.children ?? []) walk(child);
  };
  walk(tree);
  if (!found) throw new Error(`renderedAbove: no element with testID "${testID}" on screen`);
  return out;
}

/** The testIDs on screen, in reading order (for order checks). */
export function testIDsInOrder(tree: Rendered): string[] {
  const ids: string[] = [];
  const walk = (node: Rendered): void => {
    if (node == null || typeof node === "string") return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    const id = node.props?.testID;
    if (typeof id === "string") ids.push(id);
    for (const child of node.children ?? []) walk(child);
  };
  walk(tree);
  return ids;
}
