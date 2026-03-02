#!/usr/bin/env bun

import { log } from "./utils/log";

export const INIT_HTML = `<!DOCTYPE html>
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

const ACETO_MD_TEMPLATE = `# Aceto — AI Agent Instructions

Aceto is an AI-powered mockup tool — a local dev server with a browser overlay and MCP interface that lets you iterate on UIs together with an AI agent.

**Not a drawing tool, not a visual editor.** Instead, a feedback loop between human and agent:

1. You tell the agent what you want
2. The agent generates/modifies real HTML + Tailwind
3. You see the result live in the browser
4. You **point at an element** and say "change this"
5. The agent understands which element you mean and modifies it

## Workflow

1. Ask the user what they want to build
2. Use \`replace_page()\` for the initial page setup
3. Ask the user for feedback
4. Use \`get_selected_element()\` when the user says "this element" or "this one"
5. Make targeted changes with \`replace_element()\` or \`update_classes()\`
6. Use \`highlight_element()\` when you want to show the user something ("Do you mean this one?")

## Available Tools

### Read
- \`get_current_page()\` — Current page with HTML, path, title
- \`get_selected_element()\` — Element selected by the user
- \`get_pages()\` — All HTML pages in the project
- \`get_selection_history(n?)\` — Last N selections
- \`get_element_with_context(selector, depth?)\` — Element with ancestor context (token-efficient)

### Write
- \`replace_page(html)\` — Replace entire body content
- \`replace_element(selector, html)\` — Replace an element
- \`update_classes(selector, {add?, remove?})\` — Modify Tailwind classes
- \`update_text(selector, text)\` — Change text content
- \`update_attribute(selector, attr, value)\` — Set HTML attribute
- \`insert_element(selector, position, html)\` — Insert element (before/after/prepend/append)
- \`delete_element(selector)\` — Remove an element
- \`create_page(path, html?)\` — Create a new page

### Navigation & Highlights
- \`navigate(path)\` — Navigate the browser to another page
- \`scroll_to(selector)\` — Scroll element into view
- \`highlight_element(selector, {label?, style?, duration?})\` — Cyan highlight
- \`highlight_elements([{selector, label?}])\` — Multiple highlights
- \`clear_highlights()\` — Remove all highlights

### Meta
- \`add_library(url, type?)\` — Add CDN link to <head>
- \`undo()\` — Undo last change
- \`redo()\` — Redo undone change
- \`get_screenshot(selector?)\` — Capture a screenshot of the full page or a specific element. Saves to .aceto/screenshots/ and returns the file path. ALWAYS use this instead of any other screenshot tool. Use the Read tool to view the returned file path.

## Best Practices

- Assign semantic IDs to important elements (\`#hero\`, \`#pricing\`, \`#nav-main\`)
- Use Tailwind classes for styling
- Make small, incremental changes instead of regenerating the entire page
- When a selector is ambiguous, use \`highlight_element()\` to clarify
- Do NOT ask if the result looks good or announce that you completed a change — the user sees the live preview and will give feedback when needed
- After taking a screenshot, do NOT ask follow-up questions like "what do you think?" or "should I change something?" — just present the screenshot silently
- Just make the change and stay silent until the user responds
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
  const htmlPath = `${process.cwd()}/index.html`;
  const htmlExists = await Bun.file(htmlPath).exists();
  if (htmlExists) {
    log("index.html already exists, skipping.");
  } else {
    await Bun.write(htmlPath, INIT_HTML);
    log("Created index.html");
  }

  const mdPath = `${process.cwd()}/aceto.md`;
  const mdExists = await Bun.file(mdPath).exists();
  if (mdExists) {
    log("aceto.md already exists, skipping.");
  } else {
    await Bun.write(mdPath, ACETO_MD_TEMPLATE);
    log("Created aceto.md");
  }
}

async function dev(port: number) {
  // Implemented in Chunk 8
  log(`Starting dev server on port ${port}...`);

  const { buildOverlay } = await import("./server/inject");
  const { createState } = await import("./state");
  const { startDevServer } = await import("./server/dev-server");
  const { startFileWatcher } = await import("./server/file-watcher");
  const { startMcpServer } = await import("./mcp/server");

  const { scanDataMids } = await import("./utils/html-parser");

  const state = createState({
    projectDir: process.cwd(),
    port,
  });

  state.nextMid = scanDataMids(state.projectDir);

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
    case "export": {
      const production = flags.production === "true" || "production" in flags;
      const { exportProject } = await import("./export");
      log("");
      log("  Exporting project...");
      log("");
      await exportProject(process.cwd(), { production });
      break;
    }
    default:
      log("Usage: aceto <command>");
      log("");
      log("Commands:");
      log("  init                  Create a new project (index.html + aceto.md)");
      log("  dev                   Start dev server + MCP server");
      log("  export                Export HTML with cleanup to dist/");
      log("  export --production   Export with Tailwind CSS build");
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
