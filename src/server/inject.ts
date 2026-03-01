import path from "path";

let cachedOverlayScript: string | null = null;

export async function buildOverlay(): Promise<string> {
  const result = await Bun.build({
    entrypoints: [path.join(import.meta.dir, "../overlay/index.ts")],
    target: "browser",
    minify: false,
  });

  if (!result.success) {
    throw new Error(
      "Overlay build failed: " + result.logs.map(String).join("\n"),
    );
  }

  cachedOverlayScript = await result.outputs[0].text();
  return cachedOverlayScript;
}

export function injectOverlay(html: string, wsPort: number): string {
  if (!cachedOverlayScript) {
    return html;
  }

  const injection = `<script data-aceto-overlay>
window.__ACETO_WS_PORT__ = ${wsPort};
${cachedOverlayScript}
</script>`;

  const bodyClose = html.lastIndexOf("</body>");
  if (bodyClose !== -1) {
    return html.slice(0, bodyClose) + injection + html.slice(bodyClose);
  }
  return html + injection;
}
