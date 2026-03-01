#!/usr/bin/env bun

import { log } from "./utils/log";

const INIT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aceto</title>
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
</head>
<body class="min-h-screen bg-gray-50">
</body>
</html>
`;

function parseArgs() {
  const args = Bun.argv.slice(2);
  const command = args[0];
  const flags: Record<string, string> = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      flags[key] = args[i + 1] ?? "true";
      i++;
    }
  }

  return { command, flags };
}

async function init() {
  const filePath = `${process.cwd()}/index.html`;
  const exists = await Bun.file(filePath).exists();
  if (exists) {
    log("index.html already exists, skipping.");
    return;
  }
  await Bun.write(filePath, INIT_HTML);
  log("Created index.html");
}

async function dev(port: number) {
  // Implemented in Chunk 8
  log(`Starting dev server on port ${port}...`);

  const { buildOverlay } = await import("./server/inject");
  const { createState } = await import("./state");
  const { startDevServer } = await import("./server/dev-server");
  const { startFileWatcher } = await import("./server/file-watcher");
  const { startMcpServer } = await import("./mcp/server");

  const state = createState({
    projectDir: process.cwd(),
    port,
  });

  await buildOverlay();

  await startMcpServer(state);

  startDevServer(state);

  startFileWatcher(state);

  const files = await listHtmlFiles(state.projectDir);
  log("");
  log("  \u{1F9EA} Aceto Dev Server");
  log("");
  log(`  Preview:  http://localhost:${port}`);
  log(`  MCP:      http://localhost:${port}/mcp`);
  log(`  Pages:    ${files.length} (${files.join(", ")})`);
  log("");
  log("  Watching for changes...");
}

async function listHtmlFiles(dir: string): Promise<string[]> {
  const glob = new Bun.Glob("**/*.html");
  const files: string[] = [];
  for await (const path of glob.scan({ cwd: dir })) {
    files.push(path);
  }
  return files.sort();
}

async function main() {
  const { command, flags } = parseArgs();

  switch (command) {
    case "init":
      await init();
      break;
    case "dev": {
      const port = flags.port ? parseInt(flags.port, 10) : 3000;
      await dev(port);
      break;
    }
    default:
      log("Usage: aceto <command>");
      log("");
      log("Commands:");
      log("  init    Create a new project (index.html)");
      log("  dev     Start dev server + MCP server");
      log("");
      log("Options:");
      log("  --port  Dev server port (default: 3000)");
      process.exit(1);
  }
}

main().catch((err) => {
  log("Error:", err.message);
  process.exit(1);
});
