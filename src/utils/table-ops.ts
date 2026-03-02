import { parse } from "parse5";
import { selectOne, selectAll } from "css-select";
import { parse5Adapter } from "./parse5-adapter";
import type { DefaultTreeAdapterMap } from "parse5";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

function detectIndentation(html: string, offset: number): string {
  let i = offset - 1;
  while (i >= 0 && html[i] !== "\n") {
    i--;
  }
  const lineStart = i + 1;
  const prefix = html.slice(lineStart, offset);
  const match = prefix.match(/^(\s*)/);
  return match ? match[1] : "";
}

function findTable(
  html: string,
  tableSelector: string,
): { ast: Node; table: Element } {
  const ast = parse(html, { sourceCodeLocationInfo: true });
  const table = selectOne(tableSelector, ast.childNodes, {
    adapter: parse5Adapter,
  }) as Element | null;
  if (!table || table.tagName !== "table") {
    throw new Error(
      `Table not found for selector "${tableSelector}"`,
    );
  }
  return { ast, table };
}

function getAllRows(table: Element): Element[] {
  return selectAll("tr", [table], {
    adapter: parse5Adapter,
  }) as Element[];
}

function getCells(row: Element): Element[] {
  return (row.childNodes as Node[]).filter(
    (n): n is Element =>
      "tagName" in n && (n.tagName === "td" || n.tagName === "th"),
  );
}

function cleanCellContent(cellHtml: string): string {
  // Remove content between start tag end and end tag start, keeping the tags
  // Also handle checkboxes: remove checked attribute
  // Also handle inputs: remove value attribute
  // Also remove data-mid attributes

  let result = cellHtml;

  // Remove data-mid attributes
  result = result.replace(/\s+data-mid="[^"]*"/g, "");

  // Find the end of the opening tag
  const startTagEnd = result.indexOf(">");
  if (startTagEnd === -1) return result;

  // Find the start of the closing tag
  const closingTagMatch = result.match(/<\/(td|th)>\s*$/);
  if (!closingTagMatch) return result;

  const closingTagStart = result.lastIndexOf(closingTagMatch[0]);
  const openTag = result.slice(0, startTagEnd + 1);
  const closingTag = result.slice(closingTagStart);
  const content = result.slice(startTagEnd + 1, closingTagStart);

  // Process inner content: keep structure but clear values
  let cleanedContent = content;

  // Clear text nodes (replace non-tag text with empty)
  // But preserve child elements like checkboxes, inputs, selects
  if (/</.test(cleanedContent)) {
    // Has child elements — process them
    // Uncheck checkboxes
    cleanedContent = cleanedContent.replace(
      /(<input\s[^>]*?)(\s+checked(?:="[^"]*")?)/gi,
      "$1",
    );
    // Clear input values
    cleanedContent = cleanedContent.replace(
      /(<input\s[^>]*?)\s+value="[^"]*"/gi,
      "$1",
    );
    // Reset selects: remove selected from options except first
    cleanedContent = cleanedContent.replace(
      /(<option\b[^>]*?)\s+selected(?:="[^"]*")?/gi,
      "$1",
    );
    // Clear text content around elements (between tags)
    cleanedContent = cleanedContent.replace(
      />([\s\S]*?)</g,
      (match, text, offset) => {
        // Only clear pure text between tags, not between element tags
        const trimmed = text.trim();
        if (trimmed && !trimmed.includes("<")) {
          return "><";
        }
        return match;
      },
    );
    // Remove data-mid from inner elements
    cleanedContent = cleanedContent.replace(/\s+data-mid="[^"]*"/g, "");
  } else {
    // Pure text content — clear it
    cleanedContent = "";
  }

  return openTag + cleanedContent + closingTag;
}

export function addRow(html: string, tableSelector: string): string {
  const { table } = findTable(html, tableSelector);
  const rows = getAllRows(table);

  if (rows.length === 0) {
    throw new Error("Table has no rows");
  }

  const lastRow = rows[rows.length - 1];
  const loc = lastRow.sourceCodeLocation!;
  const rowHtml = html.slice(loc.startOffset, loc.endOffset);

  // Clean each cell in the row
  const cells = getCells(lastRow);
  let cleanedRowHtml = rowHtml;

  // Process cells from right to left to preserve offsets
  for (let i = cells.length - 1; i >= 0; i--) {
    const cell = cells[i];
    const cellLoc = cell.sourceCodeLocation!;
    const cellStart = cellLoc.startOffset - loc.startOffset;
    const cellEnd = cellLoc.endOffset - loc.startOffset;
    const cellHtml = cleanedRowHtml.slice(cellStart, cellEnd);
    const cleaned = cleanCellContent(cellHtml);
    cleanedRowHtml =
      cleanedRowHtml.slice(0, cellStart) +
      cleaned +
      cleanedRowHtml.slice(cellEnd);
  }

  // Remove data-mid from the row itself
  cleanedRowHtml = cleanedRowHtml.replace(
    /(<tr\b[^>]*?)\s+data-mid="[^"]*"/i,
    "$1",
  );

  const indent = detectIndentation(html, loc.startOffset);
  const insertPos = loc.endOffset;

  return (
    html.slice(0, insertPos) +
    "\n" +
    indent +
    cleanedRowHtml +
    html.slice(insertPos)
  );
}

export function removeRow(
  html: string,
  tableSelector: string,
  rowSelector: string,
): string {
  const { table } = findTable(html, tableSelector);
  const rows = getAllRows(table);

  if (rows.length <= 1) {
    throw new Error("Cannot remove the last row");
  }

  const ast = parse(html, { sourceCodeLocationInfo: true });
  const targetRow = selectOne(rowSelector, ast.childNodes, {
    adapter: parse5Adapter,
  }) as Element | null;

  if (!targetRow || targetRow.tagName !== "tr") {
    throw new Error(`Row not found: "${rowSelector}"`);
  }

  const loc = targetRow.sourceCodeLocation!;
  let start = loc.startOffset;
  let end = loc.endOffset;

  // Remove leading whitespace on the line
  while (start > 0 && html[start - 1] !== "\n" && /\s/.test(html[start - 1])) {
    start--;
  }
  // Remove trailing newline
  if (html[end] === "\n") {
    end++;
  }

  return html.slice(0, start) + html.slice(end);
}

export function addCol(html: string, tableSelector: string): string {
  const { table } = findTable(html, tableSelector);
  const rows = getAllRows(table);

  if (rows.length === 0) {
    throw new Error("Table has no rows");
  }

  // Sort rows by descending startOffset (bottom-to-top)
  const sortedRows = [...rows].sort(
    (a, b) =>
      b.sourceCodeLocation!.startOffset - a.sourceCodeLocation!.startOffset,
  );

  let result = html;

  for (const row of sortedRows) {
    const cells = getCells(row);
    if (cells.length === 0) continue;

    const lastCell = cells[cells.length - 1];
    const cellLoc = lastCell.sourceCodeLocation!;
    const cellHtml = result.slice(cellLoc.startOffset, cellLoc.endOffset);
    let newCellHtml = cleanCellContent(cellHtml);

    // If it was a th, keep it as th; if td, keep as td
    // Already preserved by cleanCellContent

    // Remove data-mid from the new cell
    newCellHtml = newCellHtml.replace(/\s+data-mid="[^"]*"/g, "");

    const indent = detectIndentation(result, cellLoc.startOffset);
    const insertPos = cellLoc.endOffset;

    result =
      result.slice(0, insertPos) +
      "\n" +
      indent +
      newCellHtml +
      result.slice(insertPos);
  }

  return result;
}

export function removeCol(
  html: string,
  tableSelector: string,
  colIndex: number,
): string {
  const { table } = findTable(html, tableSelector);
  const rows = getAllRows(table);

  // Check that all rows have more than 1 column
  for (const row of rows) {
    const cells = getCells(row);
    if (cells.length <= 1) {
      throw new Error("Cannot remove the last column");
    }
  }

  // Sort rows by descending startOffset (bottom-to-top)
  const sortedRows = [...rows].sort(
    (a, b) =>
      b.sourceCodeLocation!.startOffset - a.sourceCodeLocation!.startOffset,
  );

  let result = html;

  for (const row of sortedRows) {
    const cells = getCells(row);
    // Clamp index to valid range
    const idx = Math.min(colIndex, cells.length - 1);
    const cell = cells[idx];
    const cellLoc = cell.sourceCodeLocation!;

    let start = cellLoc.startOffset;
    let end = cellLoc.endOffset;

    // Remove leading whitespace on the line
    while (
      start > 0 &&
      result[start - 1] !== "\n" &&
      /\s/.test(result[start - 1])
    ) {
      start--;
    }
    // Remove trailing newline
    if (result[end] === "\n") {
      end++;
    }

    result = result.slice(0, start) + result.slice(end);
  }

  return result;
}
