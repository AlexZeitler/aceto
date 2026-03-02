import { z } from "zod";
import { existsSync, readFileSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppState } from "../state";
import { ACETO_MD_TEMPLATE } from "../cli";
import * as htmlOps from "./html-ops";
import { detectLibraries } from "../utils/html-parser";
import { getLibrary } from "../libraries";

function toolResult(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}

function toolError(e: any) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: e.message }) }],
    isError: true,
  };
}

function resolveSelector(state: AppState, selector?: string): string {
  if (selector) return selector;
  if (state.currentSelection) return state.currentSelection.selector;
  throw new Error("No selector provided and no element selected in the browser");
}

export function registerTools(server: McpServer, state: AppState) {
  // --- Instructions ---

  server.tool(
    "get_instructions",
    "Returns the agent instructions for this project. Call this first before doing any work. Returns the project's aceto.md if it exists, otherwise returns the default instructions.",
    {},
    async () => {
      const acetoMdPath = path.join(state.projectDir, "aceto.md");
      let source = "default";
      let instructions = ACETO_MD_TEMPLATE;

      if (existsSync(acetoMdPath)) {
        const content = readFileSync(acetoMdPath, "utf-8").trim();
        if (content) {
          source = "aceto.md";
          instructions = content;
        }
      }

      // Detect libraries in the current page and append their instructions
      let libraries: string[] = [];
      try {
        let pagePath = state.currentPage;
        if (pagePath === "/") pagePath = "/index.html";
        else if (!pagePath.endsWith(".html")) pagePath += ".html";
        const filePath = path.join(state.projectDir, pagePath);
        const html = await readFile(filePath, "utf-8");
        libraries = detectLibraries(html);
        for (const libName of libraries) {
          const lib = getLibrary(libName);
          if (lib) {
            instructions += "\n\n" + lib.instructions;
          }
        }
      } catch {
        // File not readable — skip library detection
      }

      return toolResult({ source, instructions, libraries });
    },
  );

  // --- Read Tools ---

  server.tool(
    "get_current_page",
    "Returns the currently displayed page in the browser, including its full HTML content, path, and title.",
    {},
    async () => {
      try {
        return toolResult(await htmlOps.getCurrentPage(state));
      } catch (e: any) {
        return toolError(e);
      }
    },
  );

  server.tool(
    "get_selected_element",
    "Returns the element the user has selected in the browser. Returns { selected: false } if nothing is selected.",
    {},
    async () => {
      return toolResult(htmlOps.getSelectedElement(state));
    },
  );

  server.tool(
    "get_pages",
    "Lists all HTML pages in the project with their URL paths.",
    {},
    async () => {
      return toolResult(await htmlOps.getPages(state));
    },
  );

  server.tool(
    "get_selection_history",
    "Returns the last N element selections made by the user.",
    {
      n: z.number().optional().describe("Number of recent selections to return (default: all)"),
    },
    async ({ n }) => {
      return toolResult(htmlOps.getSelectionHistory(state, n));
    },
  );

  server.tool(
    "get_element_with_context",
    "Returns an element with its ancestor context. More token-efficient than get_current_page() for large pages. Ancestors are shown with '...' placeholders for siblings.",
    {
      selector: z.string().describe("CSS selector of the target element"),
      depth: z.number().optional().describe("Number of ancestor levels to include (default: 0 = element only)"),
    },
    async ({ selector, depth }) => {
      try {
        return toolResult(await htmlOps.getElementWithContext(state, selector, depth));
      } catch (e: any) {
        return toolError(e);
      }
    },
  );

  server.tool(
    "create_page",
    "Create a new HTML page in the project. If no HTML is provided, creates a minimal page with Tailwind CDN.",
    {
      path: z.string().describe("URL path for the new page (e.g. /login, /dashboard/settings)"),
      html: z.string().optional().describe("Optional HTML content. If omitted, creates a minimal Tailwind page."),
    },
    async ({ path, html }) => {
      try {
        return toolResult(await htmlOps.createPage(state, path, html));
      } catch (e: any) {
        return toolError(e);
      }
    },
  );

  server.tool(
    "add_library",
    "Add a CSS or JavaScript library via CDN URL to the current page's <head>. Auto-detects type from URL extension.",
    {
      url: z.string().describe("CDN URL of the library"),
      type: z.enum(["css", "script"]).optional().describe("Force type: 'css' for <link>, 'script' for <script>. Auto-detected from URL if omitted."),
    },
    async ({ url, type }) => {
      try {
        return toolResult(await htmlOps.addLibrary(state, url, type));
      } catch (e: any) {
        return toolError(e);
      }
    },
  );

  // --- Write Tools ---

  server.tool(
    "replace_page",
    "Replaces the entire body content of the current page. Use for initial page setup or major restructuring.",
    {
      html: z.string().describe("New HTML content for the <body> element"),
    },
    async ({ html }) => {
      try {
        return toolResult(await htmlOps.replacePage(state, html));
      } catch (e: any) {
        return toolError(e);
      }
    },
  );

  server.tool(
    "replace_element",
    "Replaces a specific element identified by CSS selector with new HTML. If no selector is provided, uses the currently selected element.",
    {
      selector: z.string().optional().describe("CSS selector of the element to replace. If omitted, uses the current browser selection."),
      html: z.string().describe("New HTML to replace the element with"),
    },
    async ({ selector, html }) => {
      try {
        return toolResult(await htmlOps.replaceElement(state, resolveSelector(state, selector), html));
      } catch (e: any) {
        return toolError(e);
      }
    },
  );

  server.tool(
    "update_classes",
    "Add or remove Tailwind/CSS classes on an element without replacing its HTML. If no selector is provided, uses the currently selected element.",
    {
      selector: z.string().optional().describe("CSS selector of the element. If omitted, uses the current browser selection."),
      add: z.array(z.string()).optional().describe("Classes to add"),
      remove: z.array(z.string()).optional().describe("Classes to remove"),
    },
    async ({ selector, add, remove }) => {
      try {
        return toolResult(
          await htmlOps.updateClasses(state, resolveSelector(state, selector), add ?? [], remove ?? []),
        );
      } catch (e: any) {
        return toolError(e);
      }
    },
  );

  server.tool(
    "insert_element",
    "Insert a new HTML element relative to an existing element identified by CSS selector. If no selector is provided, uses the currently selected element.",
    {
      selector: z.string().optional().describe("CSS selector of the reference element. If omitted, uses the current browser selection."),
      position: z
        .enum(["before", "after", "prepend", "append"])
        .describe("Where to insert: before/after the element, or prepend/append inside it"),
      html: z.string().describe("HTML to insert"),
    },
    async ({ selector, position, html }) => {
      try {
        return toolResult(
          await htmlOps.insertElement(state, resolveSelector(state, selector), position, html),
        );
      } catch (e: any) {
        return toolError(e);
      }
    },
  );

  server.tool(
    "delete_element",
    "Remove an element from the page. If no selector is provided, deletes the currently selected element.",
    {
      selector: z.string().optional().describe("CSS selector of the element to delete. If omitted, uses the current browser selection."),
    },
    async ({ selector }) => {
      try {
        return toolResult(await htmlOps.deleteElement(state, resolveSelector(state, selector)));
      } catch (e: any) {
        return toolError(e);
      }
    },
  );

  server.tool(
    "update_text",
    "Update the text content of an element without changing its structure or attributes. If no selector is provided, uses the currently selected element.",
    {
      selector: z.string().optional().describe("CSS selector of the element. If omitted, uses the current browser selection."),
      text: z.string().describe("New text content"),
    },
    async ({ selector, text }) => {
      try {
        return toolResult(await htmlOps.updateText(state, resolveSelector(state, selector), text));
      } catch (e: any) {
        return toolError(e);
      }
    },
  );

  server.tool(
    "update_attribute",
    "Set or update an HTML attribute on an element (e.g. src, href, alt). If no selector is provided, uses the currently selected element.",
    {
      selector: z.string().optional().describe("CSS selector of the element. If omitted, uses the current browser selection."),
      attr: z.string().describe("Attribute name"),
      value: z.string().describe("Attribute value"),
    },
    async ({ selector, attr, value }) => {
      try {
        return toolResult(
          await htmlOps.updateAttribute(state, resolveSelector(state, selector), attr, value),
        );
      } catch (e: any) {
        return toolError(e);
      }
    },
  );

  // --- Undo / Redo ---

  server.tool(
    "undo",
    "Undo the last change to the current page.",
    {},
    async () => {
      try {
        return toolResult(await htmlOps.undo(state));
      } catch (e: any) {
        return toolError(e);
      }
    },
  );

  server.tool(
    "redo",
    "Redo a previously undone change to the current page.",
    {},
    async () => {
      try {
        return toolResult(await htmlOps.redo(state));
      } catch (e: any) {
        return toolError(e);
      }
    },
  );

  // --- Highlight / Navigation ---

  server.tool(
    "highlight_element",
    "Highlight an element in the browser with a cyan overlay. Use to show the user which element you mean.",
    {
      selector: z.string().describe("CSS selector of the element to highlight"),
      label: z.string().optional().describe("Label text shown above the highlight"),
      style: z
        .enum(["solid", "pulse", "flash"])
        .optional()
        .describe("Highlight style: solid (static), pulse (pulsing), flash (brief flash)"),
      duration: z
        .number()
        .nullable()
        .optional()
        .describe("Auto-remove after N seconds (null = stays until cleared)"),
    },
    async ({ selector, label, style, duration }) => {
      return toolResult(
        htmlOps.highlightElement(state, selector, { label, style, duration }),
      );
    },
  );

  server.tool(
    "highlight_elements",
    "Highlight multiple elements simultaneously with cyan overlays.",
    {
      items: z
        .array(
          z.object({
            selector: z.string().describe("CSS selector"),
            label: z.string().optional().describe("Label text"),
          }),
        )
        .describe("Elements to highlight"),
    },
    async ({ items }) => {
      return toolResult(htmlOps.highlightElements(state, items));
    },
  );

  server.tool(
    "clear_highlights",
    "Remove all agent highlights from the browser.",
    {},
    async () => {
      return toolResult(htmlOps.clearHighlights(state));
    },
  );

  server.tool(
    "navigate",
    "Navigate the browser to a different page.",
    {
      path: z.string().describe("URL path to navigate to (e.g. /about, /pricing)"),
    },
    async ({ path }) => {
      return toolResult(htmlOps.navigateTo(state, path));
    },
  );

  server.tool(
    "scroll_to",
    "Scroll the browser to bring an element into view.",
    {
      selector: z.string().describe("CSS selector of the element to scroll to"),
    },
    async ({ selector }) => {
      return toolResult(htmlOps.scrollTo(state, selector));
    },
  );

  server.tool(
    "get_screenshot",
    "Capture a screenshot of the current page or a specific element. Saves to .aceto/screenshots/ in the project directory. Returns the file path. Use the Read tool to view the image.",
    {
      selector: z.string().optional().describe("CSS selector to screenshot a specific element. If omitted, captures the full page."),
    },
    async ({ selector }) => {
      try {
        const result = await htmlOps.getScreenshot(state, selector);
        return toolResult(result);
      } catch (e: any) {
        return toolError(e);
      }
    },
  );
}
