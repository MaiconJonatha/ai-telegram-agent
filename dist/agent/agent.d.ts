export declare function getLastAgent(userId: string): string;
export declare const activeRepos: Record<string, string>;
export declare function processMessage(userId: string, userName: string, text: string): Promise<string>;
export declare function setSendMessageCallback(cb: (chatId: string, text: string) => Promise<void>): void;
//# sourceMappingURL=agent.d.ts.map