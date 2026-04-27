import { type WorkbenchSession } from "./registry.js";
export interface SidebarRenderState {
    tmuxSession: string;
    sidebarWidth: number;
    selected: number;
    mode: "list" | "new" | "quit" | "kill" | "rename";
    input: string;
    projectPickerIndex: number;
    message: string;
    messageUntil: number;
    killTargetId?: string;
    sidebarFocused: boolean;
    now: number;
    cwd: string;
    home?: string;
    projectChoices?: string[];
    pathSuggestion?: string;
}
interface DisplaySession extends WorkbenchSession {
    label: string;
}
export declare function getDisplaySessions(tmuxSession: string): DisplaySession[];
export declare function renderSidebar(state: SidebarRenderState, sessions: DisplaySession[], width: number, height: number): string[];
export declare function visibleLength(text: string): number;
export declare function stripAnsiForTest(text: string): string;
export {};
