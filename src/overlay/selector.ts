import { send, getNextMid } from "./ws-client";
import {
  initHighlightHost,
  showHover,
  hideHover,
  showSelection,
  hideSelection,
  setUserSelector,
  getModeToggleButton,
  updateModeIndicator,
} from "./highlight";
import { initDepthNavigation, clearDepthNavigation } from "./depth";

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
  }
}

// --- Inline Text Editing ---

const EDITABLE_TAGS = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6",
  "span", "a", "li", "td", "th", "label", "button",
  "dt", "dd", "figcaption", "blockquote", "cite", "em", "strong", "b", "i", "u", "small",
]);

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
    send({
      type: "text_edit",
      selector: result.selector,
      fallbackSelector: fallback,
      text: newText,
    });
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
            // Handle Enter and Escape during editing
            if (eventName === "keydown") {
              const key = (e as KeyboardEvent).key;
              if (key === "Enter" && !(e as KeyboardEvent).shiftKey) {
                e.preventDefault();
                commitEdit();
                return;
              }
              if (key === "Escape") {
                e.preventDefault();
                cancelEdit();
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

        // ESC to deselect
        if (eventName === "keydown" && (e as KeyboardEvent).key === "Escape") {
          if (selectedElement) {
            selectedElement = null;
            hideSelection();
            setUserSelector("");
            clearDepthNavigation();
            send({ type: "deselect" });
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
        // Small delay to allow click-outside to be handled first
        setTimeout(() => {
          if (isEditing()) commitEdit();
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

  // Toggle select mode with Alt key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Alt") {
      toggleSelectMode();
    }
  });
}

init();
