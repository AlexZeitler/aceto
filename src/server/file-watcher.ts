import { watch } from "fs";
import type { AppState } from "../state";
import { broadcast } from "./dev-server";
import { log } from "../utils/log";

export function startFileWatcher(state: AppState) {
  const debounceTimers = new Map<string, Timer>();

  const watcher = watch(
    state.projectDir,
    { recursive: true },
    (event, filename) => {
      if (!filename) return;
      if (!filename.endsWith(".html")) return;
      // Ignore node_modules and hidden directories
      if (filename.includes("node_modules") || filename.startsWith(".")) return;

      const existing = debounceTimers.get(filename);
      if (existing) clearTimeout(existing);

      debounceTimers.set(
        filename,
        setTimeout(() => {
          debounceTimers.delete(filename);
          log(`File changed: ${filename}`);
          broadcast(state, { type: "reload" });
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
