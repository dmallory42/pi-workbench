export const SIDEBAR_TICK_MS = 500;
export const FOCUS_POLL_MS = 600;
export const RESIZE_RETRY_MS = 2000;
export const UNFOCUSED_REFRESH_MS = 2000;

export interface SidebarLoopTiming {
  lastFocusPollAt: number;
  lastResizeAttemptAt: number;
  lastUnfocusedRefreshAt: number;
}

export function shouldPollFocus(now: number, timing: Pick<SidebarLoopTiming, "lastFocusPollAt">): boolean {
  return now - timing.lastFocusPollAt >= FOCUS_POLL_MS;
}

export function shouldAttemptSidebarResize(
  now: number,
  observedWidth: number | undefined,
  desiredWidth: number,
  timing: Pick<SidebarLoopTiming, "lastResizeAttemptAt">,
): boolean {
  if (observedWidth === desiredWidth) return false;
  return timing.lastResizeAttemptAt === 0 || now - timing.lastResizeAttemptAt >= RESIZE_RETRY_MS;
}

export function shouldRefreshSidebar(
  now: number,
  sidebarFocused: boolean,
  interactiveMode: boolean,
  messageActive: boolean,
  focusChanged: boolean,
  timing: Pick<SidebarLoopTiming, "lastUnfocusedRefreshAt">,
): boolean {
  if (focusChanged || sidebarFocused || interactiveMode || messageActive) return true;
  return timing.lastUnfocusedRefreshAt === 0 || now - timing.lastUnfocusedRefreshAt >= UNFOCUSED_REFRESH_MS;
}
