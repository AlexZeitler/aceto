import { readFile, writeFile } from "fs/promises";
import path from "path";
import type { AppState } from "../state";
import * as parser from "../utils/html-parser";
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

export async function replacePage(state: AppState, newBodyHtml: string) {
  const filePath = resolveCurrentFile(state);
  const html = await readFile(filePath, "utf-8");
  const newHtml = parser.replacePage(html, newBodyHtml);
  await writeFile(filePath, newHtml, "utf-8");
  broadcast(state, { type: "reload" });
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
  await writeFile(filePath, newHtml, "utf-8");
  broadcast(state, { type: "reload" });
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
  await writeFile(filePath, newHtml, "utf-8");
  broadcast(state, { type: "reload" });
  return { success: true, selector };
}

export async function getPages(state: AppState) {
  const pages = parser.getPages(state.projectDir);
  return pages.map((file) => {
    let urlPath = "/" + file.replace(/\.html$/, "").replace(/\/index$/, "");
    if (urlPath === "/index") urlPath = "/";
    return { path: urlPath, file };
  });
}
