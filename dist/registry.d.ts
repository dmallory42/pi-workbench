export type WorkbenchStatus = "idle" | "thinking" | "running" | "stopped";
export interface WorkbenchSession {
    id: string;
    pid?: number;
    cwd: string;
    displayName: string;
    status: WorkbenchStatus;
    tmuxPaneId?: string;
    tmuxSession?: string;
    model?: string;
    createdAt: number;
    updatedAt: number;
    managed?: boolean;
}
export interface WorkbenchRegistry {
    version: 1;
    sessions: WorkbenchSession[];
    recentProjects: string[];
}
export declare const DEFAULT_STALE_MS = 30000;
export declare function getStateDir(): string;
export declare function getRegistryPath(): string;
export declare function createEmptyRegistry(): WorkbenchRegistry;
export declare function readRegistry(path?: string): WorkbenchRegistry;
export declare function writeRegistry(registry: WorkbenchRegistry, path?: string): void;
export declare function upsertSession(session: WorkbenchSession, path?: string): WorkbenchRegistry;
export declare function patchSession(id: string, patch: Partial<Omit<WorkbenchSession, "id" | "createdAt">>, path?: string): WorkbenchRegistry;
export declare function markSessionStopped(id: string, path?: string): WorkbenchRegistry;
export declare function removeSession(id: string, path?: string): WorkbenchRegistry;
export declare function withStaleSessions(registry: WorkbenchRegistry, now?: number, staleMs?: number): WorkbenchRegistry;
export declare function addRecentProject(projects: string[], cwd: string, limit?: number): string[];
export declare function formatSessionName(cwd: string, fallback?: string): string;
