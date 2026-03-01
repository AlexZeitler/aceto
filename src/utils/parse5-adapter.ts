import type { Options } from "css-select";
import type { DefaultTreeAdapterMap } from "parse5";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

type Parse5Adapter = NonNullable<Options<Node, Element>["adapter"]>;

export const parse5Adapter: Parse5Adapter = {
  isTag(node: Node): node is Element {
    return node != null && "tagName" in node;
  },

  getChildren(node: Node): Node[] {
    return "childNodes" in node ? (node.childNodes as Node[]) : [];
  },

  getParent(node: Element): Node | null {
    return "parentNode" in node ? (node.parentNode as Node | null) : null;
  },

  getName(elem: Element): string {
    return elem.tagName;
  },

  getAttributeValue(elem: Element, name: string): string | undefined {
    const attr = elem.attrs.find((a) => a.name === name);
    return attr?.value;
  },

  getText(node: Node): string {
    if ("value" in node && (node as any).nodeName === "#text") {
      return (node as any).value;
    }
    if ("childNodes" in node) {
      return (node.childNodes as Node[])
        .map((c) => parse5Adapter.getText(c))
        .join("");
    }
    return "";
  },

  hasAttrib(elem: Element, name: string): boolean {
    return elem.attrs.some((a) => a.name === name);
  },

  getSiblings(node: Node): Node[] {
    const parent = "parentNode" in node ? (node.parentNode as Node | null) : null;
    if (parent && "childNodes" in parent) {
      return parent.childNodes as Node[];
    }
    return [node];
  },

  existsOne(test: (elem: Element) => boolean, nodes: Node[]): boolean {
    for (const node of nodes) {
      if (parse5Adapter.isTag(node) && test(node)) return true;
      if (parse5Adapter.existsOne(test, parse5Adapter.getChildren(node)))
        return true;
    }
    return false;
  },

  findAll(test: (elem: Element) => boolean, nodes: Node[]): Element[] {
    const result: Element[] = [];
    for (const node of nodes) {
      if (parse5Adapter.isTag(node) && test(node)) result.push(node);
      result.push(
        ...parse5Adapter.findAll(test, parse5Adapter.getChildren(node)),
      );
    }
    return result;
  },

  findOne(test: (elem: Element) => boolean, nodes: Node[]): Element | null {
    for (const node of nodes) {
      if (parse5Adapter.isTag(node) && test(node)) return node;
      const found = parse5Adapter.findOne(
        test,
        parse5Adapter.getChildren(node),
      );
      if (found) return found;
    }
    return null;
  },

  removeSubsets(nodes: Node[]): Node[] {
    return nodes.filter((node, i) => {
      return !nodes.some((other, j) => i !== j && isAncestor(other, node));
    });
  },
};

function isAncestor(ancestor: Node, node: Node): boolean {
  let current: Node | null = node;
  while (current && "parentNode" in current) {
    current = current.parentNode as Node | null;
    if (current === ancestor) return true;
  }
  return false;
}
