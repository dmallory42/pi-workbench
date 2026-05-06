import { beforeEach, describe, expect, it, vi } from "vitest";

const registryMock = vi.fn();
const tmuxMock = vi.fn();

vi.mock("../src/registry.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/registry.js")>();
  return {
    ...actual,
    readRegistry: registryMock,
  };
});

vi.mock("../src/tmux.js", () => ({
  tmux: tmuxMock,
}));

const { getDisplaySessions } = await import("../src/sidebar-render.js");

describe("getDisplaySessions", () => {
  beforeEach(() => {
    registryMock.mockReset();
    tmuxMock.mockReset();
    registryMock.mockReturnValue({ version: 1, recentProjects: [], sessions: [] });
  });

  it("recovers live tmux Pi panes that are missing from the registry", () => {
    tmuxMock.mockReturnValue([
      "pi-workbench\tworkbench\t0\t%left\t/Users/mal/projects/pi-workbench\tTerminal",
      "pi-workbench\tworkbench\t1\t%right\t/Users/mal/projects/pi-workbench\tπ - pi-workbench",
      "pi-workbench\tpi\t0\t%hidden\t/Users/mal/projects/wcpay\tπ - wcpay",
    ].join("\n"));

    const sessions = getDisplaySessions("pi-workbench");

    expect(sessions.map((session) => ({ id: session.id, pane: session.tmuxPaneId, name: session.displayName, status: session.status }))).toEqual([
      { id: "tmux:%right", pane: "%right", name: "pi-workbench", status: "ready" },
      { id: "tmux:%hidden", pane: "%hidden", name: "wcpay", status: "ready" },
    ]);
  });
});
