export declare const DEFAULT_WORKBENCH_SESSION = "pi-workbench";
export interface WorkbenchOptions {
    piCommand?: string;
    sidebarCommand?: string;
}
export declare function ensureWorkbench(session: string, options?: WorkbenchOptions): void;
export declare function createWorkbench(session: string, options?: WorkbenchOptions): void;
export declare function buildSidebarCommand(session: string): string;
export declare function buildPiCommand(session: string, id: string, command?: string): string;
export declare function ensureWorkbenchLayout(session: string): void;
export declare function getWorkbenchPaneIds(session: string): string[];
export declare function resizeSidebar(leftPane: string): void;
export declare function configureTmuxForPi(): void;
export declare function resetWorkbench(session: string): boolean;
export declare function tryTmux(args: string[]): string | undefined;
