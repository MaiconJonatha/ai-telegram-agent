import type { ServerResponse } from "http";
export declare function getSseClients(): Set<ServerResponse>;
export declare function broadcastEvent(event: {
    type: string;
    data: any;
}): void;
//# sourceMappingURL=sse.d.ts.map