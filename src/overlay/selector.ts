import { send } from "./ws-client";
import {
  initHighlightHost,
  showHover,
  hideHover,
  showSelection,
  hideSelection,
} from "./highlight";
import { initDepthNavigation } from "./depth";

let selectedElement: Element | null = null;
let selectMode = true;

function isOverlayElement(el: Element): boolean {
  let current: Element | null = el;
  while (current) {
    if (current.id === "__aceto_host__") return true;
    current = current.parentElement;
  }
  return false;
}

function generateSelector(el: Element): string {
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
    parentSelector: parent ? generateSelector(parent) : "",
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

  const selector = generateSelector(el);
  const meta = getElementMeta(el);

  send({
    type: "select",
    selector,
    html: el.outerHTML,
    meta,
  });
}

export function getSelectedElement(): Element | null {
  return selectedElement;
}

export function setSelectedElement(el: Element | null) {
  selectedElement = el;
  if (el) {
    showSelection(el);
    const selector = generateSelector(el);
    const meta = getElementMeta(el);
    send({ type: "select", selector, html: el.outerHTML, meta });
  } else {
    hideSelection();
  }
}

function init() {
  initHighlightHost();

  // Prevent all default interactions in select mode
  const blockEvents = ["click", "mousedown", "mouseup", "submit", "keydown", "keypress", "keyup", "contextmenu", "dblclick"];

  for (const eventName of blockEvents) {
    document.addEventListener(
      eventName,
      (e) => {
        if (!selectMode) return;
        if (isOverlayElement(e.target as Element)) return;

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
      selectMode = !selectMode;
      if (!selectMode) {
        hideHover();
      }
    }
  });
}

init();
