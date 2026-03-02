const BREAKPOINTS = [
  { name: "sm", min: 640 },
  { name: "md", min: 768 },
  { name: "lg", min: 1024 },
  { name: "xl", min: 1280 },
  { name: "2xl", min: 1536 },
];

let badge: HTMLElement | null = null;

function getCurrentBreakpoint(): string {
  const width = window.innerWidth;
  let current = `< sm (${width}px)`;
  for (const bp of BREAKPOINTS) {
    if (width >= bp.min) {
      current = `${bp.name} (${width}px)`;
    }
  }
  return current;
}

function updateBadge() {
  if (badge) {
    badge.textContent = getCurrentBreakpoint();
  }
}

export function initDebugScreens(
  shadowRoot: ShadowRoot,
  position: string,
) {
  const style = document.createElement("style");

  const posMap: Record<string, string> = {
    tl: "top: 0; left: 0;",
    tr: "top: 0; right: 0;",
    bl: "bottom: 32px; left: 0;",
    br: "bottom: 32px; right: 0;",
  };

  const posCSS = posMap[position] || posMap["bl"];

  style.textContent = `
    .aceto-debug-screens {
      position: fixed;
      ${posCSS}
      background: rgba(0, 0, 0, 0.7);
      color: #e2e8f0;
      font: 11px/1.4 ui-monospace, monospace;
      padding: 2px 8px;
      z-index: 2147483646;
      pointer-events: none;
      white-space: nowrap;
    }
  `;
  shadowRoot.appendChild(style);

  badge = document.createElement("div");
  badge.className = "aceto-debug-screens";
  updateBadge();
  shadowRoot.appendChild(badge);

  window.addEventListener("resize", updateBadge);

  for (const bp of BREAKPOINTS) {
    const mq = window.matchMedia(`(min-width: ${bp.min}px)`);
    mq.addEventListener("change", updateBadge);
  }
}
