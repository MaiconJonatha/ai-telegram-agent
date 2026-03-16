export declare function listRepos(): Promise<string[]>;
export declare function getRepoTree(repo: string, path?: string): Promise<string[]>;
export declare function readFile(repo: string, path: string): Promise<string>;
export declare function createOrUpdateFile(repo: string, path: string, content: string, message: string): Promise<{
    success: boolean;
    url?: string;
    error?: string;
}>;
export declare function deleteFile(repo: string, path: string, message: string): Promise<{
    success: boolean;
    error?: string;
}>;
export declare function createBranch(repo: string, branchName: string, fromBranch?: string): Promise<{
    success: boolean;
    error?: string;
}>;
export declare function createPR(repo: string, title: string, body: string, head: string, base?: string): Promise<{
    success: boolean;
    url?: string;
    error?: string;
}>;
export declare function createRepo(name: string, description?: string): Promise<{
    success: boolean;
    fullName?: string;
    error?: string;
}>;
export declare function executeCoderTask(task: string, repo: string, context?: string): Promise<string>;
export declare function isGitHubConfigured(): boolean;
//# sourceMappingURL=coder.d.ts.map