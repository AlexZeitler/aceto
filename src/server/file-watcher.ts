import { watch } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import type { AppState } from "../state";
import { broadcast, broadcastPageList } from "./dev-server";
import { extractBodyContent } from "../utils/html-parser";
import { log } from "../utils/log";

export function startFileWatcher(state: AppState) {
  const debounceTimers = new Map<string, Timer>();

  const watcher = watch(
    state.projectDir,
    { recursive: true },
    (event, filename) => {
      if (!filename) return;
      if (!filename.endsWith(".html")) return;
      if (filename.includes("node_modules") || filename.startsWith(".")) return;

      const existing = debounceTimers.get(filename);
      if (existing) clearTimeout(existing);

      debounceTimers.set(
        filename,
        setTimeout(async () => {
          debounceTimers.delete(filename);

          const filePath = path.join(state.projectDir, filename);

          // Skip broadcast if this file was just written by the server
          // (e.g. text_edit, table_op from browser) — the client already
          // has the correct state and a morph would disrupt editing.
          if (state.recentServerWrites.delete(filePath)) {
            log(`File changed (server-write, skip broadcast): ${filename}`);
            broadcastPageList(state);
            return;
          }

          log(`File changed: ${filename}`);

          try {
            const html = await readFile(filePath, "utf-8");
            const bodyContent = extractBodyContent(html);

            if (bodyContent !== null) {
              broadcast(state, { type: "update", html: bodyContent });
            } else {
              broadcast(state, { type: "reload" });
            }
            broadcastPageList(state);
          } catch {
            broadcast(state, { type: "reload" });
          }
        }, 100),
      );
    },
  );

  process.on("SIGINT", () => {
    watcher.close();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    watcher.close();
    process.exit(0);
  });

  log("File watcher started");
  return watcher;
}
