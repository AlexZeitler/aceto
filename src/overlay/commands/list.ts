import { registerCommand } from "../commands";
import { openCommandModal } from "../command-modal";

registerCommand({
  name: "list",
  editSelector: "ul, ol",

  extractData(el: Element) {
    const type = el.tagName.toLowerCase() === "ol" ? "ol" : "ul";
    const className = el.className || "";
    const items: string[] = [];
    for (const li of Array.from(el.querySelectorAll(":scope > li"))) {
      items.push(li.textContent || "");
    }
    return { type, className, items };
  },

  async handler(ctx) {
    const isEdit = ctx.mode === "edit" && ctx.existingData;
    let initialValue = "";
    let placeholder = "* Item 1\n* Item 2\n* Item 3\n\nPrefix: * or - for <ul>, 1. 2. for <ol>";
    let listType: "ul" | "ol" = "ul";
    let existingClassName = "";

    if (isEdit) {
      const { type, className, items } = ctx.existingData;
      listType = type;
      existingClassName = className || "";
      const prefix = type === "ol" ? (i: number) => `${i + 1}. ` : () => "* ";
      initialValue = items.map((item: string, i: number) => prefix(i) + item).join("\n");
    }

    const result = await openCommandModal({
      title: isEdit ? "Edit List" : "Create List",
      placeholder,
      initialValue,
      submitLabel: isEdit ? "Update" : "Insert",
    });

    if (result === null || result.trim() === "") return null;

    const lines = result.split("\n").filter((l) => l.trim() !== "");
    const listItems: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      // Detect ordered list: starts with number + dot
      const olMatch = trimmed.match(/^\d+\.\s*(.*)/);
      if (olMatch) {
        listType = "ol";
        listItems.push(olMatch[1]);
        continue;
      }
      // Detect unordered list: starts with * or -
      const ulMatch = trimmed.match(/^[*\-]\s*(.*)/);
      if (ulMatch) {
        listItems.push(ulMatch[1]);
        continue;
      }
      // No prefix → treat as unordered
      listItems.push(trimmed);
    }

    if (listItems.length === 0) return null;

    const classAttr = existingClassName ? ` class="${existingClassName}"` : "";
    const itemsHtml = listItems.map((item) => `  <li>${escapeHtml(item)}</li>`).join("\n");
    return `<${listType}${classAttr}>\n${itemsHtml}\n</${listType}>`;
  },
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
