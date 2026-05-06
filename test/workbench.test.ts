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

const { buildPiCommand, buildSidebarCommand, ensureWorkbench } = await import("../src/workbench.js");

describe("buildPiCommand", () => {
  beforeEach(() => {
    delete process.env.PI_WORKBENCH_STATE_DIR;
    delete process.env.PI_WORKBENCH_PI_COMMAND;
  });

  it("explicitly loads the workbench extension for managed default Pi sessions", () => {
    expect(buildPiCommand("pi-workbench", "session-id")).toContain("pi -e '");
    expect(buildPiCommand("pi-workbench", "session-id")).toContain("/extension.js'");
  });

  it("leaves custom Pi commands unchanged", () => {
    expect(buildPiCommand("pi-workbench", "session-id", "node fake-pi.js")).toBe(
      "PI_WORKBENCH_TMUX_SESSION='pi-workbench' PI_WORKBENCH_MANAGED=1 PI_WORKBENCH_SESSION_ID='session-id' node fake-pi.js",
    );
  });

  it("passes the selected Pi command into the sidebar for sessions started from the picker", () => {
    expect(buildSidebarCommand("pi-workbench", "node fake-pi.js")).toBe(
      "PI_WORKBENCH_TMUX_SESSION='pi-workbench' PI_WORKBENCH_PI_COMMAND='node fake-pi.js' node '/Users/mal/projects/pi-workbench/src/sidebar.js'",
    );
  });
});

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

  it("disables tmux focus events so background sidebar refreshes do not send focus escapes to Pi", () => {
    ensureWorkbench("pi-workbench", { sidebarCommand: "node new-sidebar.js" });

    expect(tmuxMock).toHaveBeenCalledWith(["set-option", "-t", "pi-workbench", "focus-events", "off"]);
    expect(tmuxMock).not.toHaveBeenCalledWith(["set-option", "-t", "pi-workbench", "focus-events", "on"]);
  });

  it("chooses the newest reusable session for the requested workbench instead of the caller environment", () => {
    process.env.PI_WORKBENCH_TMUX_SESSION = "real-workbench";
    registryMock.mockReturnValue({
      recentProjects: [],
      sessions: [
        { id: "old", cwd: process.cwd(), status: "ready", tmuxPaneId: "%old", updatedAt: 1 },
        { id: "new", cwd: process.cwd(), status: "ready", tmuxPaneId: "%new", updatedAt: 2 },
      ],
    });

    ensureWorkbench("smoke-workbench", { sidebarCommand: "node new-sidebar.js" });

    expect(tmuxMock).toHaveBeenCalledWith(["swap-pane", "-s", "%new", "-t", "%old"]);
  });
});
