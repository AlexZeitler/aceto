import { readFile, writeFile } from "fs/promises";
import path from "path";
import type { AppState } from "../state";
import { getFileHistory } from "../state";
import * as parser from "../utils/html-parser";
import type { InsertPosition } from "../utils/html-parser";
import { broadcast } from "../server/dev-server";

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
  history.push(oldHtml);
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
  if (!state.currentSelection) return { selected: false as const };
  return { selected: true as const, ...state.currentSelection };
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
  const filePath = resolveCurrentFile(state);
  const html = await readFile(filePath, "utf-8");
  const result = parser.insertElement(html, selector, position, newHtml);
  await writeWithHistory(state, filePath, html, result);
  broadcastUpdate(state, result, selector);
  return { success: true, selector, position };
}

export async function deleteElement(state: AppState, selector: string) {
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
