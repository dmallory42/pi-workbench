import { describe, expect, it } from "vitest";
import { renderSidebar, stripAnsiForTest, visibleLength, type SidebarRenderState } from "../src/sidebar-render.js";
import type { WorkbenchSession } from "../src/registry.js";

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
    status: "idle",
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
    expect(plain).toContain("ctrl+g sidebar");
    for (const row of rows) {
      expect(stripAnsiForTest(row).startsWith("  ")).toBe(true);
    }
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
