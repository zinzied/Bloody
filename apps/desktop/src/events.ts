// WebSocket event subscriber for live updates from the Bloody engine

type WsFrame = {
  topic: string;
  ts: number;
  payload: unknown;
};

type EventHandler = (frame: WsFrame) => void;

let ws: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
const handlers = new Set<EventHandler>();
let currentPort: number | null = null;
let currentToken: string | null = null;
let connecting = false;

export function subscribe(port: number, token: string) {
  if (ws?.readyState === WebSocket.OPEN && currentPort === port && currentToken === token) {
    return; // Already connected to the same engine
  }

  disconnect();
  currentPort = port;
  currentToken = token;
  connect();
}

function connect() {
  if (connecting || !currentPort || !currentToken) return;
  connecting = true;

  const url = `ws://127.0.0.1:${currentPort}/api/events?token=${encodeURIComponent(currentToken)}`;
  ws = new WebSocket(url);

  ws.onopen = () => {
    connecting = false;
    console.log('[WS] Connected to engine events');
  };

  ws.onmessage = (event) => {
    try {
      const frame: WsFrame = JSON.parse(event.data);
      handlers.forEach((h) => {
        try { h(frame); } catch (e) { console.error('Event handler error:', e); }
      });
    } catch (e) {
      console.error('[WS] Parse error:', e);
    }
  };

  ws.onclose = () => {
    connecting = false;
    console.log('[WS] Disconnected, scheduling reconnect…');
    scheduleReconnect();
  };

  ws.onerror = (err) => {
    console.error('[WS] Error:', err);
  };
}

function scheduleReconnect() {
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  reconnectTimeout = setTimeout(() => {
    if (currentPort && currentToken) {
      console.log('[WS] Reconnecting…');
      connect();
    }
  }, 2000);
}

export function onEvent(handler: EventHandler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function disconnect() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
  currentPort = null;
  currentToken = null;
  connecting = false;
}

export function isConnected(): boolean {
  return ws?.readyState === WebSocket.OPEN;
}