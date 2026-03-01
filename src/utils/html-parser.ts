import { parse } from "parse5";
import { selectOne, selectAll } from "css-select";
import { parse5Adapter } from "./parse5-adapter";
import type { DefaultTreeAdapterMap } from "parse5";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

interface ElementInfo {
  element: Element;
  startOffset: number;
  endOffset: number;
}

export class SelectorNotFoundError extends Error {
  constructor(selector: string, html: string) {
    const ids = findAvailableIds(html);
    const idList = ids.length > 0 ? ids.join(", ") : "none";
    super(`Selector "${selector}" not found. Available IDs: ${idList}`);
    this.name = "SelectorNotFoundError";
  }
}

function findAvailableIds(html: string): string[] {
  const ast = parse(html, { sourceCodeLocationInfo: true });
  const allElements = selectAll("*", ast.childNodes, {
    adapter: parse5Adapter,
  }) as Element[];
  const ids: string[] = [];
  for (const el of allElements) {
    const idAttr = el.attrs.find((a) => a.name === "id");
    if (idAttr?.value) ids.push(`#${idAttr.value}`);
  }
  return ids;
}

export function findElement(
  html: string,
  selector: string,
): ElementInfo | null {
  const ast = parse(html, { sourceCodeLocationInfo: true });
  const element = selectOne(selector, ast.childNodes, {
    adapter: parse5Adapter,
  }) as Element | null;

  if (!element?.sourceCodeLocation) return null;

  return {
    element,
    startOffset: element.sourceCodeLocation.startOffset,
    endOffset: element.sourceCodeLocation.endOffset,
  };
}

function detectIndentation(html: string, offset: number): string {
  // Walk backwards from offset to find the start of the line
  let i = offset - 1;
  while (i >= 0 && html[i] !== "\n") {
    i--;
  }
  // Extract whitespace from start of line to the element
  const lineStart = i + 1;
  const prefix = html.slice(lineStart, offset);
  const match = prefix.match(/^(\s*)/);
  return match ? match[1] : "";
}

function indentHtml(html: string, indent: string): string {
  if (!indent) return html;
  const lines = html.split("\n");
  return lines
    .map((line, i) => (i === 0 ? line : indent + line))
    .join("\n");
}

export function replaceElement(
  html: string,
  selector: string,
  newHtml: string,
): string {
  const info = findElement(html, selector);
  if (!info) throw new SelectorNotFoundError(selector, html);

  const indent = detectIndentation(html, info.startOffset);
  const indentedHtml = indentHtml(newHtml, indent);

  return (
    html.slice(0, info.startOffset) + indentedHtml + html.slice(info.endOffset)
  );
}

export function updateClasses(
  html: string,
  selector: string,
  add: string[],
  remove: string[],
): string {
  const info = findElement(html, selector);
  if (!info) throw new SelectorNotFoundError(selector, html);

  const classAttr = info.element.attrs.find((a) => a.name === "class");
  let classes = classAttr
    ? classAttr.value.split(/\s+/).filter(Boolean)
    : [];

  // Remove
  classes = classes.filter((c) => !remove.includes(c));
  // Add
  for (const c of add) {
    if (!classes.includes(c)) classes.push(c);
  }

  const attrLoc = info.element.sourceCodeLocation?.attrs?.["class"];
  if (attrLoc) {
    // Replace existing class attribute
    const newClassAttr = `class="${classes.join(" ")}"`;
    return (
      html.slice(0, attrLoc.startOffset) +
      newClassAttr +
      html.slice(attrLoc.endOffset)
    );
  } else if (classes.length > 0) {
    // Insert class attribute after the tag name opening
    const startTag = info.element.sourceCodeLocation!.startTag!;
    // Find position right after "<tagName"
    const tagStart = startTag.startOffset;
    const afterTagName = tagStart + 1 + info.element.tagName.length; // 1 for '<'
    return (
      html.slice(0, afterTagName) +
      ` class="${classes.join(" ")}"` +
      html.slice(afterTagName)
    );
  }

  return html;
}

export function replacePage(html: string, newBodyHtml: string): string {
  // Find body content boundaries using parse5
  const ast = parse(html, { sourceCodeLocationInfo: true });
  const body = selectOne("body", ast.childNodes, {
    adapter: parse5Adapter,
  }) as Element | null;

  if (!body?.sourceCodeLocation?.startTag && !body?.sourceCodeLocation?.endTag) {
    throw new Error("No <body> found in HTML");
  }

  const startTag = body.sourceCodeLocation!.startTag!;
  const endTag = body.sourceCodeLocation!.endTag!;

  // Replace content between end of <body> start tag and start of </body> end tag
  const contentStart = startTag.endOffset;
  const contentEnd = endTag.startOffset;

  return (
    html.slice(0, contentStart) +
    "\n" +
    newBodyHtml +
    "\n" +
    html.slice(contentEnd)
  );
}

export type InsertPosition = "before" | "after" | "prepend" | "append";

export function insertElement(
  html: string,
  selector: string,
  position: InsertPosition,
  newHtml: string,
): string {
  const info = findElement(html, selector);
  if (!info) throw new SelectorNotFoundError(selector, html);

  const loc = info.element.sourceCodeLocation!;
  const indent = detectIndentation(html, info.startOffset);
  const indentedHtml = indentHtml(newHtml, indent);

  switch (position) {
    case "before":
      return html.slice(0, info.startOffset) + indentedHtml + "\n" + indent + html.slice(info.startOffset);
    case "after":
      return html.slice(0, info.endOffset) + "\n" + indent + indentedHtml + html.slice(info.endOffset);
    case "prepend": {
      const insertAt = loc.startTag!.endOffset;
      const childIndent = indent + "  ";
      const indentedChild = indentHtml(newHtml, childIndent);
      return html.slice(0, insertAt) + "\n" + childIndent + indentedChild + html.slice(insertAt);
    }
    case "append": {
      const insertAt = loc.endTag!.startOffset;
      const childIndent = indent + "  ";
      const indentedChild = indentHtml(newHtml, childIndent);
      return html.slice(0, insertAt) + childIndent + indentedChild + "\n" + indent + html.slice(insertAt);
    }
  }
}

export function deleteElement(html: string, selector: string): string {
  const info = findElement(html, selector);
  if (!info) throw new SelectorNotFoundError(selector, html);

  // Remove the element and any leading whitespace on its line
  let start = info.startOffset;
  while (start > 0 && html[start - 1] !== "\n" && /\s/.test(html[start - 1])) {
    start--;
  }
  let end = info.endOffset;
  // Remove trailing newline if present
  if (html[end] === "\n") {
    end++;
  }

  return html.slice(0, start) + html.slice(end);
}

export function updateText(
  html: string,
  selector: string,
  text: string,
): string {
  const info = findElement(html, selector);
  if (!info) throw new SelectorNotFoundError(selector, html);

  const loc = info.element.sourceCodeLocation!;
  const contentStart = loc.startTag!.endOffset;
  const contentEnd = loc.endTag!.startOffset;

  return html.slice(0, contentStart) + text + html.slice(contentEnd);
}

export function updateAttribute(
  html: string,
  selector: string,
  attr: string,
  value: string,
): string {
  const info = findElement(html, selector);
  if (!info) throw new SelectorNotFoundError(selector, html);

  const attrLoc = info.element.sourceCodeLocation?.attrs?.[attr];
  if (attrLoc) {
    // Replace existing attribute
    const newAttr = `${attr}="${value}"`;
    return html.slice(0, attrLoc.startOffset) + newAttr + html.slice(attrLoc.endOffset);
  }

  // Insert new attribute after tag name
  const startTag = info.element.sourceCodeLocation!.startTag!;
  const tagStart = startTag.startOffset;
  const afterTagName = tagStart + 1 + info.element.tagName.length;
  return (
    html.slice(0, afterTagName) +
    ` ${attr}="${value}"` +
    html.slice(afterTagName)
  );
}

export function extractBodyContent(html: string): string | null {
  const ast = parse(html, { sourceCodeLocationInfo: true });
  const body = selectOne("body", ast.childNodes, {
    adapter: parse5Adapter,
  }) as Element | null;

  if (!body?.sourceCodeLocation?.startTag || !body?.sourceCodeLocation?.endTag) {
    return null;
  }

  const contentStart = body.sourceCodeLocation.startTag.endOffset;
  const contentEnd = body.sourceCodeLocation.endTag.startOffset;
  return html.slice(contentStart, contentEnd);
}

export function getPages(projectDir: string): string[] {
  const glob = new Bun.Glob("**/*.html");
  const pages: string[] = [];
  for (const path of glob.scanSync({ cwd: projectDir })) {
    pages.push(path);
  }
  return pages.sort();
}
