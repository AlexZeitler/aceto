# Aceto

A local dev server with a browser overlay and MCP interface for iterating on UIs together with an AI agent.

**Not a drawing tool, not a visual editor.** Instead, a feedback loop between you and an agent:

1. Tell the agent what you want
2. The agent generates/modifies real HTML + Tailwind
3. See the result live in your browser
4. **Point at an element** and say "change this"
5. The agent understands which element you mean and modifies it

## What Aceto Does

- **Serve HTML files** with live reload (DOM morphing, no flickering)
- **Select elements in the browser** — hover highlighting, click selection, scroll wheel for depth navigation (parent/child)
- **Expose an MCP interface** for the agent — read, write, highlight, navigate

## What Aceto Does Not Do

- No editor — you don't edit anything yourself, you steer the agent
- No build system — an HTML file you can read with `cat`
- No framework — Tailwind v4 via CDN, optionally DaisyUI/Flowbite

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
aceto init                    # Create index.html + aceto.md
aceto dev                     # Start dev server + MCP server
aceto dev --port 3001         # Custom port
aceto export                  # Export HTML with cleanup to dist/
aceto export --production     # Export with Tailwind CSS build
```

## Tech Stack

Bun runtime, parse5 for HTML parsing, css-select for selectors, idiomorph for DOM morphing, MCP SDK for the agent interface. No Express, no React, no build step.
