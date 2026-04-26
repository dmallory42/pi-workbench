export interface GitInfo {
    gitBranch?: string;
    gitDirty?: boolean;
}
export declare function getGitInfo(cwd: string): GitInfo;
