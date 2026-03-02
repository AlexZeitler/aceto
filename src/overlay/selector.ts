import { send, getNextMid } from "./ws-client";
import {
  initHighlightHost,
  showHover,
  hideHover,
  showSelection,
  hideSelection,
  setUserSelector,
  getModeToggleButton,
  getUndoButton,
  getRedoButton,
  updateModeIndicator,
} from "./highlight";
import { initDepthNavigation, clearDepthNavigation } from "./depth";
import { updateTableControls, hideTableControls } from "./table-controls";

let selectedElement: Element | null = null;
let selectMode = true;
let editingElement: HTMLElement | null = null;
let editOriginalText: string = "";

export function toggleSelectMode() {
  selectMode = !selectMode;
  updateModeIndicator(selectMode);
  if (!selectMode) {
    hideHover();
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

function generateFallbackSelector(el: Element): string {
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

function generateSelector(el: Element): SelectorResult {
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

function selectElement(el: Element) {
  selectedElement = el;
  showSelection(el);
  hideHover();

  const result = generateSelector(el);
  const meta = getElementMeta(el);

  setUserSelector(result.selector);
  updateTableControls(el);

  send({
    type: "select",
    selector: result.selector,
    html: el.outerHTML,
    meta,
    ...(result.dataMid ? { dataMid: result.dataMid, fallbackSelector: result.fallbackSelector } : {}),
  });
}

export function getSelectedElement(): Element | null {
  return selectedElement;
}

export function setSelectedElement(el: Element | null) {
  selectedElement = el;
  if (el) {
    showSelection(el);
    updateTableControls(el);
    const result = generateSelector(el);
    const meta = getElementMeta(el);
    send({
      type: "select",
      selector: result.selector,
      html: el.outerHTML,
      meta,
      ...(result.dataMid ? { dataMid: result.dataMid, fallbackSelector: result.fallbackSelector } : {}),
    });
  } else {
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

function expandShortcuts(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === "[]") return '<input type="checkbox">';
  if (trimmed === "[x]") return '<input type="checkbox" checked>';
  return null;
}

function isEditableElement(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (EDITABLE_TAGS.has(tag)) return true;

  // Also allow elements whose children are only text or inline elements
  const children = el.childNodes;
  if (children.length === 0) return false;
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
  editOriginalText = el.textContent || "";

  el.contentEditable = "true";
  el.focus();

  // Select all text
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);

  // Visual feedback: dashed outline
  el.style.outline = "2px dashed #f43f5e";
  el.style.outlineOffset = "-1px";

  hideHover();
}

function commitEdit() {
  if (!editingElement) return;
  const el = editingElement;
  const newText = el.textContent || "";
  el.contentEditable = "false";
  el.style.outline = "";
  el.style.outlineOffset = "";

  if (newText !== editOriginalText) {
    const result = generateSelector(el);
    const fallback = generateFallbackSelector(el);

    // Check for content shortcuts
    const expanded = expandShortcuts(newText);
    if (expanded) {
      // Replace the element's innerHTML with the expanded HTML
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

  editingElement = null;
  editOriginalText = "";
}

function cancelEdit() {
  if (!editingElement) return;
  editingElement.textContent = editOriginalText;
  editingElement.contentEditable = "false";
  editingElement.style.outline = "";
  editingElement.style.outlineOffset = "";
  editingElement = null;
  editOriginalText = "";
}

function isEditing(): boolean {
  return editingElement !== null;
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
    const selector = selectedElement ? generateSelector(selectedElement).selector : "";

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
        if (isOverlayElement(e.target as Element)) return;

        // While editing, allow normal keyboard/mouse interaction in the edited element
        if (isEditing()) {
          const target = e.target as Element;
          if (editingElement && (editingElement === target || editingElement.contains(target))) {
            // Handle Enter, Escape, Tab during editing
            if (eventName === "keydown") {
              const ke = e as KeyboardEvent;
              const key = ke.key;
              if (key === "Enter" && !ke.shiftKey) {
                e.preventDefault();
                commitEdit();
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

        // Ctrl+V / Cmd+V → set up paste receiver (don't preventDefault — paste needs it)
        if (eventName === "keydown") {
          const ke = e as KeyboardEvent;
          if ((ke.ctrlKey || ke.metaKey) && ke.key === "v") {
            handleClipboardPaste();
            return;
          }
        }

        // ESC to deselect
        if (eventName === "keydown" && (e as KeyboardEvent).key === "Escape") {
          if (selectedElement) {
            selectedElement = null;
            hideSelection();
            hideTableControls();
            setUserSelector("");
            clearDepthNavigation();
            send({ type: "deselect" });
          }
          return;
        }

        // DEL to delete selected element
        if (eventName === "keydown" && (e as KeyboardEvent).key === "Delete") {
          if (selectedElement) {
            const result = generateSelector(selectedElement);
            send({ type: "delete_element", selector: result.selector });
            selectedElement = null;
            hideSelection();
            setUserSelector("");
            clearDepthNavigation();
          }
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        if (eventName === "click" && e.target instanceof Element) {
          // Find deepest element at click point
          const target = document.elementFromPoint(
            (e as MouseEvent).clientX,
            (e as MouseEvent).clientY,
          );
          if (target && !isOverlayElement(target)) {
            selectElement(target);
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
      if (!selectMode || isEditing()) {
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

  // Re-position selection overlay on scroll
  document.addEventListener("scroll", () => {
    if (selectedElement && document.contains(selectedElement)) {
      showSelection(selectedElement);
    }
  }, { capture: true, passive: true });

  // Toggle select mode with Alt key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Alt") {
      toggleSelectMode();
    }
  });
}

init();
