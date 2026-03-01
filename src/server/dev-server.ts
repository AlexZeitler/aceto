import { existsSync } from "fs";
import path from "path";
import { log } from "../utils/log";
import type { AppState, SelectionData } from "../state";
import { injectOverlay } from "./inject";
import { handleMcpRequest } from "../mcp/server";

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

interface WsSelectMessage {
  type: "select";
  selector: string;
  html: string;
  meta: {
    tag: string;
    classes: string[];
    text: string;
    parentSelector: string;
    siblings: { before: number; after: number };
    dimensions: { width: number; height: number };
  };
}

interface WsNavigateMessage {
  type: "navigate";
  path: string;
}

interface WsReadyMessage {
  type: "ready";
}

type WsMessage = WsSelectMessage | WsNavigateMessage | WsReadyMessage;

function handleWsMessage(
  state: AppState,
  data: WsMessage,
) {
  switch (data.type) {
    case "select":
      state.currentSelection = {
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
      log(`Selection: ${data.selector}`);
      break;
    case "ready":
      log("Browser ready");
      break;
    case "navigate":
      state.currentPage = data.path;
      log(`Navigate: ${data.path}`);
      break;
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
        const rawHtml = Bun.file(filePath).text();
        return rawHtml.then((html) => {
          state.currentPage = url.pathname;
          const injectedHtml = injectOverlay(html, state.port);
          return new Response(injectedHtml, {
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
        log(`Client connected (${state.wsClients.size} total)`);
      },
      message(ws, message) {
        try {
          const data = JSON.parse(message as string) as WsMessage;
          handleWsMessage(state, data);
        } catch (e) {
          log("Invalid WS message:", message);
        }
      },
      close(ws) {
        state.wsClients.delete(ws);
        log(`Client disconnected (${state.wsClients.size} total)`);
      },
    },
  });

  log(`Dev server running on http://localhost:${state.port}`);
  return server;
}
