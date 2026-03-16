export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}
export declare function getLastProvider(): string;
export declare function generateWithProvider(provider: string, messages: ChatMessage[], systemPrompt: string): Promise<{
    text: string;
    name: string;
}>;
export declare function generateResponse(messages: ChatMessage[], systemPrompt: string): Promise<string>;
export declare function transcribeAudio(buffer: Buffer): Promise<string>;
export declare function generateImage(prompt: string): Promise<Buffer | null>;
export declare function generateVideo(prompt: string): Promise<Buffer | null>;
export declare function searchImages(query: string, count?: number): Promise<string[]>;
export declare function getCurrentTime(): string;
export declare function getProviderStatus(): string[];
//# sourceMappingURL=tools.d.ts.map