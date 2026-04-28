import { beforeEach, describe, expect, it, vi } from "vitest";

const registryMock = vi.fn(() => ({ sessions: [], recentProjects: [] }));
const tmuxMock = vi.fn((args: string[]) => {
  if (args[0] === "list-panes" && args[2] === "real-workbench:workbench") return "%realLeft\n%envRight";
  if (args[0] === "list-panes" && args[2] === "smoke-workbench:workbench") return "%left\n%old";
  if (args[0] === "list-panes") return "%left\n%right";
  if (args[0] === "display-message" && args[3]?.startsWith("%")) return args[3];
  return "";
});

vi.mock("../src/tmux.js", () => ({
  hasSession: vi.fn(() => true),
  quoteShell: (value: string) => `'${value.replaceAll("'", `'\\''`)}'`,
  tmux: tmuxMock,
}));

vi.mock("../src/config.js", () => ({
  getSidebarWidth: vi.fn(() => 36),
  readConfig: vi.fn(() => ({ hideTmuxStatus: false, mouse: true, sidebarWidth: 36 })),
}));

vi.mock("../src/registry.js", () => ({
  readRegistry: registryMock,
}));

const { ensureWorkbench } = await import("../src/workbench.js");

describe("ensureWorkbench", () => {
  beforeEach(() => {
    tmuxMock.mockClear();
    registryMock.mockReset();
    registryMock.mockReturnValue({ sessions: [], recentProjects: [] });
    delete process.env.PI_WORKBENCH_TMUX_SESSION;
  });

  it("refreshes the sidebar process and status configuration when attaching to an existing session", () => {
    ensureWorkbench("pi-workbench", { sidebarCommand: "node new-sidebar.js" });

    expect(tmuxMock).toHaveBeenCalledWith(["respawn-pane", "-k", "-t", "%left", "node new-sidebar.js"]);
    expect(tmuxMock).toHaveBeenCalledWith(["set-option", "-t", "pi-workbench", "status-left", " pi-workbench "]);
    expect(tmuxMock).toHaveBeenCalledWith(["set-option", "-t", "pi-workbench", "status-right", " ctrl+g sidebar · q quit "]);
  });

  it("chooses the newest reusable session for the requested workbench instead of the caller environment", () => {
    process.env.PI_WORKBENCH_TMUX_SESSION = "real-workbench";
    registryMock.mockReturnValue({
      recentProjects: [],
      sessions: [
        { id: "old", cwd: process.cwd(), status: "idle", tmuxPaneId: "%old", updatedAt: 1 },
        { id: "new", cwd: process.cwd(), status: "idle", tmuxPaneId: "%new", updatedAt: 2 },
      ],
    });

    ensureWorkbench("smoke-workbench", { sidebarCommand: "node new-sidebar.js" });

    expect(tmuxMock).toHaveBeenCalledWith(["swap-pane", "-s", "%new", "-t", "%old"]);
  });
});
