import { existsSync, readFileSync, writeFileSync } from "fs";
import { mkdir, writeFile as writeFileAsync } from "fs/promises";
import path from "path";
import { log } from "../utils/log";
import type { AppState, SelectionData } from "../state";
import { pushSelectionHistory, getNextMid, getFileHistory } from "../state";
import { injectOverlay } from "./inject";
import { handleMcpRequest } from "../mcp/server";
import { addDataMid, updateText, getPages, extractBodyContent } from "../utils/html-parser";
import {
  undo,
  redo,
  deleteElement,
  insertElement,
  tableAddRow,
  tableRemoveRow,
  tableAddCol,
  tableRemoveCol,
  replaceElement,
} from "../mcp/html-ops";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
};

function resolveFilePath(
  urlPath: string,
  projectDir: string,
): string | null {
  if (urlPath === "/") {
    const p = path.join(projectDir, "index.html");
    return existsSync(p) ? p : null;
  }

  // Try direct .html match first, then index.html in directory
  const candidates = [
    path.join(projectDir, urlPath + ".html"),
    path.join(projectDir, urlPath, "index.html"),
    path.join(projectDir, urlPath),
  ];

  for (const candidate of candidates) {
    // Prevent path traversal
    if (!candidate.startsWith(projectDir)) continue;
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

export function broadcast(state: AppState, message: object) {
  const json = JSON.stringify(message);
  for (const ws of state.wsClients) {
    ws.send(json);
  }
}

export function broadcastPageList(state: AppState) {
  const files = getPages(state.projectDir);
  const pages = files.map((file) => {
    let urlPath = "/" + file.replace(/\.html$/, "").replace(/\/index$/, "");
    if (urlPath === "/index") urlPath = "/";
    return { path: urlPath, file };
  });
  broadcast(state, { type: "pages", pages });
}

interface WsSelectMessage {
  type: "select";
  selector: string;
  html: string;
  dataMid?: string;
  fallbackSelector?: string;
  meta: {
    tag: string;
    classes: string[];
    text: string;
    parentSelector: string;
    siblings: { before: number; after: number };
    dimensions: { width: number; height: number };
  };
}

interface WsMultiSelectElement {
  selector: string;
  html: string;
  dataMid?: string;
  fallbackSelector?: string;
  meta: WsSelectMessage["meta"];
}

interface WsMultiSelectMessage {
  type: "multi_select";
  elements: WsMultiSelectElement[];
}

interface WsNavigateMessage {
  type: "navigate";
  path: string;
}

interface WsReadyMessage {
  type: "ready";
}

interface WsDeselectMessage {
  type: "deselect";
}

interface WsTextEditMessage {
  type: "text_edit";
  selector: string;
  fallbackSelector?: string;
  text: string;
}

interface WsUndoRedoMessage {
  type: "undo" | "redo";
}

interface WsDeleteElementMessage {
  type: "delete_element";
  selector: string;
}

interface WsTableOpMessage {
  type: "table_op";
  action: "add-row" | "remove-row" | "add-col" | "remove-col";
  tableSelector: string;
  rowSelector?: string;
  colIndex?: number;
}

interface WsShortcutExpandMessage {
  type: "shortcut_expand";
  selector: string;
  fallbackSelector?: string;
  html: string;
}

interface WsListAssetsMessage {
  type: "list_assets";
}

interface WsPickAssetMessage {
  type: "pick_asset";
  path: string;
}

type WsMessage = WsSelectMessage | WsMultiSelectMessage | WsNavigateMessage | WsReadyMessage | WsDeselectMessage | WsTextEditMessage | WsUndoRedoMessage | WsDeleteElementMessage | WsTableOpMessage | WsShortcutExpandMessage | WsListAssetsMessage | WsPickAssetMessage;

function handleWsMessage(
  state: AppState,
  data: WsMessage,
  ws: import("bun").ServerWebSocket<unknown>,
) {
  switch (data.type) {
    case "select": {
      state.activeClient = ws;

      // Sync nextMid counter with browser-assigned mids
      if (data.dataMid) {
        const num = parseInt(data.dataMid.slice(1), 10);
        if (num >= state.nextMid) {
          state.nextMid = num + 1;
        }
      }

      // Persist data-mid to HTML file if browser assigned a new one
      if (data.dataMid && data.fallbackSelector) {
        persistDataMid(state, data.fallbackSelector, data.dataMid);
      } else if (!data.dataMid && !data.selector.startsWith("#") && !data.selector.startsWith("[data-mid=")) {
        // Server fallback: assign data-mid if browser didn't
        const mid = getNextMid(state);
        persistDataMid(state, data.selector, mid);
        data.selector = `[data-mid="${mid}"]`;
      }

      const selection: SelectionData = {
        selector: data.selector,
        html: data.html,
        tag: data.meta.tag,
        classes: data.meta.classes,
        text: data.meta.text,
        parentSelector: data.meta.parentSelector,
        siblings: data.meta.siblings,
        dimensions: data.meta.dimensions,
        page: state.currentPage,
        timestamp: Date.now(),
      };
      state.currentSelection = selection;
      state.multiSelection = [];
      pushSelectionHistory(state, selection);
      log(`Selection: ${data.selector}`);
      break;
    }
    case "multi_select": {
      state.activeClient = ws;

      const selections: SelectionData[] = [];
      for (const elem of data.elements) {
        if (elem.dataMid) {
          const num = parseInt(elem.dataMid.slice(1), 10);
          if (num >= state.nextMid) state.nextMid = num + 1;
        }
        if (elem.dataMid && elem.fallbackSelector) {
          persistDataMid(state, elem.fallbackSelector, elem.dataMid);
        }

        selections.push({
          selector: elem.selector,
          html: elem.html,
          tag: elem.meta.tag,
          classes: elem.meta.classes,
          text: elem.meta.text,
          parentSelector: elem.meta.parentSelector,
          siblings: elem.meta.siblings,
          dimensions: elem.meta.dimensions,
          page: state.currentPage,
          timestamp: Date.now(),
        });
      }

      state.multiSelection = selections;
      state.currentSelection = selections[selections.length - 1] ?? null;
      log(`Multi-select: ${selections.length} elements`);
      break;
    }
    case "deselect":
      state.currentSelection = null;
      state.multiSelection = [];
      log("Deselected");
      break;
    case "ready":
      log("Browser ready");
      break;
    case "navigate":
      state.currentPage = data.path;
      log(`Navigate: ${data.path}`);
      break;
    case "text_edit": {
      try {
        const filePath = resolveCurrentFilePath(state);
        const html = readFileSync(filePath, "utf-8");
        // Prefer fallback selector (structural path) over data-mid which may have duplicates
        const selector = data.fallbackSelector || data.selector;
        const newHtml = updateText(html, selector, data.text);
        if (newHtml !== html) {
          const history = getFileHistory(state, filePath);
          history.pushEdit(html, newHtml);
          state.recentServerWrites.add(filePath);
          writeFileSync(filePath, newHtml, "utf-8");
          log(`Text edit: ${selector} → "${data.text.slice(0, 50)}"`);
        }
      } catch (e: any) {
        log(`Text edit failed: ${e.message}`);
      }
      break;
    }
    case "undo": {
      undo(state).then((result) => {
        log(result.success ? "Undo" : `Undo failed: ${result.reason}`);
      });
      break;
    }
    case "redo": {
      redo(state).then((result) => {
        log(result.success ? "Redo" : `Redo failed: ${result.reason}`);
      });
      break;
    }
    case "delete_element": {
      state.currentSelection = null;
      deleteElement(state, data.selector).then((result) => {
        log(result.success ? `Deleted: ${data.selector}` : `Delete failed`);
      }).catch((e: any) => {
        log(`Delete failed: ${e.message}`);
      });
      break;
    }
    case "table_op": {
      const { action, tableSelector, rowSelector, colIndex } = data;
      let promise: Promise<any>;
      switch (action) {
        case "add-row":
          promise = tableAddRow(state, tableSelector);
          break;
        case "remove-row":
          promise = tableRemoveRow(state, tableSelector, rowSelector!);
          break;
        case "add-col":
          promise = tableAddCol(state, tableSelector);
          break;
        case "remove-col":
          promise = tableRemoveCol(state, tableSelector, colIndex!);
          break;
        default:
          log(`Unknown table_op action: ${action}`);
          return;
      }
      promise
        .then(() => log(`Table op: ${action} on ${tableSelector}`))
        .catch((e: any) => log(`Table op failed: ${e.message}`));
      break;
    }
    case "shortcut_expand": {
      try {
        const filePath = resolveCurrentFilePath(state);
        const html = readFileSync(filePath, "utf-8");
        const selector = data.fallbackSelector || data.selector;
        // Replace inner content of the element with the expanded HTML
        const newHtml = updateText(html, selector, data.html);
        if (newHtml !== html) {
          const history = getFileHistory(state, filePath);
          history.pushEdit(html, newHtml);
          state.recentServerWrites.add(filePath);
          writeFileSync(filePath, newHtml, "utf-8");
          const bodyContent = extractBodyContent(newHtml);
          if (bodyContent !== null) {
            broadcast(state, { type: "update", html: bodyContent });
            broadcast(state, { type: "flash", selector });
          } else {
            broadcast(state, { type: "reload" });
          }
          log(`Shortcut expand: ${selector} → "${data.html}"`);
        }
      } catch (e: any) {
        log(`Shortcut expand failed: ${e.message}`);
      }
      break;
    }
    case "list_assets": {
      try {
        const assetsDir = path.join(state.projectDir, "assets");
        const assets: Array<{ path: string; name: string }> = [];
        if (existsSync(assetsDir)) {
          const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
          for (const entry of require("fs").readdirSync(assetsDir)) {
            const ext = path.extname(entry).toLowerCase();
            if (IMAGE_EXTS.has(ext)) {
              assets.push({ path: `/assets/${entry}`, name: entry });
            }
          }
          assets.sort((a, b) => a.name.localeCompare(b.name));
        }
        ws.send(JSON.stringify({ type: "assets_list", assets }));
      } catch (e: any) {
        log(`List assets failed: ${e.message}`);
        ws.send(JSON.stringify({ type: "assets_list", assets: [] }));
      }
      break;
    }
    case "pick_asset": {
      state.lastPastedImage = data.path;
      broadcast(state, { type: "image_pasted", path: data.path });
      log(`Asset picked: ${data.path}`);
      break;
    }
  }
}

function resolveCurrentFilePath(state: AppState): string {
  let pagePath = state.currentPage;
  if (pagePath === "/") pagePath = "/index.html";
  else if (!pagePath.endsWith(".html")) pagePath += ".html";
  return path.join(state.projectDir, pagePath);
}

function persistDataMid(state: AppState, fallbackSelector: string, mid: string) {
  try {
    const filePath = resolveCurrentFilePath(state);
    const html = readFileSync(filePath, "utf-8");
    const newHtml = addDataMid(html, fallbackSelector, mid);
    if (newHtml !== html) {
      state.recentServerWrites.add(filePath);
      writeFileSync(filePath, newHtml, "utf-8");
      log(`Persisted data-mid="${mid}" via ${fallbackSelector}`);
    }
  } catch (e: any) {
    log(`Failed to persist data-mid: ${e.message}`);
  }
}

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

async function handlePasteImage(state: AppState, req: Request): Promise<Response> {
  try {
    const formData = await req.formData();
    const image = formData.get("image") as File | null;
    const selector = (formData.get("selector") as string) || "";

    if (!image || !image.type.startsWith("image/")) {
      return Response.json({ error: "No image provided" }, { status: 400 });
    }

    const ext = MIME_TO_EXT[image.type] || "png";
    const filename = `paste-${Date.now()}.${ext}`;
    const assetsDir = path.join(state.projectDir, "assets");
    await mkdir(assetsDir, { recursive: true });

    const buffer = await image.arrayBuffer();
    await writeFileAsync(path.join(assetsDir, filename), Buffer.from(buffer));

    const assetPath = `/assets/${filename}`;
    state.lastPastedImage = assetPath;

    if (selector) {
      // Element selected → insert immediately after selection
      const imgClasses = state.elementDefaults.img || "max-w-full h-auto";
      const imgTag = `<img src="${assetPath}" alt="" class="${imgClasses}">`;
      await insertElement(state, selector, "after", imgTag);
      log(`Pasted image after ${selector}: ${assetPath}`);
    } else {
      // No selection → store for agent, show thumbnail in overlay
      broadcast(state, { type: "image_pasted", path: assetPath });
      log(`Pasted image (staged for agent): ${assetPath}`);
    }

    return Response.json({ success: true, file: `assets/${filename}`, path: assetPath });
  } catch (e: any) {
    log(`Paste image failed: ${e.message}`);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export function startDevServer(state: AppState) {
  const server = Bun.serve({
    port: state.port,
    fetch(req, server) {
      const url = new URL(req.url);

      // MCP endpoint
      if (url.pathname === "/mcp") {
        return handleMcpRequest(req);
      }

      // Paste image endpoint
      if (url.pathname === "/api/paste-image" && req.method === "POST") {
        return handlePasteImage(state, req);
      }

      // WebSocket upgrade
      if (req.headers.get("upgrade") === "websocket") {
        const success = server.upgrade(req);
        if (success) return undefined;
        return new Response("WebSocket upgrade failed", { status: 400 });
      }

      const filePath = resolveFilePath(url.pathname, state.projectDir);

      if (!filePath) {
        return new Response("Not Found", { status: 404 });
      }

      const ext = path.extname(filePath);
      const contentType = MIME_TYPES[ext] || "application/octet-stream";

      // For HTML files: inject overlay and track current page
      if (ext === ".html") {
        const noOverlay = url.searchParams.has("__aceto_no_overlay");
        const rawHtml = Bun.file(filePath).text();
        return rawHtml.then((html) => {
          state.currentPage = url.pathname;
          const responseHtml = noOverlay ? html : injectOverlay(html, state.port);
          return new Response(responseHtml, {
            headers: { "Content-Type": contentType },
          });
        });
      }

      // Static files
      return new Response(Bun.file(filePath), {
        headers: { "Content-Type": contentType },
      });
    },
    websocket: {
      open(ws) {
        state.wsClients.add(ws);
        ws.send(JSON.stringify({ type: "mid_counter", value: state.nextMid }));
        ws.send(JSON.stringify({ type: "config", twDebug: state.twDebug, defaults: state.elementDefaults }));
        broadcastPageList(state);
        log(`Client connected (${state.wsClients.size} total)`);
      },
      message(ws, message) {
        try {
          const data = JSON.parse(message as string) as WsMessage;
          handleWsMessage(state, data, ws);
        } catch (e) {
          log("Invalid WS message:", message);
        }
      },
      close(ws) {
        state.wsClients.delete(ws);
        if (state.activeClient === ws) {
          state.activeClient = null;
        }
        log(`Client disconnected (${state.wsClients.size} total)`);
      },
    },
  });

  log(`Dev server running on http://localhost:${state.port}`);
  return server;
}
