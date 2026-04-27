export declare const SIDEBAR_TICK_MS = 500;
export declare const FOCUS_POLL_MS = 600;
export declare const RESIZE_RETRY_MS = 2000;
export declare const UNFOCUSED_REFRESH_MS = 2000;
export interface SidebarLoopTiming {
    lastFocusPollAt: number;
    lastResizeAttemptAt: number;
    lastUnfocusedRefreshAt: number;
}
export declare function shouldPollFocus(now: number, timing: Pick<SidebarLoopTiming, "lastFocusPollAt">): boolean;
export declare function shouldAttemptSidebarResize(now: number, observedWidth: number | undefined, desiredWidth: number, timing: Pick<SidebarLoopTiming, "lastResizeAttemptAt">): boolean;
export declare function shouldRefreshSidebar(now: number, sidebarFocused: boolean, interactiveMode: boolean, messageActive: boolean, focusChanged: boolean, timing: Pick<SidebarLoopTiming, "lastUnfocusedRefreshAt">): boolean;
