let shadowRoot: ShadowRoot | null = null;
let hoverOverlay: HTMLElement | null = null;
let hoverLabel: HTMLElement | null = null;
let selectionOverlay: HTMLElement | null = null;
let breadcrumbBar: HTMLElement | null = null;
let breadcrumbUserSpan: HTMLElement | null = null;
let breadcrumbAgentSpan: HTMLElement | null = null;
let breadcrumbPathSpan: HTMLElement | null = null;
let agentHighlightContainer: HTMLElement | null = null;
let modeToggleButton: HTMLElement | null = null;
let undoButton: HTMLElement | null = null;
let redoButton: HTMLElement | null = null;
let pasteImageIndicator: HTMLElement | null = null;
let pageButton: HTMLElement | null = null;
let pageDropdown: HTMLElement | null = null;

let currentUserSelector = "";
let currentAgentSelector = "";
let currentPages: Array<{ path: string; file: string }> = [];

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
    .aceto-toolbar {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-left: auto;
    }
    .aceto-undo-redo {
      pointer-events: auto;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 3px;
      border: 1px solid transparent;
      background: transparent;
      font: 11px/1.4 ui-monospace, monospace;
      color: #94a3b8;
      white-space: nowrap;
      user-select: none;
    }
    .aceto-undo-redo:hover {
      border-color: #475569;
      color: #e2e8f0;
    }
    .aceto-mode-toggle {
      pointer-events: auto;
      cursor: pointer;
      padding: 2px 8px;
      border-radius: 3px;
      border: 1px solid transparent;
      font: 11px/1.4 ui-monospace, monospace;
      color: #e2e8f0;
      white-space: nowrap;
      user-select: none;
    }
    .aceto-mode-toggle:hover {
      border-color: #475569;
    }
    .aceto-mode-select {
      background: #1e40af;
    }
    .aceto-mode-preview {
      background: #15803d;
    }
    .aceto-paste-indicator {
      display: none;
      align-items: center;
      gap: 4px;
      pointer-events: auto;
      padding: 1px 6px;
      border-radius: 3px;
      background: #1e293b;
      border: 1px solid #475569;
      cursor: default;
    }
    .aceto-paste-indicator img {
      width: 18px;
      height: 18px;
      object-fit: cover;
      border-radius: 2px;
    }
    .aceto-paste-indicator span {
      color: #94a3b8;
      font: 10px/1 ui-monospace, monospace;
      max-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .aceto-paste-dismiss {
      color: #64748b;
      cursor: pointer;
      font-size: 13px;
      line-height: 1;
      padding: 0 2px;
    }
    .aceto-paste-dismiss:hover {
      color: #e2e8f0;
    }
    /* Page dropdown */
    .aceto-page-btn {
      pointer-events: auto;
      cursor: pointer;
      padding: 2px 8px;
      border-radius: 3px;
      border: 1px solid transparent;
      background: transparent;
      font: 11px/1.4 ui-monospace, monospace;
      color: #e2e8f0;
      white-space: nowrap;
      user-select: none;
      flex-shrink: 0;
    }
    .aceto-page-btn:hover {
      border-color: #475569;
    }
    .aceto-page-dropdown {
      position: fixed;
      bottom: 28px;
      left: 0;
      min-width: 200px;
      max-height: 300px;
      overflow-y: auto;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 4px;
      box-shadow: 0 -4px 12px rgba(0,0,0,0.3);
      display: none;
      pointer-events: auto;
      z-index: 2147483647;
    }
    .aceto-page-dropdown.open {
      display: block;
    }
    .aceto-page-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      font: 11px/1.4 ui-monospace, monospace;
      color: #94a3b8;
      cursor: pointer;
      white-space: nowrap;
    }
    .aceto-page-item:hover {
      background: #334155;
      color: #e2e8f0;
    }
    .aceto-page-item-active {
      color: #e2e8f0;
      font-weight: 600;
    }
    .aceto-page-item-check {
      width: 14px;
      text-align: center;
      flex-shrink: 0;
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

  // Page dropdown
  pageButton = document.createElement("button");
  pageButton.className = "aceto-page-btn";
  pageButton.textContent = getCurrentPageLabel() + " \u25BE";
  breadcrumbBar.appendChild(pageButton);

  pageDropdown = document.createElement("div");
  pageDropdown.className = "aceto-page-dropdown";

  let skipNextDocClick = false;
  pageButton.addEventListener("click", () => {
    const willOpen = !pageDropdown!.classList.contains("open");
    pageDropdown!.classList.toggle("open");
    if (willOpen) {
      skipNextDocClick = true;
    }
  });

  // Close dropdown on outside click or Escape
  document.addEventListener("click", () => {
    if (skipNextDocClick) {
      skipNextDocClick = false;
      return;
    }
    pageDropdown?.classList.remove("open");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      pageDropdown?.classList.remove("open");
    }
  });

  const pageSep = document.createElement("span");
  pageSep.className = "aceto-breadcrumb-sep";
  pageSep.textContent = "|";
  breadcrumbBar.appendChild(pageSep);

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

  // Toolbar container (undo, redo, mode toggle) — pushed right via margin-left: auto
  const toolbar = document.createElement("div");
  toolbar.className = "aceto-toolbar";

  pasteImageIndicator = document.createElement("div");
  pasteImageIndicator.className = "aceto-paste-indicator";
  toolbar.appendChild(pasteImageIndicator);

  undoButton = document.createElement("button");
  undoButton.className = "aceto-undo-redo";
  undoButton.textContent = "\u21B6";
  undoButton.title = "Undo";
  toolbar.appendChild(undoButton);

  redoButton = document.createElement("button");
  redoButton.className = "aceto-undo-redo";
  redoButton.textContent = "\u21B7";
  redoButton.title = "Redo";
  toolbar.appendChild(redoButton);

  modeToggleButton = document.createElement("button");
  modeToggleButton.className = "aceto-mode-toggle aceto-mode-select";
  modeToggleButton.textContent = "Select";
  toolbar.appendChild(modeToggleButton);

  breadcrumbBar.appendChild(toolbar);

  shadowRoot.appendChild(breadcrumbBar);
  // Append dropdown to shadowRoot (not breadcrumbBar) to avoid overflow:hidden clipping
  shadowRoot.appendChild(pageDropdown);

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

export function getModeToggleButton(): HTMLElement | null {
  return modeToggleButton;
}

export function getUndoButton(): HTMLElement | null {
  return undoButton;
}

export function getRedoButton(): HTMLElement | null {
  return redoButton;
}

export function updateModeIndicator(isSelectMode: boolean) {
  if (!modeToggleButton) return;
  if (isSelectMode) {
    modeToggleButton.textContent = "Select";
    modeToggleButton.className = "aceto-mode-toggle aceto-mode-select";
  } else {
    modeToggleButton.textContent = "Preview";
    modeToggleButton.className = "aceto-mode-toggle aceto-mode-preview";
  }
}

export function showPastedImage(imagePath: string) {
  if (!pasteImageIndicator) return;
  const img = document.createElement("img");
  img.src = imagePath;
  const label = document.createElement("span");
  label.textContent = imagePath.split("/").pop() || imagePath;
  label.title = imagePath;
  const dismiss = document.createElement("span");
  dismiss.className = "aceto-paste-dismiss";
  dismiss.textContent = "\u00D7";
  dismiss.title = "Dismiss";
  dismiss.addEventListener("click", () => clearPastedImage());

  pasteImageIndicator.innerHTML = "";
  pasteImageIndicator.appendChild(img);
  pasteImageIndicator.appendChild(label);
  pasteImageIndicator.appendChild(dismiss);
  pasteImageIndicator.style.display = "flex";
}

export function clearPastedImage() {
  if (!pasteImageIndicator) return;
  pasteImageIndicator.innerHTML = "";
  pasteImageIndicator.style.display = "none";
}

function getCurrentPageLabel(): string {
  const pathname = window.location.pathname;
  if (pathname === "/") return "index.html";
  // "/about" → "about.html", "/dashboard/settings" → "dashboard/settings.html"
  return pathname.replace(/^\//, "") + ".html";
}

export function updatePageList(pages: Array<{ path: string; file: string }>) {
  currentPages = pages;
  renderPageDropdown();
  // Update button text in case current page changed
  if (pageButton) {
    pageButton.textContent = getCurrentPageLabel() + " \u25BE";
  }
}

function renderPageDropdown() {
  if (!pageDropdown) return;
  pageDropdown.innerHTML = "";

  const currentPath = window.location.pathname;

  for (const page of currentPages) {
    const item = document.createElement("div");
    const isActive = page.path === currentPath;
    item.className = "aceto-page-item" + (isActive ? " aceto-page-item-active" : "");

    const check = document.createElement("span");
    check.className = "aceto-page-item-check";
    check.textContent = isActive ? "\u2713" : "";
    item.appendChild(check);

    const label = document.createElement("span");
    label.textContent = page.path + " (" + page.file + ")";
    item.appendChild(label);

    item.addEventListener("click", (e) => {
      e.stopPropagation();
      pageDropdown!.classList.remove("open");
      if (!isActive) {
        window.location.href = page.path;
      }
    });

    pageDropdown.appendChild(item);
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
