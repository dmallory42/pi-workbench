import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getDisplaySessions, renderSidebar, stripAnsiForTest, visibleLength, type SidebarRenderState } from "../src/sidebar-render.js";
import { writeRegistry, type WorkbenchSession } from "../src/registry.js";

const baseState: SidebarRenderState = {
  tmuxSession: "pi-workbench",
  sidebarWidth: 36,
  selected: 0,
  mode: "list",
  input: "",
  projectPickerIndex: 0,
  message: "",
  messageUntil: 0,
  sidebarFocused: true,
  now: 1000,
  cwd: "/Users/mal/projects/pi-workbench",
  home: "/Users/mal",
};

const sessions: WorkbenchSession[] = [
  {
    id: "one",
    cwd: "/Users/mal/projects/pi-workbench",
    displayName: "pi-workbench",
    status: "ready",
    tmuxSession: "pi-workbench",
    gitBranch: "main",
    createdAt: 1,
    updatedAt: 1000,
  },
  {
    id: "two",
    cwd: "/Users/mal/projects/pi-workbench",
    displayName: "pi-workbench",
    status: "stopped",
    tmuxSession: "pi-workbench",
    gitBranch: "main",
    createdAt: 1,
    updatedAt: 1000,
  },
];

const originalStateDir = process.env.PI_WORKBENCH_STATE_DIR;
let tempStateDir: string | undefined;

afterEach(() => {
  if (tempStateDir) rmSync(tempStateDir, { recursive: true, force: true });
  tempStateDir = undefined;
  if (originalStateDir === undefined) delete process.env.PI_WORKBENCH_STATE_DIR;
  else process.env.PI_WORKBENCH_STATE_DIR = originalStateDir;
});

function useTempRegistry() {
  tempStateDir = mkdtempSync(join(tmpdir(), "pi-workbench-sidebar-test-"));
  process.env.PI_WORKBENCH_STATE_DIR = tempStateDir;
}

describe("getDisplaySessions", () => {
  it("shows current workbench sessions and reusable external live sessions without leaking other managed workbenches", () => {
    useTempRegistry();
    writeRegistry({
      version: 1,
      recentProjects: [],
      sessions: [
        { id: "current-live", cwd: "/tmp/current", displayName: "current", status: "ready", tmuxSession: "active", createdAt: 1, updatedAt: Date.now() },
        { id: "current-stopped", cwd: "/tmp/current", displayName: "stopped", status: "stopped", tmuxSession: "active", createdAt: 1, updatedAt: Date.now() },
        {
          id: "foreign-managed-live",
          cwd: "/tmp/foreign",
          displayName: "foreign live",
          status: "ready",
          tmuxSession: "other",
          managed: true,
          createdAt: 1,
          updatedAt: Date.now(),
        },
        {
          id: "foreign-managed-stopped",
          cwd: "/tmp/foreign",
          displayName: "foreign stopped",
          status: "stopped",
          tmuxSession: "other",
          managed: true,
          createdAt: 1,
          updatedAt: Date.now(),
        },
        { id: "external-live", cwd: "/tmp/external", displayName: "external", status: "ready", createdAt: 1, updatedAt: Date.now() },
        { id: "external-stopped", cwd: "/tmp/external", displayName: "external stopped", status: "stopped", createdAt: 1, updatedAt: Date.now() },
      ],
    });

    expect(getDisplaySessions("active").map((session) => session.id)).toEqual(["current-live", "external-live", "current-stopped"]);
  });

  it("treats stale external live sessions as stopped so crashed sessions do not appear as reusable", () => {
    useTempRegistry();
    writeRegistry({
      version: 1,
      recentProjects: [],
      sessions: [{ id: "stale-external", cwd: "/tmp/external", displayName: "external", status: "ready", createdAt: 1, updatedAt: 0 }],
    });

    expect(getDisplaySessions("active")).toEqual([]);
  });
});

describe("renderSidebar", () => {
  it("renders a continuous focused gutter", () => {
    const rows = renderSidebar(baseState, sessions.map((s, i) => ({ ...s, label: `pi-workbench #${i + 1}` })), 36, 20);
    expect(rows).toHaveLength(20);
    expect(stripAnsiForTest(rows[0])).toContain("Pi Workbench");
    expect(stripAnsiForTest(rows[0])).not.toContain("live");
    for (const row of rows) {
      expect(stripAnsiForTest(row).startsWith("▌")).toBe(true);
      expect(visibleLength(row)).toBe(36);
    }
    expect(rows.join("\n")).toContain("48;5;24");
  });

  it("renders unfocused sidebar with dim selected marker and ctrl+g hint", () => {
    const rows = renderSidebar({ ...baseState, sidebarFocused: false }, sessions.map((s, i) => ({ ...s, label: `pi-workbench #${i + 1}` })), 36, 20);
    const plain = rows.map(stripAnsiForTest).join("\n");
    expect(plain).toContain("› ● pi-workbench #1");
    expect(plain).toContain("ready");
    expect(plain).toContain("ctrl+g sidebar");
    for (const row of rows) {
      expect(stripAnsiForTest(row).startsWith("  ")).toBe(true);
    }
  });

  it("renders active sessions with ready status", () => {
    const rows = renderSidebar({ ...baseState, sidebarFocused: false }, sessions.map((s, i) => ({ ...s, label: `pi-workbench #${i + 1}` })), 36, 20);
    const plain = rows.map(stripAnsiForTest).join("\n");
    expect(plain).toContain("Active Sessions");
    expect(plain).toContain("● pi-workbench #1");
    expect(plain).toContain("ready");
    expect(plain).not.toContain("Running");
  });

  it("colors status icons so ready sessions stand out as needing input", () => {
    const statusSessions: WorkbenchSession[] = [
      { ...sessions[0], id: "ready", displayName: "ready session", status: "ready" },
      { ...sessions[0], id: "running", displayName: "running session", status: "running" },
      { ...sessions[1], id: "stopped", displayName: "stopped session", status: "stopped" },
    ];

    const rows = renderSidebar({ ...baseState, sidebarFocused: false }, statusSessions.map((session) => ({ ...session, label: session.displayName })), 44, 20).join("\n");

    expect(rows).toContain("\x1b[33m●\x1b[0m ready session");
    expect(rows).toContain("\x1b[34m⚙\x1b[0m running session");
    expect(rows).toContain("\x1b[2m○\x1b[0m stopped session");
  });

  it("anchors project and branch near the bottom", () => {
    const rows = renderSidebar(baseState, sessions.map((s, i) => ({ ...s, label: `pi-workbench #${i + 1}` })), 36, 20).map(stripAnsiForTest);
    expect(rows[13]).toContain("────────────────");
    expect(rows[14]).toContain("~/projects/pi-workbench");
    expect(rows[15]).toContain("⎇ main");
  });

  it("renders quit confirmation as a full-height pane", () => {
    const rows = renderSidebar({ ...baseState, mode: "quit" }, sessions.map((s, i) => ({ ...s, label: `pi-workbench #${i + 1}` })), 36, 20);
    expect(rows).toHaveLength(20);
    expect(rows.map(stripAnsiForTest).join("\n")).toContain("Quit Pi Workbench?");
    for (const row of rows) expect(stripAnsiForTest(row).startsWith("▌ ")).toBe(true);
  });

  it("renders new-session picker as a full-height pane", () => {
    const rows = renderSidebar(
      { ...baseState, mode: "new", projectChoices: ["/Users/mal/projects/pi-workbench", "/Users/mal/projects/other"] },
      sessions.map((s, i) => ({ ...s, label: `pi-workbench #${i + 1}` })),
      36,
      20,
    );
    const plain = rows.map(stripAnsiForTest).join("\n");
    expect(rows).toHaveLength(20);
    expect(plain).toContain("New Pi session");
    expect(plain).toContain("Choose a recent project:");
    expect(plain).toContain("▸ ~/projects/pi-workbench");
    expect(rows.join("\n")).toContain("48;5;24");
    expect(plain).toContain("Or type any directory path:");
    expect(plain).toContain("~/src/my-project");
    expect(plain).toContain("↵ start selected");
    expect(plain).toContain("Type path · Esc cancel");
  });

  it("renders typed custom path clearly in new-session mode", () => {
    const rows = renderSidebar(
      { ...baseState, mode: "new", input: "~/tmp/new", pathSuggestion: "~/tmp/new-app/", projectChoices: ["/Users/mal/projects/pi-workbench"] },
      sessions.map((s, i) => ({ ...s, label: `pi-workbench #${i + 1}` })),
      36,
      20,
    );
    const plain = rows.map(stripAnsiForTest).join("\n");
    expect(plain).toContain("Custom directory:");
    expect(plain).toContain("▸ ~/tmp/new-app/");
    expect(rows.join("\n")).toContain("48;5;24");
    expect(rows.join("\n")).toContain("\u001b[2m-app/");
    expect(plain).toContain("⇥ complete · ↵ start");
    expect(plain).toContain("↵ start custom path");
    expect(plain).toContain("⇥ accept · ⌫ edit");
  });

  it("keeps transient messages visible even when the pane is already full", () => {
    const rows = renderSidebar(
      { ...baseState, mode: "new", input: "missing", message: "No matching directory", messageUntil: 2000 },
      sessions.map((s, i) => ({ ...s, label: `pi-workbench #${i + 1}` })),
      36,
      12,
    );
    expect(rows).toHaveLength(12);
    expect(rows.map(stripAnsiForTest).join("\n")).toContain("No matching directory");
  });

  it("renders kill confirmation as a full-height pane", () => {
    const rows = renderSidebar(
      { ...baseState, mode: "kill", killTargetId: "one" },
      sessions.map((s, i) => ({ ...s, label: `pi-workbench #${i + 1}` })),
      36,
      20,
    );
    const plain = rows.map(stripAnsiForTest).join("\n");
    expect(rows).toHaveLength(20);
    expect(plain).toContain("Kill session?");
    expect(plain).toContain("pi-workbench #1");
    expect(plain).toContain("y confirm");
  });

  it("renders rename mode as a full-height pane", () => {
    const rows = renderSidebar(
      { ...baseState, mode: "rename", input: "review docs" },
      sessions.map((s, i) => ({ ...s, label: `pi-workbench #${i + 1}` })),
      36,
      20,
    );
    const plain = rows.map(stripAnsiForTest).join("\n");
    expect(rows).toHaveLength(20);
    expect(plain).toContain("Rename session");
    expect(plain).toContain("review docs");
    expect(plain).toContain("Enter save");
  });
});
