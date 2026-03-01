let shadowRoot: ShadowRoot | null = null;
let hoverOverlay: HTMLElement | null = null;
let hoverLabel: HTMLElement | null = null;
let selectionOverlay: HTMLElement | null = null;
let breadcrumbBar: HTMLElement | null = null;
let breadcrumbUserSpan: HTMLElement | null = null;
let breadcrumbAgentSpan: HTMLElement | null = null;
let breadcrumbPathSpan: HTMLElement | null = null;
let agentHighlightContainer: HTMLElement | null = null;

let currentUserSelector = "";
let currentAgentSelector = "";

export function initHighlightHost(): ShadowRoot {
  if (shadowRoot) return shadowRoot;

  const host = document.createElement("div");
  host.id = "__aceto_host__";
  host.style.cssText =
    "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;";
  shadowRoot = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    .aceto-overlay {
      position: fixed;
      pointer-events: none;
      transition: all 0.05s ease-out;
      box-sizing: border-box;
    }
    .aceto-hover {
      outline: 2px solid #3b82f6;
      outline-offset: -1px;
      background: rgba(59, 130, 246, 0.04);
    }
    .aceto-selection {
      outline: 2px solid #f43f5e;
      outline-offset: -1px;
      background: rgba(244, 63, 94, 0.06);
    }
    .aceto-label {
      position: fixed;
      pointer-events: none;
      background: #1e293b;
      color: #e2e8f0;
      font: 11px/1.4 ui-monospace, monospace;
      padding: 2px 6px;
      border-radius: 3px;
      white-space: nowrap;
      z-index: 2147483647;
    }
    /* Agent highlights (cyan) */
    .aceto-agent {
      outline: 2px solid #06b6d4;
      outline-offset: -1px;
      background: rgba(6, 182, 212, 0.06);
    }
    .aceto-agent-solid {
      /* static — no animation */
    }
    .aceto-agent-pulse {
      animation: aceto-pulse 2s ease-in-out infinite;
    }
    .aceto-agent-flash {
      animation: aceto-flash 0.6s ease-out forwards;
    }
    @keyframes aceto-pulse {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 1; }
    }
    @keyframes aceto-flash {
      0% { opacity: 1; }
      100% { opacity: 0; }
    }
    .aceto-agent-label {
      position: fixed;
      pointer-events: none;
      background: #164e63;
      color: #e2e8f0;
      font: 11px/1.4 ui-monospace, monospace;
      padding: 2px 6px;
      border-radius: 3px;
      white-space: nowrap;
      z-index: 2147483647;
    }
    /* Breadcrumb bar */
    .aceto-breadcrumb {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: 28px;
      background: #0f172a;
      color: #e2e8f0;
      font: 11px/28px ui-monospace, monospace;
      padding: 0 10px;
      display: flex;
      align-items: center;
      gap: 8px;
      z-index: 2147483647;
      overflow: hidden;
      white-space: nowrap;
    }
    .aceto-breadcrumb-user {
      color: #f43f5e;
    }
    .aceto-breadcrumb-agent {
      color: #06b6d4;
    }
    .aceto-breadcrumb-sep {
      color: #475569;
    }
    .aceto-breadcrumb-path {
      color: #94a3b8;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `;
  shadowRoot.appendChild(style);

  hoverOverlay = document.createElement("div");
  hoverOverlay.className = "aceto-overlay aceto-hover";
  hoverOverlay.style.display = "none";
  shadowRoot.appendChild(hoverOverlay);

  hoverLabel = document.createElement("div");
  hoverLabel.className = "aceto-label";
  hoverLabel.style.display = "none";
  shadowRoot.appendChild(hoverLabel);

  selectionOverlay = document.createElement("div");
  selectionOverlay.className = "aceto-overlay aceto-selection";
  selectionOverlay.style.display = "none";
  shadowRoot.appendChild(selectionOverlay);

  // Agent highlight container
  agentHighlightContainer = document.createElement("div");
  shadowRoot.appendChild(agentHighlightContainer);

  // Breadcrumb bar
  breadcrumbBar = document.createElement("div");
  breadcrumbBar.className = "aceto-breadcrumb";

  breadcrumbUserSpan = document.createElement("span");
  breadcrumbUserSpan.className = "aceto-breadcrumb-user";

  breadcrumbAgentSpan = document.createElement("span");
  breadcrumbAgentSpan.className = "aceto-breadcrumb-agent";

  breadcrumbPathSpan = document.createElement("span");
  breadcrumbPathSpan.className = "aceto-breadcrumb-path";

  breadcrumbBar.appendChild(breadcrumbUserSpan);
  breadcrumbBar.appendChild(breadcrumbAgentSpan);
  const sep = document.createElement("span");
  sep.className = "aceto-breadcrumb-sep";
  sep.textContent = "|";
  breadcrumbBar.appendChild(sep);
  breadcrumbBar.appendChild(breadcrumbPathSpan);

  shadowRoot.appendChild(breadcrumbBar);

  document.documentElement.appendChild(host);
  return shadowRoot;
}

function positionOverlay(overlay: HTMLElement, rect: DOMRect) {
  overlay.style.top = rect.top + "px";
  overlay.style.left = rect.left + "px";
  overlay.style.width = rect.width + "px";
  overlay.style.height = rect.height + "px";
  overlay.style.display = "block";
}

export function showHover(el: Element) {
  if (!hoverOverlay || !hoverLabel) return;
  const rect = el.getBoundingClientRect();
  positionOverlay(hoverOverlay, rect);

  const tag = el.tagName.toLowerCase();
  const classes = Array.from(el.classList).slice(0, 3).join(".");
  hoverLabel.textContent = classes ? `${tag}.${classes}` : tag;

  // Position label above element
  const labelTop = rect.top - 22;
  hoverLabel.style.top = (labelTop < 0 ? rect.bottom + 2 : labelTop) + "px";
  hoverLabel.style.left = rect.left + "px";
  hoverLabel.style.display = "block";
}

export function hideHover() {
  if (hoverOverlay) hoverOverlay.style.display = "none";
  if (hoverLabel) hoverLabel.style.display = "none";
}

export function showSelection(el: Element) {
  if (!selectionOverlay) return;
  const rect = el.getBoundingClientRect();
  positionOverlay(selectionOverlay, rect);
}

export function updateSelection(el: Element | null) {
  if (!el) {
    if (selectionOverlay) selectionOverlay.style.display = "none";
    return;
  }
  showSelection(el);
}

export function hideSelection() {
  if (selectionOverlay) selectionOverlay.style.display = "none";
}

// --- Agent Highlights ---

interface AgentHighlightOptions {
  label?: string;
  style?: "solid" | "pulse" | "flash";
  duration?: number | null;
}

function createAgentOverlay(
  el: Element,
  options: AgentHighlightOptions = {},
): HTMLElement[] {
  const rect = el.getBoundingClientRect();
  const style = options.style || "solid";

  const overlay = document.createElement("div");
  overlay.className = `aceto-overlay aceto-agent aceto-agent-${style}`;
  positionOverlay(overlay, rect);

  const elements: HTMLElement[] = [overlay];

  if (options.label) {
    const label = document.createElement("div");
    label.className = "aceto-agent-label";
    label.textContent = options.label;
    const labelTop = rect.top - 22;
    label.style.top = (labelTop < 0 ? rect.bottom + 2 : labelTop) + "px";
    label.style.left = rect.left + "px";
    label.style.display = "block";
    elements.push(label);
  }

  return elements;
}

export function showAgentHighlight(
  selector: string,
  options: AgentHighlightOptions = {},
) {
  if (!agentHighlightContainer) return;

  const el = document.querySelector(selector);
  if (!el) return;

  const elements = createAgentOverlay(el, options);
  for (const elem of elements) {
    agentHighlightContainer.appendChild(elem);
  }

  currentAgentSelector = selector;
  updateBreadcrumb();

  // Auto-remove flash after animation
  if (options.style === "flash") {
    setTimeout(() => {
      for (const elem of elements) elem.remove();
    }, 600);
  }

  // Duration-based removal
  if (options.duration != null && options.duration > 0) {
    setTimeout(() => {
      for (const elem of elements) elem.remove();
    }, options.duration * 1000);
  }
}

export function showAgentHighlights(
  items: Array<{ selector: string; label?: string }>,
) {
  clearAgentHighlights();
  if (!agentHighlightContainer) return;

  for (const item of items) {
    const el = document.querySelector(item.selector);
    if (!el) continue;
    const elements = createAgentOverlay(el, { label: item.label, style: "solid" });
    for (const elem of elements) {
      agentHighlightContainer.appendChild(elem);
    }
  }

  if (items.length > 0) {
    currentAgentSelector = items[0].selector;
    updateBreadcrumb();
  }
}

export function clearAgentHighlights() {
  if (agentHighlightContainer) {
    agentHighlightContainer.innerHTML = "";
  }
  currentAgentSelector = "";
  updateBreadcrumb();
}

// --- Flash Feedback ---

export function flashElement(selector: string) {
  if (!agentHighlightContainer) return;
  const el = document.querySelector(selector);
  if (!el) return;

  const rect = el.getBoundingClientRect();
  const overlay = document.createElement("div");
  overlay.className = "aceto-overlay aceto-agent aceto-agent-flash";
  positionOverlay(overlay, rect);
  agentHighlightContainer.appendChild(overlay);

  setTimeout(() => overlay.remove(), 600);
}

// --- Breadcrumb ---

export function setUserSelector(selector: string) {
  currentUserSelector = selector;
  updateBreadcrumb();
}

function buildSelectorPath(selector: string): string {
  try {
    const el = document.querySelector(selector);
    if (!el) return selector;

    const parts: string[] = [];
    let current: Element | null = el;
    while (current && current !== document.documentElement && current !== document.body) {
      const tag = current.tagName.toLowerCase();
      const id = current.id ? `#${current.id}` : "";
      const cls = Array.from(current.classList).slice(0, 2).map(c => `.${c}`).join("");
      parts.unshift(tag + id + cls);
      current = current.parentElement;
    }
    return parts.join(" > ");
  } catch {
    return selector;
  }
}

function updateBreadcrumb() {
  if (!breadcrumbUserSpan || !breadcrumbAgentSpan || !breadcrumbPathSpan) return;

  const parts: string[] = [];

  if (currentUserSelector) {
    breadcrumbUserSpan.textContent = "\u{1F534} " + currentUserSelector;
    parts.push(buildSelectorPath(currentUserSelector));
  } else {
    breadcrumbUserSpan.textContent = "";
  }

  if (currentUserSelector && currentAgentSelector) {
    breadcrumbAgentSpan.textContent = "  \u00B7  \u{1F535} " + currentAgentSelector;
  } else if (currentAgentSelector) {
    breadcrumbAgentSpan.textContent = "\u{1F535} " + currentAgentSelector;
    parts.push(buildSelectorPath(currentAgentSelector));
  } else {
    breadcrumbAgentSpan.textContent = "";
  }

  breadcrumbPathSpan.textContent = parts[0] || "";
}
