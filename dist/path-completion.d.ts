export interface PathCompletionResult {
    value: string;
    matched: boolean;
    ambiguous: boolean;
}
export declare function completeDirectoryPath(input: string, cwd: string, home?: string): PathCompletionResult;
