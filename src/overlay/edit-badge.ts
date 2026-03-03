import { getEditBadge } from "./highlight";
import { getCommandForElement, getAllEditSelectors, type Command } from "./commands";
import { generateSelector, generateFallbackSelector, setSelectedElement } from "./selector";
import { send } from "./ws-client";

interface BadgeEntry {
  element: Element;
  badge: HTMLElement;
  command: Command;
}

let entries: BadgeEntry[] = [];
let visible = true;

function createBadge(entry: BadgeEntry) {
  const badge = entry.badge;

  badge.addEventListener("dblclick", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const cmd = entry.command;
    const el = entry.element;
    if (!document.contains(el)) return;

    const existingData = cmd.extractData ? cmd.extractData(el) : undefined;
    const result = generateSelector(el);
    const fallback = generateFallbackSelector(el);

    cmd.handler({
      mode: "edit",
      element: el,
      selector: result.selector,
      fallbackSelector: fallback,
      existingData,
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
  });

  badge.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (document.contains(entry.element)) {
      setSelectedElement(entry.element);
    }
  });

  badge.addEventListener("mousedown", (e) => e.stopPropagation());
}

function positionBadge(entry: BadgeEntry) {
  const rect = entry.element.getBoundingClientRect();
  entry.badge.style.top = (rect.top + 2) + "px";
  entry.badge.style.left = (rect.right - entry.badge.offsetWidth - 2) + "px";
}

export function refreshEditBadges() {
  // Get shadow root from the template badge
  const templateBadge = getEditBadge();
  if (!templateBadge || !templateBadge.parentNode) return;
  const root = templateBadge.parentNode;

  // Remove old badges
  for (const entry of entries) {
    entry.badge.remove();
  }
  entries = [];

  if (!visible) return;

  // Scan all elements on the page for command matches
  const editSelector = getAllEditSelectors();
  if (!editSelector) return;
  const allElements = document.querySelectorAll(editSelector);
  for (const el of Array.from(allElements)) {
    const cmd = getCommandForElement(el);
    if (!cmd) continue;

    const badge = document.createElement("div");
    badge.className = "aceto-edit-badge";
    const tag = el.tagName.toLowerCase();
    badge.textContent = tag;
    badge.title = `Edit ${tag}`;
    root.appendChild(badge);

    const entry: BadgeEntry = { element: el, badge, command: cmd };
    createBadge(entry);
    positionBadge(entry);
    badge.style.display = "flex";

    entries.push(entry);
  }
}

export function hideEditBadges() {
  visible = false;
  for (const entry of entries) {
    entry.badge.style.display = "none";
  }
}

export function showEditBadges() {
  visible = true;
  refreshEditBadges();
}

export function repositionEditBadges() {
  for (const entry of entries) {
    if (!document.contains(entry.element)) {
      entry.badge.style.display = "none";
      continue;
    }
    positionBadge(entry);
  }
}

// Legacy API - keep for compatibility
export function updateEditBadge(_el: Element) {}
export function hideEditBadge() {}
export function repositionEditBadge() {
  repositionEditBadges();
}
