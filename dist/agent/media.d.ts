/**
 * Per-user media cache and video merging via ffmpeg.
 */
export declare function addMedia(userId: string, buffer: Buffer, type: "image" | "video", prompt: string): void;
export declare function getLastVideos(userId: string, count: number): Buffer[];
export declare function mergeVideos(videos: Buffer[]): Promise<Buffer>;
//# sourceMappingURL=media.d.ts.map