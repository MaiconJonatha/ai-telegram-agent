import type { ServerResponse } from "http";

// SSE (Server-Sent Events) clients for real-time dashboard updates
const sseClients: Set<ServerResponse> = new Set();

export function getSseClients(): Set<ServerResponse> {
  return sseClients;
}

export function broadcastEvent(event: { type: string; data: any }) {
  const msg = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(msg);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}
