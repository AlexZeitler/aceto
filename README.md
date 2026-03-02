# Aceto

A local dev server with a browser overlay and MCP interface for iterating on UIs together with an AI agent.

**Not a drawing tool, not a visual editor.** Instead, a feedback loop between you and an agent:

1. Tell the agent what you want
2. The agent generates/modifies real HTML + Tailwind
3. See the result live in your browser
4. **Point at an element** and say "change this"
5. The agent understands which element you mean and modifies it

## Why Aceto

- **Token-efficient:** The agent doesn't need to read and parse the full HTML to understand what you mean. You point at an element in the browser, the agent gets a precise selector. Write tools use the current selection by default — one tool call, no roundtrip.
- **Real HTML:** No abstraction layer, no component model. The output is a plain HTML file you can read with `cat` and send by email.
- **Live feedback loop:** DOM morphing keeps scroll position and selection state. You see changes instantly without page reload flicker.

## What Aceto Does

- **Serve HTML files** with live reload (DOM morphing, no flickering)
- **Select elements in the browser** — hover highlighting, click selection, scroll wheel for depth navigation (parent/child)
- **Expose an MCP interface** for the agent — read, write, highlight, navigate
- **Inline editing** — double-click to edit text, Tab/Shift+Tab to navigate between table cells
- **Table controls** — floating toolbar (+Row, −Row, +Col, −Col) when table elements are selected
- **Content shortcuts** — type `[]` or `[x]` in a cell to insert a checkbox
- **Paste images** — Ctrl+V with selection inserts instantly; without selection, stages the image for agent-driven placement
- **Asset picker** — press `a` to browse and reuse previously pasted images from the assets folder
- **Screenshots** — the agent can capture full-page or element-level screenshots via `get_screenshot()`, saved to `.aceto/screenshots/`

## What Aceto Does Not Do

- No editor — you don't edit anything yourself, you steer the agent
- No build system — an HTML file you can read with `cat`
- No framework — Tailwind v4 via CDN, optionally DaisyUI/Flowbite

## Keyboard Shortcuts (Select Mode)

| Key | Action |
|-----|--------|
| Click | Select element |
| Double-click | Inline edit text |
| Scroll wheel | Navigate depth (parent/child) |
| Tab / Shift+Tab | Next/previous cell (during table editing) |
| `a` | Open asset picker |
| Del | Delete selected element |
| Esc | Close modal / deselect |
| `e` / Alt | Toggle select/preview mode |
| Ctrl+V | Paste image |

## Bidirectional Communication

- **Your selection (pink):** "I mean this element" — click in the browser
- **Agent selection (cyan):** "Look at this" — via `highlight_element()` MCP tool
- **Breadcrumb bar:** Shows both selections + DOM path

## Getting Started

```bash
# Create a new project
aceto init

# Start the dev server
aceto dev

# Export for production
aceto export --production
```

## CLI

```bash
aceto init                    # Create index.html + CLAUDE.md + aceto.md
aceto init --eject            # Write default instructions into aceto.md
aceto init --preset daisyui   # Create project with DaisyUI v5 pre-installed
aceto dev                     # Start dev server + MCP server
aceto dev about.html          # Start with a specific page
aceto dev --port 3001         # Custom port
aceto new about               # Create a new HTML page
aceto new dashboard/settings -l daisyui  # New page with DaisyUI
aceto add daisyui             # Add DaisyUI v5 to an existing project
aceto export                  # Export HTML with cleanup to dist/
aceto export --production     # Export with Tailwind CSS build
```

## Agent Instructions

On `aceto init`, a minimal `CLAUDE.md` is created that tells the agent to call `get_instructions()` via MCP. This tool returns the project's `aceto.md` if it has content, or the built-in default instructions.

To customize the instructions, run `aceto init --eject` to write the defaults into `aceto.md`, then edit to your needs.

## Library Support

Aceto supports adding component libraries via `aceto add <library>`. This inserts CDN links into `index.html` and automatically includes library-specific instructions when the agent calls `get_instructions()`.

Currently supported: **DaisyUI v5** (`aceto add daisyui`)

## Screenshots

The agent can capture screenshots of the current page or a specific element via the `get_screenshot()` MCP tool. Screenshots are saved to `.aceto/screenshots/` in the project directory. The overlay is automatically hidden during capture.

## Tech Stack

Bun runtime, parse5 for HTML parsing, css-select for selectors, idiomorph for DOM morphing, MCP SDK for the agent interface. No Express, no React, no build step.
