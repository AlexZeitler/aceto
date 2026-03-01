let shadowRoot: ShadowRoot | null = null;
let hoverOverlay: HTMLElement | null = null;
let hoverLabel: HTMLElement | null = null;
let selectionOverlay: HTMLElement | null = null;

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
