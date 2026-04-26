export interface TmuxPane {
    session: string;
    window: string;
    index: string;
    id: string;
    active: boolean;
    command: string;
}
export declare function hasTmux(): boolean;
export declare function tmux(args: string[], options?: {
    stdio?: "ignore" | "inherit" | "pipe";
    cwd?: string;
}): string;
export declare function hasSession(session: string): boolean;
export declare function listPanes(session: string): TmuxPane[];
export declare function quoteShell(value: string): string;
