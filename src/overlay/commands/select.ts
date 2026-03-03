import { registerCommand } from "../commands";
import { openCommandModal } from "../command-modal";

registerCommand({
  name: "select",
  editSelector: "select",

  extractData(el: Element) {
    const className = el.className || "";
    const name = el.getAttribute("name") || "";
    const id = el.id || "";
    const options: Array<{ value: string; label: string; selected: boolean }> = [];
    for (const opt of Array.from(el.querySelectorAll(":scope > option"))) {
      options.push({
        value: (opt as HTMLOptionElement).value,
        label: opt.textContent || "",
        selected: (opt as HTMLOptionElement).selected,
      });
    }
    return { className, name, id, options };
  },

  async handler(ctx) {
    const isEdit = ctx.mode === "edit" && ctx.existingData;
    let initialValue = "";
    let placeholder = "Option A\nOption B\nOption C\n\nUse value:label for custom values\nPrefix with * for selected";
    let existingClassName = "";
    let existingName = "";
    let existingId = "";

    if (isEdit) {
      const { className, name, id, options } = ctx.existingData;
      existingClassName = className || "";
      existingName = name || "";
      existingId = id || "";
      initialValue = options.map((opt: any) => {
        const prefix = opt.selected ? "* " : "";
        if (opt.value && opt.value !== opt.label) {
          return `${prefix}${opt.value}:${opt.label}`;
        }
        return `${prefix}${opt.label}`;
      }).join("\n");
    }

    const result = await openCommandModal({
      title: isEdit ? "Edit Select" : "Create Select",
      placeholder,
      initialValue,
      submitLabel: isEdit ? "Update" : "Insert",
    });

    if (result === null || result.trim() === "") return null;

    const lines = result.split("\n").filter((l) => l.trim() !== "");
    const options: Array<{ value: string; label: string; selected: boolean }> = [];

    for (const line of lines) {
      let trimmed = line.trim();
      const selected = trimmed.startsWith("* ");
      if (selected) trimmed = trimmed.slice(2);

      const colonIdx = trimmed.indexOf(":");
      let value: string;
      let label: string;
      if (colonIdx >= 0) {
        value = trimmed.slice(0, colonIdx);
        label = trimmed.slice(colonIdx + 1);
      } else {
        value = trimmed;
        label = trimmed;
      }
      options.push({ value, label, selected });
    }

    if (options.length === 0) return null;

    const attrs: string[] = [];
    if (existingClassName) attrs.push(`class="${existingClassName}"`);
    if (existingName) attrs.push(`name="${existingName}"`);
    if (existingId) attrs.push(`id="${existingId}"`);
    const attrStr = attrs.length > 0 ? " " + attrs.join(" ") : "";

    const optionsHtml = options.map((opt) => {
      const valAttr = opt.value !== opt.label ? ` value="${escapeHtml(opt.value)}"` : "";
      const selAttr = opt.selected ? " selected" : "";
      return `  <option${valAttr}${selAttr}>${escapeHtml(opt.label)}</option>`;
    }).join("\n");

    return `<select${attrStr}>\n${optionsHtml}\n</select>`;
  },
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
