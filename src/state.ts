import type { ServerWebSocket } from "bun";

export interface SelectionData {
  selector: string;
  html: string;
  tag: string;
  classes: string[];
  text: string;
  parentSelector: string;
  siblings: { before: number; after: number };
  dimensions: { width: number; height: number };
  page: string;
  timestamp: number;
}

export interface AppState {
  projectDir: string;
  port: number;
  currentPage: string;
  currentSelection: SelectionData | null;
  wsClients: Set<ServerWebSocket<unknown>>;
}

export function createState(opts: {
  projectDir: string;
  port: number;
}): AppState {
  return {
    projectDir: opts.projectDir,
    port: opts.port,
    currentPage: "/",
    currentSelection: null,
    wsClients: new Set(),
  };
}
