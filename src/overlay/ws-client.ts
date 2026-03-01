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

// Handle reload
on("reload", () => {
  window.location.reload();
});

connect();
