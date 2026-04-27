export const SIDEBAR_TICK_MS = 500;
export const FOCUS_POLL_MS = 600;
export const RESIZE_RETRY_MS = 2000;
export const UNFOCUSED_REFRESH_MS = 2000;
export function shouldPollFocus(now, timing) {
    return now - timing.lastFocusPollAt >= FOCUS_POLL_MS;
}
export function shouldAttemptSidebarResize(now, observedWidth, desiredWidth, timing) {
    if (observedWidth === desiredWidth)
        return false;
    return timing.lastResizeAttemptAt === 0 || now - timing.lastResizeAttemptAt >= RESIZE_RETRY_MS;
}
export function shouldRefreshSidebar(now, sidebarFocused, interactiveMode, messageActive, focusChanged, timing) {
    if (focusChanged || sidebarFocused || interactiveMode || messageActive)
        return true;
    return timing.lastUnfocusedRefreshAt === 0 || now - timing.lastUnfocusedRefreshAt >= UNFOCUSED_REFRESH_MS;
}
//# sourceMappingURL=sidebar-loop.js.map