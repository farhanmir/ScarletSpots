import { supabase } from "@/shared/api/supabase-client";
import { getWebSocketAttestationPayload } from "@/shared/security/attestation";

type SocketMessage = Record<string, unknown>;

type AuthedWebSocketConfig = {
  endpoint: string;
  authPayload?: Record<string, unknown>;
  onMessage: (payload: SocketMessage) => void;
};

export function createAuthedWebSocket(config: AuthedWebSocketConfig): () => void {
  let socket: WebSocket | null = null;
  let stopped = false;
  let retryCount = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;

  const clearTimers = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (stopped) return;
    const delayMs = Math.min(30000, 1500 * 2 ** retryCount);
    retryCount += 1;
    reconnectTimer = setTimeout(() => {
      void connect();
    }, delayMs);
  };

  const connect = async () => {
    if (stopped) return;

    socket = new WebSocket(config.endpoint);

    socket.onopen = async () => {
      retryCount = 0;
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token || socket?.readyState !== WebSocket.OPEN) {
        socket?.close();
        return;
      }

      socket.send(
        JSON.stringify({
          type: "auth",
          token: session.access_token,
          ...(await getWebSocketAttestationPayload()),
          ...config.authPayload,
        }),
      );

      pingTimer = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "ping" }));
        }
      }, 25000);
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as SocketMessage;
        config.onMessage(payload);
      } catch {
        // Ignore malformed frames
      }
    };

    socket.onerror = () => {
      // onclose handles reconnect scheduling
    };

    socket.onclose = () => {
      clearTimers();
      scheduleReconnect();
    };
  };

  void connect();

  return () => {
    stopped = true;
    clearTimers();
    if (socket) {
      socket.close();
      socket = null;
    }
  };
}
