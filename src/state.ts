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

export interface SelectionHistoryEntry {
  selector: string;
  page: string;
  timestamp: number;
}

export class FileHistory {
  private stack: string[] = [];
  private pointer = -1;
  private maxSize = 50;

  push(content: string) {
    // Discard any redo entries
    this.stack = this.stack.slice(0, this.pointer + 1);
    this.stack.push(content);
    if (this.stack.length > this.maxSize) {
      this.stack.shift();
    }
    this.pointer = this.stack.length - 1;
  }

  undo(): string | null {
    if (this.pointer <= 0) return null;
    this.pointer--;
    return this.stack[this.pointer];
  }

  redo(): string | null {
    if (this.pointer >= this.stack.length - 1) return null;
    this.pointer++;
    return this.stack[this.pointer];
  }

  get canUndo(): boolean {
    return this.pointer > 0;
  }

  get canRedo(): boolean {
    return this.pointer < this.stack.length - 1;
  }
}

export interface AppState {
  projectDir: string;
  port: number;
  currentPage: string;
  currentSelection: SelectionData | null;
  wsClients: Set<ServerWebSocket<unknown>>;
  fileHistories: Map<string, FileHistory>;
  selectionHistory: SelectionHistoryEntry[];
  activeClient: ServerWebSocket<unknown> | null;
}

const MAX_SELECTION_HISTORY = 20;

export function pushSelectionHistory(state: AppState, selection: SelectionData) {
  state.selectionHistory.push({
    selector: selection.selector,
    page: selection.page,
    timestamp: selection.timestamp,
  });
  if (state.selectionHistory.length > MAX_SELECTION_HISTORY) {
    state.selectionHistory.shift();
  }
}

export function getFileHistory(state: AppState, filePath: string): FileHistory {
  let history = state.fileHistories.get(filePath);
  if (!history) {
    history = new FileHistory();
    state.fileHistories.set(filePath, history);
  }
  return history;
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
    fileHistories: new Map(),
    selectionHistory: [],
    activeClient: null,
  };
}
