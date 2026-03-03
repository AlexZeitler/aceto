import { send, on, getNextMid, getDefaults } from "./ws-client";
import {
  initHighlightHost,
  showHover,
  hideHover,
  showSelection,
  hideSelection,
  showMultiSelection,
  repositionMultiSelection,
  setUserSelector,
  getModeToggleButton,
  getUndoButton,
  getRedoButton,
  updateModeIndicator,
  showClassEditor,
  hideClassEditor,
  getClassEditorInput,
  flashElement,
} from "./highlight";
import { initDepthNavigation, clearDepthNavigation } from "./depth";
import { updateTableControls, hideTableControls } from "./table-controls";
import { open as openAssetPicker, close as closeAssetPicker, isAssetPickerOpen } from "./asset-picker";
import { getCommand } from "./commands";
import { isCommandModalOpen, closeCommandModal } from "./command-modal";
import { refreshEditBadges, hideEditBadges, showEditBadges, repositionEditBadges } from "./edit-badge";

let selectedElements: Element[] = [];
let selectMode = true;
let editingElement: HTMLElement | null = null;
let editOriginalText: string = "";
let classEditingElement: Element | null = null;
let classEditOriginal: string = "";
let yankedHtml: string | null = null;

function getSelectedElement(): Element | null {
  return selectedElements[selectedElements.length - 1] ?? null;
}

export function toggleSelectMode() {
  selectMode = !selectMode;
  updateModeIndicator(selectMode);
  document.documentElement.toggleAttribute("data-aceto-select-mode", selectMode);
  if (!selectMode) {
    hideHover();
    hideEditBadges();
    if (selectedElements.length > 0) {
      selectedElements = [];
      hideSelection();
      hideTableControls();
      setUserSelector("");
      clearDepthNavigation();
      send({ type: "deselect" });
    }
  } else {
    showEditBadges();
  }
}

export function isSelectMode(): boolean {
  return selectMode;
}

function isOverlayElement(el: Element): boolean {
  let current: Element | null = el;
  while (current) {
    if (current.id === "__aceto_host__") return true;
    current = current.parentElement;
  }
  return false;
}

interface SelectorResult {
  selector: string;
  dataMid?: string;
  fallbackSelector?: string;
}

export function generateFallbackSelector(el: Element): string {
  if (el.id) return `#${CSS.escape(el.id)}`;

  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current !== document.documentElement && current !== document.body) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      parts.unshift(`#${CSS.escape(current.id)}`);
      break;
    }

    const parent = current.parentElement;
    if (parent) {
      const sameTag = Array.from(parent.children).filter(
        (c) => c.tagName === current!.tagName,
      );
      if (sameTag.length > 1) {
        const index = sameTag.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }

    parts.unshift(selector);
    current = current.parentElement;
  }

  return parts.join(" > ");
}

export function generateSelector(el: Element): SelectorResult {
  // Prefer existing data-mid
  const existingMid = el.getAttribute("data-mid");
  if (existingMid) {
    return { selector: `[data-mid="${existingMid}"]` };
  }

  // Prefer existing ID
  if (el.id) {
    return { selector: `#${CSS.escape(el.id)}` };
  }

  // Assign new data-mid
  const mid = getNextMid();
  el.setAttribute("data-mid", mid);
  const fallbackSelector = generateFallbackSelector(el);

  return {
    selector: `[data-mid="${mid}"]`,
    dataMid: mid,
    fallbackSelector,
  };
}

function getElementMeta(el: Element) {
  const rect = el.getBoundingClientRect();
  const parent = el.parentElement;

  let siblingsBefore = 0;
  let siblingsAfter = 0;
  if (parent) {
    const children = Array.from(parent.children);
    const idx = children.indexOf(el);
    siblingsBefore = idx;
    siblingsAfter = children.length - idx - 1;
  }

  return {
    tag: el.tagName.toLowerCase(),
    classes: Array.from(el.classList),
    text: (el.textContent || "").trim().slice(0, 200),
    parentSelector: parent ? generateFallbackSelector(parent) : "",
    siblings: { before: siblingsBefore, after: siblingsAfter },
    dimensions: {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
  };
}

function getCleanOuterHTML(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  // Remove injected overlay elements from the clone
  for (const s of Array.from(clone.querySelectorAll("script[data-aceto-overlay]"))) {
    s.remove();
  }
  const host = clone.querySelector("#__aceto_host__");
  if (host) host.remove();
  return clone.outerHTML;
}

function buildSelectPayload(el: Element) {
  const result = generateSelector(el);
  const meta = getElementMeta(el);
  return {
    selector: result.selector,
    html: getCleanOuterHTML(el),
    meta,
    ...(result.dataMid ? { dataMid: result.dataMid, fallbackSelector: result.fallbackSelector } : {}),
  };
}

function sendSelection() {
  if (selectedElements.length === 0) {
    hideSelection();
    hideTableControls();
    setUserSelector("");
    send({ type: "deselect" });
    return;
  }

  if (selectedElements.length === 1) {
    const el = selectedElements[0];
    showSelection(el);
    const payload = buildSelectPayload(el);
    setUserSelector(payload.selector);
    updateTableControls(el);
    send({ type: "select", ...payload });
  } else {
    showMultiSelection(selectedElements);
    hideTableControls();
    const elements = selectedElements.map((el) => buildSelectPayload(el));
    setUserSelector(`${elements.length} elements`);
    send({ type: "multi_select", elements });
  }
}

function selectElement(el: Element) {
  selectedElements = [el];
  hideHover();
  sendSelection();
}

function toggleMultiSelect(el: Element) {
  const idx = selectedElements.indexOf(el);
  if (idx >= 0) {
    selectedElements.splice(idx, 1);
  } else {
    selectedElements.push(el);
  }
  hideHover();
  sendSelection();
}

export { getSelectedElement };

export function setSelectedElement(el: Element | null) {
  if (el) {
    selectedElements = [el];
    sendSelection();
  } else {
    selectedElements = [];
    hideSelection();
    hideTableControls();
  }
}

// --- Inline Text Editing ---

const EDITABLE_TAGS = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6",
  "span", "a", "li", "td", "th", "label", "button",
  "dt", "dd", "figcaption", "blockquote", "cite", "em", "strong", "b", "i", "u", "small",
]);

function findAdjacentCell(
  cell: Element,
  direction: 1 | -1,
): HTMLElement | null {
  const row = cell.parentElement;
  if (!row || row.tagName.toLowerCase() !== "tr") return null;
  const table = row.closest("table");
  if (!table) return null;

  const allRows = Array.from(table.querySelectorAll("tr"));
  const rowIndex = allRows.indexOf(row as HTMLTableRowElement);
  const cells = Array.from(row.querySelectorAll("td, th"));
  const cellIndex = cells.indexOf(cell as HTMLTableCellElement);

  let nextRowIndex = rowIndex;
  let nextCellIndex = cellIndex + direction;

  if (nextCellIndex >= cells.length) {
    // Move to first cell of next row
    nextRowIndex++;
    nextCellIndex = 0;
  } else if (nextCellIndex < 0) {
    // Move to last cell of previous row
    nextRowIndex--;
    if (nextRowIndex < 0) return null;
    const prevCells = allRows[nextRowIndex].querySelectorAll("td, th");
    nextCellIndex = prevCells.length - 1;
  }

  if (nextRowIndex < 0 || nextRowIndex >= allRows.length) return null;

  const targetRow = allRows[nextRowIndex];
  const targetCells = targetRow.querySelectorAll("td, th");
  if (nextCellIndex < 0 || nextCellIndex >= targetCells.length) return null;

  return targetCells[nextCellIndex] as HTMLElement;
}

function expandSingleShortcut(token: string): string | null {
  const defaults = getDefaults();
  const cls = defaults.checkbox ? ` class="${defaults.checkbox}"` : "";
  if (token === "[]") return `<input type="checkbox"${cls}>`;
  if (token === "[x]") return `<input type="checkbox" checked${cls}>`;
  const radioMatch = token.match(/^\(([^)]*)\)$/);
  if (radioMatch) {
    const inner = radioMatch[1];
    if (inner === "" || inner === "o") {
      const checked = inner === "o" ? " checked" : "";
      return `<input type="radio"${checked}${cls}>`;
    }
    // Parse: (o|name:label) or (name:label) or (o|name) or (name)
    const isChecked = inner.startsWith("o|");
    const rest = isChecked ? inner.slice(2) : inner;
    const colonIdx = rest.indexOf(":");
    const name = colonIdx >= 0 ? rest.slice(0, colonIdx) : rest;
    const label = colonIdx >= 0 ? rest.slice(colonIdx + 1) : "";
    const checked = isChecked ? " checked" : "";
    const nameAttr = name ? ` name="${name}"` : "";
    const input = `<input type="radio"${nameAttr}${checked}${cls}>`;
    if (label) {
      return `<label>${input} ${label}</label>`;
    }
    return input;
  }
  if (token === "---") return `<hr>`;
  return null;
}

function expandShortcuts(text: string): string | null {
  const trimmed = text.trim();
  // Try single shortcut first
  const single = expandSingleShortcut(trimmed);
  if (single) return single;
  // Try multiple space-separated shortcuts
  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 2) return null;
  const expanded = tokens.map(expandSingleShortcut);
  if (expanded.every((e) => e !== null)) {
    return expanded.join("\n");
  }
  return null;
}

const VALUE_EDITABLE_TAGS = new Set(["input", "textarea"]);

function isValueElement(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === "input") {
    const type = (el as HTMLInputElement).type.toLowerCase();
    return ["text", "email", "url", "tel", "search", "password", "number"].includes(type);
  }
  return tag === "textarea";
}

function isCheckable(el: Element): boolean {
  if (el.tagName.toLowerCase() !== "input") return false;
  const type = (el as HTMLInputElement).type.toLowerCase();
  return type === "checkbox" || type === "radio";
}

function isEditableElement(el: Element): boolean {
  if (isValueElement(el)) return true;
  if (isCheckable(el)) return true;
  const tag = el.tagName.toLowerCase();
  if (EDITABLE_TAGS.has(tag)) return true;

  // Also allow elements whose children are only text or inline elements
  const children = el.childNodes;
  if (children.length === 0) return true;
  for (const child of Array.from(children)) {
    if (child.nodeType === Node.TEXT_NODE) continue;
    if (child.nodeType === Node.ELEMENT_NODE) {
      const childTag = (child as Element).tagName.toLowerCase();
      const inlineTags = new Set(["span", "a", "em", "strong", "b", "i", "u", "small", "br", "code", "mark", "sub", "sup"]);
      if (!inlineTags.has(childTag)) return false;
    } else {
      return false;
    }
  }
  return children.length > 0;
}

function startEditing(el: HTMLElement) {
  if (editingElement) return;
  editingElement = el;

  if (isCheckable(el)) {
    const input = el as HTMLInputElement;
    editOriginalText = input.checked ? "checked" : "";
  } else if (isValueElement(el)) {
    const input = el as HTMLInputElement | HTMLTextAreaElement;
    editOriginalText = input.value;
    input.focus();
    input.select();
  } else {
    editOriginalText = el.textContent || "";
    el.contentEditable = "true";
    el.focus();

    // Select all text
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  // Visual feedback: dashed outline
  el.style.outline = "2px dashed #f43f5e";
  el.style.outlineOffset = "-1px";

  hideHover();
}

function commitEdit() {
  if (!editingElement) return;
  const el = editingElement;

  if (isCheckable(el)) {
    const input = el as HTMLInputElement;
    const wasChecked = editOriginalText === "checked";
    el.style.outline = "";
    el.style.outlineOffset = "";

    if (input.checked !== wasChecked) {
      const result = generateSelector(el);
      const fallback = generateFallbackSelector(el);
      send({
        type: "checked_edit",
        selector: result.selector,
        fallbackSelector: fallback,
        checked: input.checked,
        inputType: input.type.toLowerCase(),
        name: input.name || undefined,
      });
    }
  } else if (isValueElement(el)) {
    const input = el as HTMLInputElement | HTMLTextAreaElement;
    const newValue = input.value;
    el.style.outline = "";
    el.style.outlineOffset = "";

    if (newValue !== editOriginalText) {
      const result = generateSelector(el);
      const fallback = generateFallbackSelector(el);
      send({
        type: "value_edit",
        selector: result.selector,
        fallbackSelector: fallback,
        value: newValue,
      });
    }
  } else {
    const newText = el.textContent || "";
    el.contentEditable = "false";
    el.style.outline = "";
    el.style.outlineOffset = "";

    // contentEditable leaves <br> or empty text nodes — clear for :empty CSS
    if (!newText) {
      el.innerHTML = "";
    }

    if (newText !== editOriginalText) {
      const result = generateSelector(el);
      const fallback = generateFallbackSelector(el);

      // Check for slash commands (e.g. /list, /table)
      const trimmedText = newText.trim();
      if (trimmedText.startsWith("/") && !trimmedText.includes(" ")) {
        const cmdName = trimmedText.slice(1);
        const cmd = getCommand(cmdName);
        if (cmd) {
          // Reset text and end editing
          el.textContent = editOriginalText;
          editingElement = null;
          editOriginalText = "";
          // Launch command handler — replace whole element (not inner content)
          // so that e.g. <p> gets replaced by <ul> instead of nesting.
          // Always send fallbackSelector so server can find the element
          // even if data-mid wasn't persisted to the file.
          cmd.handler({
            mode: "create",
            element: el,
            selector: result.selector,
            fallbackSelector: fallback,
          }).then((html) => {
            if (html !== null) {
              send({
                type: "command_replace" as any,
                selector: result.selector,
                fallbackSelector: fallback,
                html,
              });
            }
          });
          return;
        }
      }

      // Check for content shortcuts
      const expanded = expandShortcuts(newText);
      if (expanded) {
        send({
          type: "shortcut_expand",
          selector: result.selector,
          fallbackSelector: fallback,
          html: expanded,
        });
      } else {
        send({
          type: "text_edit",
          selector: result.selector,
          fallbackSelector: fallback,
          text: newText,
        });
      }
    }
  }

  if (isValueElement(el)) (el as HTMLElement).blur();
  editingElement = null;
  editOriginalText = "";
}

function cancelEdit() {
  if (!editingElement) return;
  if (isCheckable(editingElement)) {
    (editingElement as HTMLInputElement).checked = editOriginalText === "checked";
  } else if (isValueElement(editingElement)) {
    (editingElement as HTMLInputElement | HTMLTextAreaElement).value = editOriginalText;
    (editingElement as HTMLElement).blur();
  } else {
    editingElement.textContent = editOriginalText;
    editingElement.contentEditable = "false";
  }
  editingElement.style.outline = "";
  editingElement.style.outlineOffset = "";
  editingElement = null;
  editOriginalText = "";
}

function isEditing(): boolean {
  return editingElement !== null;
}

function isClassEditing(): boolean {
  return classEditingElement !== null;
}

function commitClassEdit() {
  if (!classEditingElement) return;
  const input = getClassEditorInput();
  if (!input) return;
  const newClasses = input.value.trim();
  hideClassEditor();
  if (newClasses !== classEditOriginal) {
    const oldSet = new Set(classEditOriginal.split(/\s+/).filter(Boolean));
    const newSet = new Set(newClasses.split(/\s+/).filter(Boolean));
    const add = [...newSet].filter(c => !oldSet.has(c));
    const remove = [...oldSet].filter(c => !newSet.has(c));
    if (add.length > 0 || remove.length > 0) {
      const result = generateSelector(classEditingElement);
      const fallback = generateFallbackSelector(classEditingElement);
      send({ type: "class_edit", selector: result.selector, fallbackSelector: fallback, add, remove });
    }
  }
  classEditingElement = null;
  classEditOriginal = "";
}

function cancelClassEdit() {
  hideClassEditor();
  classEditingElement = null;
  classEditOriginal = "";
}

function handleClipboardPaste() {
  // Create a hidden editable element so the browser fires a paste event
  const receiver = document.createElement("textarea");
  receiver.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0;width:1px;height:1px;";
  document.body.appendChild(receiver);
  receiver.focus();

  const cleanup = () => receiver.remove();

  receiver.addEventListener("paste", (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) { cleanup(); return; }

    let imageItem: DataTransferItem | null = null;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        imageItem = item;
        break;
      }
    }
    if (!imageItem) { cleanup(); return; }

    e.preventDefault();
    e.stopPropagation();

    const blob = imageItem.getAsFile();
    if (!blob) { cleanup(); return; }

    const port = (window as any).__ACETO_WS_PORT__ || 3000;
    const sel = getSelectedElement();
    const selector = sel ? generateSelector(sel).selector : "";

    const formData = new FormData();
    formData.append("image", blob);
    formData.append("selector", selector);

    fetch(`http://localhost:${port}/api/paste-image`, {
      method: "POST",
      body: formData,
    }).catch(() => {});

    cleanup();
  });

  // Fallback cleanup
  setTimeout(cleanup, 1000);
}

function init() {
  initHighlightHost();

  // Mark select mode on <html> for CSS-driven empty-element visibility
  document.documentElement.toggleAttribute("data-aceto-select-mode", selectMode);

  // Inject styles to make empty elements visible in select mode
  const emptyStyle = document.createElement("style");
  emptyStyle.setAttribute("data-aceto-overlay", "");
  emptyStyle.textContent = `html[data-aceto-select-mode] :is(div, p, span, section, article, aside, main, nav, header, footer, li, td, th, blockquote, figcaption, figure, h1, h2, h3, h4, h5, h6, a, label, button, dl, dt, dd, ul, ol, pre, code):empty { min-height: 1.5em; background: repeating-linear-gradient(45deg, transparent, transparent 4px, #e5e7eb 4px, #e5e7eb 5px); border-radius: 4px; }`;
  document.head.appendChild(emptyStyle);

  // Set up mode toggle button
  const toggleBtn = getModeToggleButton();
  if (toggleBtn) {
    toggleBtn.addEventListener("mousedown", (e) => {
      e.preventDefault(); // Prevent button from receiving focus
    });
    toggleBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleSelectMode();
    });
  }

  // Set up undo/redo buttons
  const undoBtn = getUndoButton();
  if (undoBtn) {
    undoBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
    });
    undoBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      send({ type: "undo" });
    });
  }

  const redoBtn = getRedoButton();
  if (redoBtn) {
    redoBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
    });
    redoBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      send({ type: "redo" });
    });
  }

  // Prevent all default interactions in select mode
  const blockEvents = ["click", "mousedown", "mouseup", "submit", "keydown", "keypress", "keyup", "contextmenu"];

  for (const eventName of blockEvents) {
    document.addEventListener(
      eventName,
      (e) => {
        if (!selectMode) return;
        if (isCommandModalOpen()) return;
        if (isOverlayElement(e.target as Element)) return;

        // While editing, allow normal keyboard/mouse interaction in the edited element
        if (isEditing()) {
          const target = e.target as Element;
          const isEditTarget = editingElement && (editingElement === target || editingElement.contains(target));
          // Checkboxes don't receive focus, so handle keys regardless of target
          const isCheckableEdit = editingElement && isCheckable(editingElement);
          if (isEditTarget || isCheckableEdit) {
            // Handle Enter, Escape, Tab during editing
            if (eventName === "keydown") {
              const ke = e as KeyboardEvent;
              const key = ke.key;
              if (key === "Enter") {
                if (editingElement?.tagName.toLowerCase() === "textarea") {
                  // Ctrl+Enter commits textarea, plain Enter is a newline
                  if (ke.ctrlKey || ke.metaKey) {
                    e.preventDefault();
                    commitEdit();
                  }
                  return;
                }
                if (!ke.shiftKey) {
                  e.preventDefault();
                  commitEdit();
                }
                return;
              }
              if (key === " " && editingElement && isCheckable(editingElement)) {
                e.preventDefault();
                const input = editingElement as HTMLInputElement;
                if (input.type.toLowerCase() === "radio") {
                  // Radio: can only check, not uncheck
                  if (!input.checked) {
                    // Uncheck siblings in the same group
                    if (input.name) {
                      document.querySelectorAll(`input[type="radio"][name="${CSS.escape(input.name)}"]`).forEach((r) => {
                        (r as HTMLInputElement).checked = false;
                      });
                    }
                    input.checked = true;
                  }
                } else {
                  input.checked = !input.checked;
                }
                return;
              }
              if (key === "Escape") {
                e.preventDefault();
                cancelEdit();
                return;
              }
              if (key === "Tab") {
                e.preventDefault();
                const currentCell = editingElement;
                commitEdit();
                if (currentCell) {
                  const nextCell = findAdjacentCell(
                    currentCell,
                    ke.shiftKey ? -1 : 1,
                  );
                  if (nextCell) {
                    selectElement(nextCell);
                    startEditing(nextCell);
                  }
                }
                return;
              }
            }
            // Let other events through to the editing element
            return;
          }
          // Click outside the editing element → commit
          if (eventName === "click" || eventName === "mousedown") {
            commitEdit();
          }
        }

        // While class-editing, click outside → commit and consume event
        if (isClassEditing()) {
          if (eventName === "click" || eventName === "mousedown") {
            commitClassEdit();
          }
          return;
        }

        // Ctrl+V / Cmd+V → set up paste receiver (don't preventDefault — paste needs it)
        if (eventName === "keydown") {
          const ke = e as KeyboardEvent;
          if ((ke.ctrlKey || ke.metaKey) && ke.key === "v") {
            handleClipboardPaste();
            return;
          }
        }

        // ESC — close command modal first, then asset picker, then deselect
        if (eventName === "keydown" && (e as KeyboardEvent).key === "Escape") {
          if (closeCommandModal()) return;
          if (isAssetPickerOpen()) {
            closeAssetPicker();
            return;
          }
          if (selectedElements.length > 0) {
            selectedElements = [];
            hideSelection();
            hideTableControls();
            setUserSelector("");
            clearDepthNavigation();
            send({ type: "deselect" });
          }
          return;
        }

        // Single-key shortcuts: ignore when any modifier is held (Ctrl+C, Ctrl+R, etc.)
        // Also ignore when a form element has focus (e.g. editing an input value)
        const hasModifier = eventName === "keydown" && ((e as KeyboardEvent).ctrlKey || (e as KeyboardEvent).metaKey || (e as KeyboardEvent).altKey);
        const activeTag = document.activeElement?.tagName.toLowerCase();
        const isTypingInFormElement = activeTag === "input" || activeTag === "textarea" || activeTag === "select";

        // "a" to open asset picker (not during editing)
        if (eventName === "keydown" && !hasModifier && (e as KeyboardEvent).key === "a" && !isEditing() && !isClassEditing() && !isTypingInFormElement) {
          openAssetPicker();
          return;
        }

        // "e" to toggle select/preview mode (not during editing)
        if (eventName === "keydown" && !hasModifier && (e as KeyboardEvent).key === "e" && !isEditing() && !isClassEditing() && !isTypingInFormElement) {
          e.stopPropagation();
          toggleSelectMode();
          return;
        }

        // "u" for undo, "r" for redo
        if (eventName === "keydown" && !hasModifier && (e as KeyboardEvent).key === "u" && !isEditing() && !isClassEditing() && !isTypingInFormElement) {
          send({ type: "undo" });
          return;
        }
        if (eventName === "keydown" && !hasModifier && (e as KeyboardEvent).key === "r" && !isEditing() && !isClassEditing() && !isTypingInFormElement) {
          send({ type: "redo" });
          return;
        }

        // "c" to open class editor on selected element
        if (eventName === "keydown" && !hasModifier && (e as KeyboardEvent).key === "c" && !isEditing() && !isClassEditing() && !isTypingInFormElement) {
          e.preventDefault();
          e.stopPropagation();
          const sel = getSelectedElement();
          if (sel) {
            classEditingElement = sel;
            classEditOriginal = Array.from(sel.classList).join(" ");
            const input = showClassEditor(sel);
            input.addEventListener("keydown", (ke) => {
              if (ke.key === "Enter") { ke.preventDefault(); commitClassEdit(); }
              if (ke.key === "Escape") { ke.preventDefault(); cancelClassEdit(); }
            });
            input.addEventListener("focusout", () => {
              setTimeout(() => { if (classEditingElement) commitClassEdit(); }, 100);
            });
            input.focus();
            input.select();
          }
          return;
        }

        // "y" to yank (copy) selected element
        if (eventName === "keydown" && !hasModifier && (e as KeyboardEvent).key === "y" && !isEditing() && !isClassEditing() && !isTypingInFormElement) {
          const sel = getSelectedElement();
          if (sel) {
            yankedHtml = sel.outerHTML;
            flashElement(generateSelector(sel).selector);
          }
          return;
        }

        // "p" to paste yanked element after selection
        if (eventName === "keydown" && !hasModifier && (e as KeyboardEvent).key === "p" && !isEditing() && !isClassEditing() && !isTypingInFormElement) {
          const sel = getSelectedElement();
          if (sel && yankedHtml) {
            const result = generateSelector(sel);
            const fallback = generateFallbackSelector(sel);
            send({
              type: "paste_element",
              selector: result.selector,
              fallbackSelector: fallback,
              html: yankedHtml,
            });
          }
          return;
        }

        // "d" to insert a div after selection and start editing
        if (eventName === "keydown" && !hasModifier && (e as KeyboardEvent).key === "d" && !isEditing() && !isClassEditing() && !isTypingInFormElement) {
          const sel = getSelectedElement();
          if (sel) {
            const result = generateSelector(sel);
            const fallback = generateFallbackSelector(sel);
            send({
              type: "insert_div",
              selector: result.selector,
              fallbackSelector: fallback,
            });
          }
          return;
        }

        // DEL to delete selected element(s)
        if (eventName === "keydown" && (e as KeyboardEvent).key === "Delete") {
          if (selectedElements.length > 0) {
            // Send selectors in reverse order for stable offsets
            const selectors = selectedElements.map((el) => generateSelector(el).selector).reverse();
            for (const sel of selectors) {
              send({ type: "delete_element", selector: sel });
            }
            selectedElements = [];
            hideSelection();
            setUserSelector("");
            clearDepthNavigation();
          }
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        if (eventName === "click" && e.target instanceof Element) {
          const me = e as MouseEvent;
          // Find deepest element at click point
          const target = document.elementFromPoint(me.clientX, me.clientY);
          if (target && !isOverlayElement(target)) {
            if (me.ctrlKey || me.metaKey) {
              toggleMultiSelect(target);
            } else {
              selectElement(target);
            }
            initDepthNavigation(target);
          }
        }
      },
      true,
    );
  }

  // Double-click handler for inline text editing
  document.addEventListener(
    "dblclick",
    (e) => {
      if (!selectMode) return;
      if (isOverlayElement(e.target as Element)) return;
      if (isEditing()) return;

      e.preventDefault();
      e.stopPropagation();

      const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      if (!target || isOverlayElement(target)) return;

      if (isEditableElement(target)) {
        startEditing(target);
      }
    },
    true,
  );

  // Blur handler for editing — commit on focus loss
  document.addEventListener(
    "focusout",
    (e) => {
      if (!isEditing()) return;
      if (editingElement && e.target === editingElement) {
        // Capture the element that lost focus — if Tab already started
        // editing a new cell, editingElement will have changed by the
        // time the timeout fires, so we must only commit if the blurred
        // element is still the one being edited.
        const blurredEl = editingElement;
        setTimeout(() => {
          if (editingElement === blurredEl) commitEdit();
        }, 100);
      }
    },
    true,
  );

  // Hover highlighting
  document.addEventListener(
    "mousemove",
    (e) => {
      if (!selectMode || isEditing() || isClassEditing()) {
        hideHover();
        return;
      }

      const target = document.elementFromPoint(e.clientX, e.clientY);
      if (!target || isOverlayElement(target)) {
        hideHover();
        return;
      }

      showHover(target);
    },
    true,
  );

  // Re-position selection overlay on scroll, hide hover
  document.addEventListener("scroll", () => {
    hideHover();
    repositionEditBadges();
    const valid = selectedElements.filter((el) => document.contains(el));
    if (valid.length === 1) {
      showSelection(valid[0]);
    } else if (valid.length > 1) {
      repositionMultiSelection(valid);
    }
  }, { capture: true, passive: true });

  // Toggle select mode with Alt key (works in both modes)
  // "e" is handled in blockEvents (select mode) and here (preview mode)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Alt") {
      toggleSelectMode();
    }
    if (e.key === "e" && !selectMode && !isEditing()) {
      toggleSelectMode();
    }
  });

  // Refresh edit badges after DOM morph
  on("update", () => {
    if (selectMode) {
      setTimeout(() => refreshEditBadges(), 50);
    }
  });

  // Initial badge scan — defer so command modules are registered first
  setTimeout(() => refreshEditBadges(), 0);

  // Auto-edit: server tells us to select and edit a newly inserted element
  on("auto_edit", (data) => {
    // Wait for morph to settle, then select and edit
    setTimeout(() => {
      const el = document.querySelector(data.selector) as HTMLElement | null;
      if (el) {
        selectElement(el);
        startEditing(el);
      }
    }, 50);
  });
}

init();
