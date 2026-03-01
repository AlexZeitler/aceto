import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { registerTools } from "./tools";
import { log } from "../utils/log";
import type { AppState } from "../state";

let appState: AppState;
let currentSession: {
  transport: WebStandardStreamableHTTPServerTransport;
  server: McpServer;
  sessionId: string | null;
} | null = null;

function createSession() {
  const server = new McpServer({
    name: "aceto",
    version: "0.1.0",
  });
  registerTools(server, appState);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });

  return { transport, server, sessionId: null as string | null };
}

async function ensureSession(reqUrl: string) {
  if (currentSession) return;

  const session = createSession();
  await session.server.connect(session.transport);

  // Synthesize an initialize handshake so the transport is ready
  const initResp = await session.transport.handleRequest(
    new Request(reqUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "_auto_init",
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "aceto-auto", version: "0.1.0" },
        },
      }),
    }),
  );

  const sid = initResp.headers.get("mcp-session-id");
  session.sessionId = sid;

  // Send the required initialized notification
  const notifHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sid) notifHeaders["mcp-session-id"] = sid;

  await session.transport.handleRequest(
    new Request(reqUrl, {
      method: "POST",
      headers: notifHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    }),
  );

  currentSession = session;
  log(`MCP auto-initialized: ${sid?.slice(0, 8) ?? "?"}...`);
}

export async function startMcpServer(state: AppState) {
  appState = state;
  log("MCP server ready (HTTP transport)");
}

export async function handleMcpRequest(req: Request): Promise<Response> {
  if (req.method === "GET") {
    if (currentSession) {
      return currentSession.transport.handleRequest(req);
    }
    return new Response("No active session", { status: 400 });
  }

  if (req.method === "DELETE") {
    currentSession = null;
    return new Response(null, { status: 204 });
  }

  // POST
  const body = await req.text();
  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const isInitialize = parsed.method === "initialize";

  // Explicit initialize from client → fresh session
  if (isInitialize) {
    const session = createSession();
    await session.server.connect(session.transport);

    const headers = new Headers(req.headers);
    headers.delete("mcp-session-id");

    const response = await session.transport.handleRequest(
      new Request(req.url, { method: "POST", headers, body }),
    );

    const sid = response.headers.get("mcp-session-id");
    session.sessionId = sid;
    currentSession = session;
    log(`MCP session: ${sid?.slice(0, 8) ?? "?"}...`);

    return response;
  }

  // All other requests: ensure a session exists (auto-init if needed)
  await ensureSession(req.url);

  const headers = new Headers(req.headers);
  if (currentSession!.sessionId) {
    headers.set("mcp-session-id", currentSession!.sessionId);
  }

  return currentSession!.transport.handleRequest(
    new Request(req.url, { method: "POST", headers, body }),
  );
}
