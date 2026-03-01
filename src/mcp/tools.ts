import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppState } from "../state";
import * as htmlOps from "./html-ops";

export function registerTools(server: McpServer, state: AppState) {
  server.tool(
    "get_current_page",
    "Returns the currently displayed page in the browser, including its full HTML content, path, and title.",
    {},
    async () => {
      try {
        const result = await htmlOps.getCurrentPage(state);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: e.message }) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "get_selected_element",
    "Returns the element the user has selected in the browser. Returns { selected: false } if nothing is selected.",
    {},
    async () => {
      const result = htmlOps.getSelectedElement(state);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    "get_pages",
    "Lists all HTML pages in the project with their URL paths.",
    {},
    async () => {
      const result = await htmlOps.getPages(state);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    "replace_page",
    "Replaces the entire body content of the current page. Use for initial page setup or major restructuring.",
    {
      html: z.string().describe("New HTML content for the <body> element"),
    },
    async ({ html }) => {
      try {
        const result = await htmlOps.replacePage(state, html);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: e.message }) }],
          isError: true,
        };
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
        const result = await htmlOps.replaceElement(state, selector, html);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: e.message }) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "update_classes",
    "Add or remove Tailwind/CSS classes on an element without replacing its HTML.",
    {
      selector: z.string().describe("CSS selector of the element"),
      add: z
        .array(z.string())
        .optional()
        .describe("Classes to add"),
      remove: z
        .array(z.string())
        .optional()
        .describe("Classes to remove"),
    },
    async ({ selector, add, remove }) => {
      try {
        const result = await htmlOps.updateClasses(
          state,
          selector,
          add ?? [],
          remove ?? [],
        );
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: e.message }) }],
          isError: true,
        };
      }
    },
  );
}
