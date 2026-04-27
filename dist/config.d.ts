export interface WorkbenchConfig {
    sidebarWidth: number;
    hideTmuxStatus: boolean;
    mouse: boolean;
}
export declare const DEFAULT_CONFIG: WorkbenchConfig;
export declare function getConfigPath(): string;
export declare function readConfig(path?: string): WorkbenchConfig;
export declare function writeConfig(config: WorkbenchConfig, path?: string): void;
export declare function getSidebarWidth(): number;
