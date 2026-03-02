export interface LibraryDef {
  name: string;
  displayName: string;
  version: string;
  cdnLinks: Array<{ url: string; type: "css" | "script" }>;
  instructions: string;
}

const LIBRARIES: Record<string, LibraryDef> = {
  daisyui: {
    name: "daisyui",
    displayName: "DaisyUI v5",
    version: "5",
    cdnLinks: [
      { url: "https://cdn.jsdelivr.net/npm/daisyui@5", type: "css" },
      { url: "https://cdn.jsdelivr.net/npm/daisyui@5/themes.css", type: "css" },
    ],
    instructions: `## DaisyUI v5

This project uses DaisyUI v5 component library on top of Tailwind CSS v4.

- Use DaisyUI component classes (btn, card, navbar, modal, drawer, hero, footer, etc.)
- Themes: add \`data-theme="<name>"\` to \`<html>\` (e.g. "light", "dark", "cupcake", "dracula")
- Docs: https://daisyui.com/components/
- The CDN includes base styles + all themes

### MCP Integration (optional)
For deeper DaisyUI knowledge, the user can add a DaisyUI MCP server:
- **Free:** GitMCP — https://gitmcp.io/saadeghi/daisyui
- **Premium:** DaisyUI Blueprint — https://daisyui.com/blog/daisyui-mcp/`,
  },
};

export function getLibrary(name: string): LibraryDef | undefined {
  return LIBRARIES[name.toLowerCase()];
}

export function getAvailableLibraries(): string[] {
  return Object.keys(LIBRARIES);
}
