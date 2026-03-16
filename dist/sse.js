"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSseClients = getSseClients;
exports.broadcastEvent = broadcastEvent;
// SSE (Server-Sent Events) clients for real-time dashboard updates
const sseClients = new Set();
function getSseClients() {
    return sseClients;
}
function broadcastEvent(event) {
    const msg = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of sseClients) {
        try {
            client.write(msg);
        }
        catch (e) {
            sseClients.delete(client);
        }
    }
}
//# sourceMappingURL=sse.js.map