export declare function initDatabase(): Promise<void>;
export declare function saveMessage(userId: string, role: string, content: string): void;
export declare function getHistory(userId: string, limit?: number): Promise<Array<{
    role: string;
    content: string;
}>>;
export declare function saveUserPreference(userId: string, name: string, context: string): void;
export declare function getUserPreference(userId: string): Promise<{
    name: string;
    context: string;
} | undefined>;
export declare function clearHistory(userId: string): void;
export declare function logMedia(userId: string, type: string, prompt: string, provider: string, fileSize: number): void;
export declare function logAgent(userId: string, agent: string, action: string, status?: string): void;
export declare function getStats(): Promise<{
    messagesTotal: number;
    messagesToday: number;
    imagesTotal: number;
    videosTotal: number;
}>;
export declare function getRecentActivity(limit?: number): Promise<any[]>;
export declare function getAgentStats(): Promise<any[]>;
export declare function getConversationCounts(): Promise<any[]>;
//# sourceMappingURL=memory.d.ts.map