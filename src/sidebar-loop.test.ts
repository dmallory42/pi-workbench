import { describe, expect, it } from "vitest";
import { FOCUS_POLL_MS, RESIZE_RETRY_MS, UNFOCUSED_REFRESH_MS, shouldAttemptSidebarResize, shouldPollFocus, shouldRefreshSidebar } from "./sidebar-loop.js";

describe("sidebar loop throttling", () => {
  it("does not resize tmux when the sidebar is already the desired width", () => {
    expect(shouldAttemptSidebarResize(10_000, 36, 36, { lastResizeAttemptAt: 0 })).toBe(false);
  });

  it("throttles repeated resize attempts while waiting for tmux geometry to settle", () => {
    expect(shouldAttemptSidebarResize(10_000, 35, 36, { lastResizeAttemptAt: 0 })).toBe(true);
    expect(shouldAttemptSidebarResize(10_500, 35, 36, { lastResizeAttemptAt: 10_000 })).toBe(false);
    expect(shouldAttemptSidebarResize(10_000 + RESIZE_RETRY_MS, 35, 36, { lastResizeAttemptAt: 10_000 })).toBe(true);
  });

  it("polls focus less frequently than the render tick", () => {
    expect(shouldPollFocus(10_000, { lastFocusPollAt: 10_000 - FOCUS_POLL_MS + 1 })).toBe(false);
    expect(shouldPollFocus(10_000, { lastFocusPollAt: 10_000 - FOCUS_POLL_MS })).toBe(true);
  });

  it("keeps the unfocused sidebar idle between slower refreshes", () => {
    expect(shouldRefreshSidebar(10_000, false, false, false, false, { lastUnfocusedRefreshAt: 10_000 - UNFOCUSED_REFRESH_MS + 1 })).toBe(false);
    expect(shouldRefreshSidebar(10_000, false, false, false, false, { lastUnfocusedRefreshAt: 10_000 - UNFOCUSED_REFRESH_MS })).toBe(true);
  });

  it("refreshes immediately for visible state changes and interactive modes", () => {
    expect(shouldRefreshSidebar(10_000, false, false, false, true, { lastUnfocusedRefreshAt: 10_000 })).toBe(true);
    expect(shouldRefreshSidebar(10_000, true, false, false, false, { lastUnfocusedRefreshAt: 10_000 })).toBe(true);
    expect(shouldRefreshSidebar(10_000, false, true, false, false, { lastUnfocusedRefreshAt: 10_000 })).toBe(true);
    expect(shouldRefreshSidebar(10_000, false, false, true, false, { lastUnfocusedRefreshAt: 10_000 })).toBe(true);
  });
});
