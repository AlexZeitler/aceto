import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import type { AppState } from "../state";
import { getFileHistory } from "../state";
import * as parser from "../utils/html-parser";
import type { InsertPosition } from "../utils/html-parser";
import * as tableOps from "../utils/table-ops";
import { broadcast } from "../server/dev-server";
import { INIT_HTML } from "../cli";

function validateSelector(selector: string) {
  if (!selector || !selector.trim()) {
    throw new Error("Selector must not be empty");
  }
}

function resolveCurrentFile(state: AppState): string {
  let pagePath = state.currentPage;
  if (pagePath === "/") pagePath = "/index.html";
  else if (!pagePath.endsWith(".html")) pagePath += ".html";
  return path.join(state.projectDir, pagePath);
}

function extractTitle(html: string): string {
  const match = html.match(/<title>(.*?)<\/title>/i);
  return match?.[1] ?? "";
}

async function writeWithHistory(
  state: AppState,
  filePath: string,
  oldHtml: string,
  newHtml: string,
) {
  const history = getFileHistory(state, filePath);
  history.pushEdit(oldHtml, newHtml);
  await writeFile(filePath, newHtml, "utf-8");
}

function broadcastUpdate(state: AppState, html: string, selector?: string) {
  const bodyContent = parser.extractBodyContent(html);
  if (bodyContent !== null) {
    broadcast(state, { type: "update", html: bodyContent });
    if (selector) {
      broadcast(state, { type: "flash", selector });
    }
  } else {
    broadcast(state, { type: "reload" });
  }
}

// --- Read Operations ---

export async function getCurrentPage(state: AppState) {
  const filePath = resolveCurrentFile(state);
  const html = await readFile(filePath, "utf-8");
  const title = extractTitle(html);
  return {
    path: state.currentPage,
    file: path.relative(state.projectDir, filePath),
    html,
    title,
  };
}

export function getSelectedElement(state: AppState) {
  const base = !state.currentSelection
    ? { selected: false as const }
    : { selected: true as const, ...state.currentSelection };
  return state.lastPastedImage
    ? { ...base, lastPastedImage: state.lastPastedImage }
    : base;
}

export async function getPages(state: AppState) {
  const pages = parser.getPages(state.projectDir);
  return pages.map((file) => {
    let urlPath = "/" + file.replace(/\.html$/, "").replace(/\/index$/, "");
    if (urlPath === "/index") urlPath = "/";
    return { path: urlPath, file };
  });
}

export function getSelectionHistory(state: AppState, n?: number) {
  const history = state.selectionHistory;
  if (n && n > 0) {
    return history.slice(-n);
  }
  return history;
}

// --- Get Element With Context ---

export async function getElementWithContext(
  state: AppState,
  selector: string,
  depth?: number,
) {
  validateSelector(selector);
  const filePath = resolveCurrentFile(state);
  const html = await readFile(filePath, "utf-8");
  const contextHtml = parser.extractElementWithContext(html, selector, depth ?? 0);
  return { selector, depth: depth ?? 0, html: contextHtml };
}

// --- Create Page ---

export async function createPage(state: AppState, pagePath: string, html?: string) {
  // Normalize path
  let normalized = pagePath.startsWith("/") ? pagePath : "/" + pagePath;
  if (!normalized.endsWith(".html")) normalized += ".html";

  const filePath = path.join(state.projectDir, normalized);

  // Path traversal check
  if (!filePath.startsWith(state.projectDir)) {
    throw new Error("Path traversal not allowed");
  }

  if (existsSync(filePath)) {
    throw new Error(`Page already exists: ${normalized}`);
  }

  // Create directories if needed
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });

  await writeFile(filePath, html ?? INIT_HTML, "utf-8");
  return { success: true, file: normalized.slice(1), path: normalized.replace(/\.html$/, "").replace(/\/index$/, "") || "/" };
}

// --- Add Library ---

export async function addLibrary(state: AppState, url: string, type?: "css" | "script") {
  const filePath = resolveCurrentFile(state);
  const html = await readFile(filePath, "utf-8");

  if (parser.headContainsUrl(html, url)) {
    throw new Error(`Library already included: ${url}`);
  }

  // Auto-detect type from URL extension
  const detectedType = type ?? (url.endsWith(".css") ? "css" : "script");
  const tag = detectedType === "css"
    ? `<link href="${url}" rel="stylesheet">`
    : `<script src="${url}"></script>`;

  const newHtml = parser.insertIntoHead(html, tag);
  await writeWithHistory(state, filePath, html, newHtml);
  // Head changes need full reload, not morph
  broadcast(state, { type: "reload" });
  return { success: true, type: detectedType, url };
}

// --- Write Operations ---

export async function replacePage(state: AppState, newBodyHtml: string) {
  const filePath = resolveCurrentFile(state);
  const html = await readFile(filePath, "utf-8");
  const newHtml = parser.replacePage(html, newBodyHtml);
  await writeWithHistory(state, filePath, html, newHtml);
  broadcastUpdate(state, newHtml);
  return { success: true };
}

export async function replaceElement(
  state: AppState,
  selector: string,
  newElementHtml: string,
) {
  validateSelector(selector);
  const filePath = resolveCurrentFile(state);
  const html = await readFile(filePath, "utf-8");
  const newHtml = parser.replaceElement(html, selector, newElementHtml);
  await writeWithHistory(state, filePath, html, newHtml);
  broadcastUpdate(state, newHtml, selector);
  return { success: true, selector };
}

export async function updateClasses(
  state: AppState,
  selector: string,
  add: string[],
  remove: string[],
) {
  validateSelector(selector);
  const filePath = resolveCurrentFile(state);
  const html = await readFile(filePath, "utf-8");
  const newHtml = parser.updateClasses(html, selector, add, remove);
  await writeWithHistory(state, filePath, html, newHtml);
  broadcastUpdate(state, newHtml, selector);
  return { success: true, selector };
}

export async function insertElement(
  state: AppState,
  selector: string,
  position: InsertPosition,
  newHtml: string,
) {
  validateSelector(selector);
  const filePath = resolveCurrentFile(state);
  const html = await readFile(filePath, "utf-8");
  const result = parser.insertElement(html, selector, position, newHtml);
  await writeWithHistory(state, filePath, html, result);
  broadcastUpdate(state, result, selector);
  return { success: true, selector, position };
}

export async function deleteElement(state: AppState, selector: string) {
  validateSelector(selector);
  const filePath = resolveCurrentFile(state);
  const html = await readFile(filePath, "utf-8");
  const newHtml = parser.deleteElement(html, selector);
  await writeWithHistory(state, filePath, html, newHtml);
  broadcastUpdate(state, newHtml);
  return { success: true, selector };
}

export async function updateText(
  state: AppState,
  selector: string,
  text: string,
) {
  validateSelector(selector);
  const filePath = resolveCurrentFile(state);
  const html = await readFile(filePath, "utf-8");
  const newHtml = parser.updateText(html, selector, text);
  await writeWithHistory(state, filePath, html, newHtml);
  broadcastUpdate(state, newHtml, selector);
  return { success: true, selector };
}

export async function updateAttribute(
  state: AppState,
  selector: string,
  attr: string,
  value: string,
) {
  validateSelector(selector);
  const filePath = resolveCurrentFile(state);
  const html = await readFile(filePath, "utf-8");
  const newHtml = parser.updateAttribute(html, selector, attr, value);
  await writeWithHistory(state, filePath, html, newHtml);
  broadcastUpdate(state, newHtml, selector);
  return { success: true, selector };
}

// --- Undo / Redo ---

export async function undo(state: AppState) {
  const filePath = resolveCurrentFile(state);
  const history = getFileHistory(state, filePath);
  const content = history.undo();
  if (!content) return { success: false, reason: "Nothing to undo" };
  await writeFile(filePath, content, "utf-8");
  broadcastUpdate(state, content);
  return { success: true };
}

export async function redo(state: AppState) {
  const filePath = resolveCurrentFile(state);
  const history = getFileHistory(state, filePath);
  const content = history.redo();
  if (!content) return { success: false, reason: "Nothing to redo" };
  await writeFile(filePath, content, "utf-8");
  broadcastUpdate(state, content);
  return { success: true };
}

// --- Highlight / Navigation ---

export function highlightElement(
  state: AppState,
  selector: string,
  options: { label?: string; style?: string; duration?: number | null },
) {
  broadcast(state, { type: "highlight", selector, options });
  return { success: true, selector };
}

export function highlightElements(
  state: AppState,
  items: Array<{ selector: string; label?: string }>,
) {
  broadcast(state, { type: "highlights", items });
  return { success: true, count: items.length };
}

export function clearHighlights(state: AppState) {
  broadcast(state, { type: "clear_highlights" });
  return { success: true };
}

export function navigateTo(state: AppState, navPath: string) {
  broadcast(state, { type: "navigate", path: navPath });
  return { success: true, path: navPath };
}

export function scrollTo(state: AppState, selector: string) {
  broadcast(state, { type: "scroll_to", selector });
  return { success: true, selector };
}

// --- Screenshot ---

// --- Table Operations ---

export async function tableAddRow(state: AppState, tableSelector: string) {
  validateSelector(tableSelector);
  const filePath = resolveCurrentFile(state);
  const html = await readFile(filePath, "utf-8");
  const newHtml = tableOps.addRow(html, tableSelector);
  await writeWithHistory(state, filePath, html, newHtml);
  broadcastUpdate(state, newHtml, tableSelector);
  return { success: true, tableSelector };
}

export async function tableRemoveRow(
  state: AppState,
  tableSelector: string,
  rowSelector: string,
) {
  validateSelector(tableSelector);
  validateSelector(rowSelector);
  const filePath = resolveCurrentFile(state);
  const html = await readFile(filePath, "utf-8");
  const newHtml = tableOps.removeRow(html, tableSelector, rowSelector);
  await writeWithHistory(state, filePath, html, newHtml);
  broadcastUpdate(state, newHtml, tableSelector);
  return { success: true, tableSelector };
}

export async function tableAddCol(state: AppState, tableSelector: string) {
  validateSelector(tableSelector);
  const filePath = resolveCurrentFile(state);
  const html = await readFile(filePath, "utf-8");
  const newHtml = tableOps.addCol(html, tableSelector);
  await writeWithHistory(state, filePath, html, newHtml);
  broadcastUpdate(state, newHtml, tableSelector);
  return { success: true, tableSelector };
}

export async function tableRemoveCol(
  state: AppState,
  tableSelector: string,
  colIndex: number,
) {
  validateSelector(tableSelector);
  const filePath = resolveCurrentFile(state);
  const html = await readFile(filePath, "utf-8");
  const newHtml = tableOps.removeCol(html, tableSelector, colIndex);
  await writeWithHistory(state, filePath, html, newHtml);
  broadcastUpdate(state, newHtml, tableSelector);
  return { success: true, tableSelector };
}

export async function getScreenshot(state: AppState, selector?: string) {
  const { captureScreenshot } = await import("../screenshot");
  let pagePath = state.currentPage;
  if (pagePath === "/") pagePath = "";
  const url = `http://localhost:${state.port}${pagePath}?__aceto_no_overlay`;
  const effectiveSelector = selector ?? state.currentSelection?.selector;
  const filePath = await captureScreenshot(url, state.projectDir, effectiveSelector);
  return { filePath, selector: effectiveSelector ?? null };
}
