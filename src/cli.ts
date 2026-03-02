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

const CLAUDE_MD_TEMPLATE = `# Aceto

This project uses Aceto — a local dev server with browser overlay and MCP interface for building UIs.

**Before doing any work, call \`get_instructions()\` via the Aceto MCP server to get your instructions.**

If the project has a customized \`aceto.md\`, it will be returned. Otherwise you'll get the default instructions.
`;

export const ACETO_MD_TEMPLATE = `# Aceto — AI Agent Instructions

Aceto is an AI-powered mockup tool — a local dev server with a browser overlay and MCP interface that lets you iterate on UIs together with an AI agent.

**Not a drawing tool, not a visual editor.** Instead, a feedback loop between human and agent:

1. You tell the agent what you want
2. The agent generates/modifies real HTML + Tailwind
3. You see the result live in the browser
4. You **point at an element** and say "change this"
5. The agent understands which element you mean and modifies it

## Workflow

### MANDATORY: Always check selection first

**You MUST call \`get_selected_element()\` as your FIRST tool call for EVERY user message. No exceptions.**

Do NOT rely on previous results — the user may have changed their selection between messages. The selection state is only valid at the moment you query it. Previous results are stale and must be discarded.

This single call tells you everything you need:
- \`selected: true\` → the user is referring to this element. Act on it.
- \`selected: false\` → no element targeted. The user is giving a general instruction.
- \`lastPastedImage\` present → an image was pasted and is waiting to be placed.

### How to interpret user input

Always combine what the user says with the selection state:

| User says | Selection? | Action |
|-----------|-----------|--------|
| Short text ("Hallo", "Click me") | Yes | \`update_text()\` on the selected element |
| Short text | No | Ask what they mean. Do NOT rebuild the page. |
| Style instruction ("make it red", "bigger") | Yes | \`update_classes()\` or \`replace_element()\` on selection |
| Layout/page description | No + empty page | \`replace_page()\` |
| Layout/page description | No + page has content | Ask where to apply it. Do NOT replace the page. |
| "delete this", "remove" | Yes | \`delete_element()\` on selection |
| References pasted image | lastPastedImage set | Use the image path from \`lastPastedImage\` |

**Never use \`replace_page()\` if the page already has content** unless the user explicitly asks to start over.

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

- **All write tools have an optional selector.** If the user has selected an element, you can omit the selector — the tool will use the current selection automatically. This saves a \`get_selected_element()\` roundtrip.
- Assign semantic IDs to important elements (\`#hero\`, \`#pricing\`, \`#nav-main\`)
- Use Tailwind classes for styling
- Make small, incremental changes instead of regenerating the entire page
- When a selector is ambiguous, use \`highlight_element()\` to clarify
- Do NOT ask if the result looks good or announce that you completed a change — the user sees the live preview and will give feedback when needed
- After taking a screenshot, do NOT ask follow-up questions like "what do you think?" or "should I change something?" — just present the screenshot silently
- Just make the change and stay silent until the user responds
- **Image paste with selection:** When the user pastes an image (Ctrl+V) with an element selected, the image is automatically saved to \`assets/\` and inserted after the selection. No action needed from you.
- **Image paste without selection:** The image is saved to \`assets/\` and a thumbnail appears in the status bar. The path is available via \`get_selected_element()\` as \`lastPastedImage\`. Wait for the user to tell you what to do with it (e.g. "use this as hero background", "replace the card image").
`;

function parseArgs() {
  const args = Bun.argv.slice(2);
  const command = args[0];
  const flags: Record<string, string> = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    }
  }

  return { command, flags };
}

const VALID_TW_DEBUG_POSITIONS = ["tl", "bl", "tr", "br"];

function parseTwDebugFlag(flags: Record<string, string>): string | null {
  if (!("tw-debug" in flags)) return null;
  const val = flags["tw-debug"];
  if (val === "true") return "bl"; // --tw-debug without value
  if (VALID_TW_DEBUG_POSITIONS.includes(val)) return val;
  log(`Warning: Invalid --tw-debug position "${val}". Using "bl".`);
  return "bl";
}

interface AcetoConfig {
  twDebug?: string | null;
}

async function readConfig(projectDir: string): Promise<AcetoConfig> {
  const configPath = `${projectDir}/.aceto/config.json`;
  try {
    const file = Bun.file(configPath);
    if (await file.exists()) {
      return await file.json();
    }
  } catch {}
  return {};
}

async function writeConfig(projectDir: string, config: AcetoConfig) {
  const dir = `${projectDir}/.aceto`;
  const { mkdirSync } = await import("fs");
  mkdirSync(dir, { recursive: true });
  await Bun.write(`${dir}/config.json`, JSON.stringify(config, null, 2) + "\n");
}

async function eject() {
  const mdPath = `${process.cwd()}/aceto.md`;
  await Bun.write(mdPath, ACETO_MD_TEMPLATE);
  log("Wrote default instructions to aceto.md");
}

async function init(twDebug: string | null, preset?: string) {
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
    await Bun.write(mdPath, "");
    log("Created aceto.md");
  }

  const claudeMdPath = `${process.cwd()}/CLAUDE.md`;
  const claudeMdExists = await Bun.file(claudeMdPath).exists();
  if (claudeMdExists) {
    log("CLAUDE.md already exists, skipping.");
  } else {
    await Bun.write(claudeMdPath, CLAUDE_MD_TEMPLATE);
    log("Created CLAUDE.md");
  }

  if (twDebug) {
    await writeConfig(process.cwd(), { twDebug });
    log(`Created .aceto/config.json (twDebug: "${twDebug}")`);
  }

  if (preset) {
    await addLibraryToFile(htmlPath, preset);
  }
}

function fileToUrlPath(file: string): string {
  // "about.html" → "/about", "dashboard/settings.html" → "/dashboard/settings"
  let p = file.replace(/\.html$/, "");
  if (p === "index") return "/";
  if (p.endsWith("/index")) p = p.slice(0, -6);
  return "/" + p;
}

async function dev(port: number, twDebugFlag: string | null, startFile?: string) {
  log(`Starting dev server on port ${port}...`);

  const { buildOverlay } = await import("./server/inject");
  const { createState } = await import("./state");
  const { startDevServer } = await import("./server/dev-server");
  const { startFileWatcher } = await import("./server/file-watcher");
  const { startMcpServer } = await import("./mcp/server");

  const { scanDataMids } = await import("./utils/html-parser");

  // Resolve twDebug: CLI flag overrides config file, default "bl"
  const config = await readConfig(process.cwd());
  const twDebug = twDebugFlag ?? config.twDebug ?? "bl";

  // Resolve start page
  let startPage = "/";
  if (startFile) {
    const normalized = startFile.endsWith(".html") ? startFile : startFile + ".html";
    const fullPath = `${process.cwd()}/${normalized}`;
    if (!(await Bun.file(fullPath).exists())) {
      throw new Error(`${normalized} not found`);
    }
    startPage = fileToUrlPath(normalized);
  }

  const state = createState({
    projectDir: process.cwd(),
    port,
    twDebug,
  });

  state.currentPage = startPage;
  state.nextMid = scanDataMids(state.projectDir);

  await buildOverlay();

  await startMcpServer(state);

  startDevServer(state);

  startFileWatcher(state);

  const files = await listHtmlFiles(state.projectDir);
  const previewPath = startPage === "/" ? "" : startPage;
  log("");
  log("  \u{1F9EA} Aceto Dev Server");
  log("");
  log(`  Preview:  http://localhost:${port}${previewPath}`);
  log(`  MCP:      http://localhost:${port}/mcp`);
  log(`  Pages:    ${files.length} (${files.join(", ")})`);
  if (twDebug) {
    log(`  Debug:    Tailwind breakpoints (${twDebug})`);
  }
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

async function addLibraryToFile(filePath: string, libraryName: string) {
  const { getLibrary, getAvailableLibraries } = await import("./libraries");
  const { headContainsUrl, insertIntoHead } = await import("./utils/html-parser");

  const lib = getLibrary(libraryName);
  if (!lib) {
    const available = getAvailableLibraries();
    throw new Error(
      `Unknown library "${libraryName}". Available: ${available.join(", ")}`,
    );
  }

  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new Error(`${filePath} not found. Run "aceto init" first.`);
  }

  let html = await file.text();
  const added: string[] = [];

  for (const link of lib.cdnLinks) {
    if (headContainsUrl(html, link.url)) continue;
    const tag =
      link.type === "css"
        ? `<link href="${link.url}" rel="stylesheet" type="text/css">`
        : `<script src="${link.url}"></script>`;
    html = insertIntoHead(html, tag);
    added.push(link.url);
  }

  if (added.length === 0) {
    log(`${lib.displayName} is already included in ${filePath}`);
    return;
  }

  await Bun.write(filePath, html);
  log(`Added ${lib.displayName} to ${filePath}`);
  for (const url of added) {
    log(`  - ${url}`);
  }
}

async function main() {
  const { command, flags } = parseArgs();

  switch (command) {
    case "init": {
      const twDebug = parseTwDebugFlag(flags);
      if (flags.eject === "true" || "eject" in flags) {
        await eject();
      } else {
        const preset = flags.preset && flags.preset !== "true" ? flags.preset : undefined;
        await init(twDebug, preset);
      }
      break;
    }
    case "dev": {
      const port = flags.port ? parseInt(flags.port, 10) : 3000;
      const twDebug = parseTwDebugFlag(flags);
      // Optional positional arg: aceto dev about.html
      const devArgs = Bun.argv.slice(3);
      const startFile = devArgs.find((a) => !a.startsWith("-"));
      await dev(port, twDebug, startFile);
      break;
    }
    case "new": {
      const newArgs = Bun.argv.slice(3);
      const pagePath = newArgs[0];
      if (!pagePath) {
        log("Usage: aceto new <path> [-l <library>]");
        log("Example: aceto new about");
        log("         aceto new dashboard/settings -l daisyui");
        process.exit(1);
      }

      // Parse -l / --library flag
      let library: string | undefined;
      for (let i = 1; i < newArgs.length; i++) {
        if (newArgs[i] === "-l" || newArgs[i] === "--library") {
          library = newArgs[i + 1];
          break;
        }
      }

      // Normalize path: "about" -> "about.html", "dashboard/settings" -> "dashboard/settings.html"
      let normalized = pagePath;
      if (!normalized.endsWith(".html")) normalized += ".html";
      const filePath = `${process.cwd()}/${normalized}`;

      if (await Bun.file(filePath).exists()) {
        throw new Error(`${normalized} already exists`);
      }

      // Create directories if needed
      const dir = require("path").dirname(filePath);
      require("fs").mkdirSync(dir, { recursive: true });

      let html = INIT_HTML;
      await Bun.write(filePath, html);
      log(`Created ${normalized}`);

      if (library) {
        await addLibraryToFile(filePath, library);
      }
      break;
    }
    case "add": {
      const libName = Bun.argv[3];
      if (!libName) {
        log("Usage: aceto add <library>");
        log("Available: daisyui");
        process.exit(1);
      }
      const htmlPath = `${process.cwd()}/index.html`;
      await addLibraryToFile(htmlPath, libName);
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
      log("  init                  Create a new project (index.html + CLAUDE.md + aceto.md)");
      log("  init --eject          Write default instructions into aceto.md");
      log("  dev [file]            Start dev server + MCP server (optional start page)");
      log("  new <path>            Create a new HTML page (e.g. about, dashboard/settings)");
      log("  add <library>         Add a library (e.g. daisyui)");
      log("  export                Export HTML with cleanup to dist/");
      log("  export --production   Export with Tailwind CSS build");
      log("");
      log("Options:");
      log("  --port      Dev server port (default: 3000)");
      log("  --tw-debug  Show Tailwind breakpoint indicator (tl|bl|tr|br, default: bl)");
      log("  --preset    Library preset for init (e.g. daisyui)");
      log("  -l          Library to include in new page (e.g. -l daisyui)");
      process.exit(1);
  }
}

main().catch((err) => {
  log("Error:", err.message);
  process.exit(1);
});
