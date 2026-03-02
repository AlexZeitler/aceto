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

function init() {
  initHighlightHost();

  // Set up mode toggle button
  const toggleBtn = getModeToggleButton();
  if (toggleBtn) {
    toggleBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleSelectMode();
    });
  }

  // Prevent all default interactions in select mode
  const blockEvents = ["click", "mousedown", "mouseup", "submit", "keydown", "keypress", "keyup", "contextmenu", "dblclick"];

  for (const eventName of blockEvents) {
    document.addEventListener(
      eventName,
      (e) => {
        if (!selectMode) return;
        if (isOverlayElement(e.target as Element)) return;

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

  // Hover highlighting
  document.addEventListener(
    "mousemove",
    (e) => {
      if (!selectMode) {
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
