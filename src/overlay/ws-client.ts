import { Idiomorph } from "idiomorph";
import {
  showAgentHighlight,
  showAgentHighlights,
  clearAgentHighlights,
  flashElement,
} from "./highlight";

type MessageHandler = (data: any) => void;

const handlers = new Map<string, MessageHandler[]>();
let ws: WebSocket | null = null;
let reconnectDelay = 250;

function connect() {
  const port = (window as any).__ACETO_WS_PORT__ || 3000;
  ws = new WebSocket(`ws://localhost:${port}`);

  ws.onopen = () => {
    reconnectDelay = 250;
    send({ type: "ready" });
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      const fns = handlers.get(data.type);
      if (fns) {
        for (const fn of fns) fn(data);
      }
    } catch {}
  };

  ws.onclose = () => {
    ws = null;
    setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, 5000);
      connect();
    }, reconnectDelay);
  };
}

export function send(msg: object) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function on(type: string, handler: MessageHandler) {
  const list = handlers.get(type) || [];
  list.push(handler);
  handlers.set(type, list);
}

// Full reload fallback
on("reload", () => {
  window.location.reload();
});

// DOM morphing update
on("update", (data) => {
  Idiomorph.morph(document.body, data.html, { morphStyle: "innerHTML" });
  send({ type: "ready" });
});

// Agent highlights
on("highlight", (data) => {
  showAgentHighlight(data.selector, data.options || {});
});

on("highlights", (data) => {
  showAgentHighlights(data.items || []);
});

on("clear_highlights", () => {
  clearAgentHighlights();
});

// Flash feedback after changes
on("flash", (data) => {
  flashElement(data.selector);
});

// Navigation
on("navigate", (data) => {
  window.location.href = data.path;
});

// Scroll to element
on("scroll_to", (data) => {
  const el = document.querySelector(data.selector);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
});

// Mid counter sync
let midCounter = 1;

on("mid_counter", (data) => {
  midCounter = data.value;
});

export function getNextMid(): string {
  const mid = `m${midCounter}`;
  midCounter++;
  return mid;
}

connect();
