import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { registerTools } from "./tools";
import { log } from "../utils/log";
import type { AppState } from "../state";

let transport: WebStandardStreamableHTTPServerTransport;

export async function startMcpServer(state: AppState) {
  const server = new McpServer({
    name: "aceto",
    version: "0.1.0",
  });

  registerTools(server, state);

  transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });

  await server.connect(transport);

  log("MCP server ready (HTTP transport)");
}

export async function handleMcpRequest(req: Request): Promise<Response> {
  return transport.handleRequest(req);
}
