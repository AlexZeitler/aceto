import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppState } from "../state";
import * as htmlOps from "./html-ops";

function toolResult(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}

function toolError(e: any) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: e.message }) }],
    isError: true,
  };
}

export function registerTools(server: McpServer, state: AppState) {
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
    "Replaces a specific element identified by CSS selector with new HTML.",
    {
      selector: z.string().describe("CSS selector of the element to replace"),
      html: z.string().describe("New HTML to replace the element with"),
    },
    async ({ selector, html }) => {
      try {
        return toolResult(await htmlOps.replaceElement(state, selector, html));
      } catch (e: any) {
        return toolError(e);
      }
    },
  );

  server.tool(
    "update_classes",
    "Add or remove Tailwind/CSS classes on an element without replacing its HTML.",
    {
      selector: z.string().describe("CSS selector of the element"),
      add: z.array(z.string()).optional().describe("Classes to add"),
      remove: z.array(z.string()).optional().describe("Classes to remove"),
    },
    async ({ selector, add, remove }) => {
      try {
        return toolResult(
          await htmlOps.updateClasses(state, selector, add ?? [], remove ?? []),
        );
      } catch (e: any) {
        return toolError(e);
      }
    },
  );

  server.tool(
    "insert_element",
    "Insert a new HTML element relative to an existing element identified by CSS selector.",
    {
      selector: z.string().describe("CSS selector of the reference element"),
      position: z
        .enum(["before", "after", "prepend", "append"])
        .describe("Where to insert: before/after the element, or prepend/append inside it"),
      html: z.string().describe("HTML to insert"),
    },
    async ({ selector, position, html }) => {
      try {
        return toolResult(
          await htmlOps.insertElement(state, selector, position, html),
        );
      } catch (e: any) {
        return toolError(e);
      }
    },
  );

  server.tool(
    "delete_element",
    "Remove an element identified by CSS selector from the page.",
    {
      selector: z.string().describe("CSS selector of the element to delete"),
    },
    async ({ selector }) => {
      try {
        return toolResult(await htmlOps.deleteElement(state, selector));
      } catch (e: any) {
        return toolError(e);
      }
    },
  );

  server.tool(
    "update_text",
    "Update the text content of an element without changing its structure or attributes.",
    {
      selector: z.string().describe("CSS selector of the element"),
      text: z.string().describe("New text content"),
    },
    async ({ selector, text }) => {
      try {
        return toolResult(await htmlOps.updateText(state, selector, text));
      } catch (e: any) {
        return toolError(e);
      }
    },
  );

  server.tool(
    "update_attribute",
    "Set or update an HTML attribute on an element (e.g. src, href, alt).",
    {
      selector: z.string().describe("CSS selector of the element"),
      attr: z.string().describe("Attribute name"),
      value: z.string().describe("Attribute value"),
    },
    async ({ selector, attr, value }) => {
      try {
        return toolResult(
          await htmlOps.updateAttribute(state, selector, attr, value),
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
}
