import { readRegistry, withStaleSessions, type WorkbenchSession } from "./registry.js";

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
}

interface DisplaySession extends WorkbenchSession {
  label: string;
}

type DisplayRow =
  | { type: "header"; label: string }
  | { type: "session"; session: DisplaySession; sessionIndex: number };

export function getDisplaySessions(tmuxSession: string): DisplaySession[] {
  const registry = withStaleSessions(readRegistry());
  const sessions = registry.sessions
    .filter((session) => session.tmuxSession === tmuxSession || session.managed)
    .sort((a, b) => Number(b.status !== "stopped") - Number(a.status !== "stopped") || a.displayName.localeCompare(b.displayName));
  return withDuplicateLabels(sessions);
}

export function renderSidebar(state: SidebarRenderState, sessions: DisplaySession[], width: number, height: number): string[] {
  let selected = state.selected;
  if (selected >= sessions.length) selected = Math.max(0, sessions.length - 1);
  const selectedSession = sessions[selected];
  const liveCount = sessions.filter((session) => session.status !== "stopped").length;
  const stoppedCount = sessions.length - liveCount;
  const rows: string[] = [];
  const title = `Pi Workbench ${liveCount} live${stoppedCount ? ` · ${stoppedCount} stopped` : ""}`;
  rows.push(padLine(color("bold", truncatePlain(title, contentWidth(width))), width, state.sidebarFocused));
  rows.push(padLine("".padEnd(contentWidth(width), "─"), width, state.sidebarFocused));

  if (state.mode === "new") {
    const projects = state.projectChoices?.length ? state.projectChoices : [state.cwd];
    rows.push(padLine("New session", width, state.sidebarFocused));
    if (state.input) {
      rows.push(padLine(color("cyan", truncatePlain(state.input, contentWidth(width))), width, state.sidebarFocused));
    } else {
      for (let i = 0; i < Math.min(projects.length, height - 6); i++) {
        const marker = i === state.projectPickerIndex ? color("cyan", "▸") : " ";
        rows.push(padLine(`${marker} ${truncatePlain(shortPath(projects[i], state.home), contentWidth(width) - 2)}`, width, state.sidebarFocused));
      }
    }
    pushBlankUntil(rows, height - 3);
    rows.push(padLine(color("dim", "↑↓ choose  / type"), width, state.sidebarFocused));
    rows.push(padLine(color("dim", "Enter start · Esc cancel"), width, state.sidebarFocused));
  } else if (state.mode === "quit") {
    rows.push(padLine(color("yellow", "Quit Pi Workbench?"), width, state.sidebarFocused));
    rows.push(padLine(`Stops ${liveCount} running Pi session${liveCount === 1 ? "" : "s"}.`, width, state.sidebarFocused));
    rows.push(padLine("Histories remain resumable.", width, state.sidebarFocused));
    pushBlankUntil(rows, height - 3);
    rows.push(padLine(color("dim", "y confirm"), width, state.sidebarFocused));
    rows.push(padLine(color("dim", "n/Esc cancel"), width, state.sidebarFocused));
  } else if (state.mode === "kill") {
    const target = sessions.find((session) => session.id === state.killTargetId);
    rows.push(padLine(color("yellow", "Kill session?"), width, state.sidebarFocused));
    rows.push(padLine(truncatePlain(target?.label ?? "Selected session", contentWidth(width)), width, state.sidebarFocused));
    rows.push(padLine("Stops this Pi process.", width, state.sidebarFocused));
    rows.push(padLine("History remains resumable.", width, state.sidebarFocused));
    if (liveCount <= 1) rows.push(padLine("A replacement will start.", width, state.sidebarFocused));
    pushBlankUntil(rows, height - 3);
    rows.push(padLine(color("dim", "y confirm"), width, state.sidebarFocused));
    rows.push(padLine(color("dim", "n/Esc cancel"), width, state.sidebarFocused));
  } else if (state.mode === "rename") {
    rows.push(padLine("Rename session", width, state.sidebarFocused));
    rows.push(padLine(color("cyan", truncatePlain(state.input, contentWidth(width))), width, state.sidebarFocused));
    pushBlankUntil(rows, height - 3);
    rows.push(padLine(color("dim", "Enter save"), width, state.sidebarFocused));
    rows.push(padLine(color("dim", "Esc cancel"), width, state.sidebarFocused));
  } else if (state.mode === "list") {
    if (sessions.length === 0) rows.push(padLine(color("dim", "No Pi sessions yet."), width, state.sidebarFocused));
    const reservedRows = selectedSession ? 8 : 4;
    const maxListRows = Math.max(3, height - reservedRows);
    for (const row of getRows(sessions).slice(0, maxListRows)) {
      if (row.type === "header") {
        rows.push(row.label ? padLine(color("dim", row.label), width, state.sidebarFocused) : "");
      } else {
        rows.push(renderSessionRow(row.session, row.sessionIndex === selected, width, state.sidebarFocused));
      }
    }

    if (selectedSession) {
      pushBlankUntil(rows, height - 7);
      rows.push(padLine("".padEnd(contentWidth(width), "─"), width, state.sidebarFocused));
      rows.push(padLine(color("cyan", truncatePlain(shortPath(selectedSession.cwd, state.home), contentWidth(width))), width, state.sidebarFocused));
      rows.push(
        padLine(
          color("blue", selectedSession.gitBranch ? `⎇ ${selectedSession.gitBranch}${selectedSession.gitDirty ? "*" : ""}` : "⎇ —"),
          width,
          state.sidebarFocused,
        ),
      );
      rows.push("");
      if (selectedSession.status === "stopped") rows.push(padLine(color("yellow", "↵ reopen   x remove"), width, state.sidebarFocused));
      else rows.push(padLine(color("yellow", "↵ switch   k kill"), width, state.sidebarFocused));
      if (state.sidebarFocused) {
        rows.push(padLine(color("dim", "n new      r rename"), width, state.sidebarFocused));
        rows.push(padLine(color("dim", "q quit"), width, state.sidebarFocused));
      } else {
        rows.push(padLine(color("dim", "F1 sidebar"), width, state.sidebarFocused));
        rows.push(padLine(color("dim", ""), width, state.sidebarFocused));
      }
    } else {
      pushBlankUntil(rows, height - 3);
      rows.push(padLine(color("dim", state.sidebarFocused ? "n new" : "F1 sidebar"), width, state.sidebarFocused));
      rows.push(padLine(color("dim", state.sidebarFocused ? "q quit" : ""), width, state.sidebarFocused));
    }
  }

  if (state.message && state.messageUntil > state.now) {
    rows.push("");
    rows.push(padLine(color("yellow", truncatePlain(state.message, contentWidth(width))), width, state.sidebarFocused));
  }

  pushBlankUntil(rows, height);
  return rows.slice(0, height).map((row) => padAnsi(row === "" ? padLine("", width, state.sidebarFocused) : row, width));
}

function withDuplicateLabels(sessions: WorkbenchSession[]): DisplaySession[] {
  const totals = new Map<string, number>();
  for (const session of sessions) totals.set(session.displayName, (totals.get(session.displayName) ?? 0) + 1);
  const seen = new Map<string, number>();
  return sessions.map((session) => {
    const count = (seen.get(session.displayName) ?? 0) + 1;
    seen.set(session.displayName, count);
    const base = session.customName || session.displayName;
    const label = (totals.get(session.displayName) ?? 0) > 1 && !session.customName ? `${base} #${count}` : base;
    return { ...session, label };
  });
}

function getRows(sessions: DisplaySession[]): DisplayRow[] {
  const rows: DisplayRow[] = [];
  const live = sessions.filter((session) => session.status !== "stopped");
  const stopped = sessions.filter((session) => session.status === "stopped");
  if (live.length > 0) {
    rows.push({ type: "header", label: "Running" });
    for (const session of live) rows.push({ type: "session", session, sessionIndex: sessions.indexOf(session) });
  }
  if (stopped.length > 0) {
    if (rows.length > 0) rows.push({ type: "header", label: "" });
    rows.push({ type: "header", label: "Stopped" });
    for (const session of stopped) rows.push({ type: "session", session, sessionIndex: sessions.indexOf(session) });
  }
  return rows;
}

function renderSessionRow(session: DisplaySession, isSelected: boolean, width: number, sidebarFocused: boolean): string {
  const marker = isSelected && sidebarFocused ? color("cyan", "▸") : isSelected ? color("dim", "›") : " ";
  const status = session.status;
  const icon = statusIcon(status);
  const available = Math.max(6, contentWidth(width) - visibleLength(marker) - icon.length - status.length - 5);
  const row = `${marker} ${icon} ${truncatePlain(session.label, available).padEnd(available)} ${color(statusColor(status), status)}`;
  return isSelected && sidebarFocused ? highlightLine(row, width) : padLine(row, width, sidebarFocused);
}

function statusIcon(status: string): string {
  if (status === "idle") return "●";
  if (status === "thinking") return "◐";
  if (status === "running") return "⚙";
  return "○";
}

function statusColor(status: string): "green" | "yellow" | "blue" | "dim" {
  if (status === "idle") return "green";
  if (status === "thinking") return "yellow";
  if (status === "running") return "blue";
  return "dim";
}

function color(name: "bold" | "dim" | "cyan" | "green" | "yellow" | "blue" | "selected", text: string): string {
  const codes = { bold: 1, dim: 2, cyan: 36, green: 32, yellow: 33, blue: 34, selected: "48;5;238" };
  return `\x1b[${codes[name]}m${text}\x1b[0m`;
}

function shortPath(path: string, home = process.env.HOME): string {
  return home && path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

function contentWidth(width: number): number {
  return Math.max(1, width - 2);
}

function padLine(text: string, width: number, sidebarFocused: boolean): string {
  const gutter = sidebarFocused ? color("cyan", "▌") : " ";
  return `${gutter} ${truncateAnsi(text, contentWidth(width))}`;
}

function highlightLine(text: string, width: number): string {
  const plain = truncatePlain(stripAnsi(text), contentWidth(width));
  const padded = plain + " ".repeat(Math.max(0, contentWidth(width) - visibleLength(plain)));
  return `\x1b[48;5;24m\x1b[97m▌ ${padded}\x1b[0m`;
}

function pushBlankUntil(rows: string[], targetLength: number) {
  while (rows.length < targetLength) rows.push("");
}

function truncatePlain(text: string, length: number): string {
  if (text.length <= length) return text;
  return `${text.slice(0, Math.max(0, length - 1))}…`;
}

function truncateAnsi(text: string, width: number): string {
  if (visibleLength(text) <= width) return text;
  return `${stripAnsi(text).slice(0, Math.max(0, width - 1))}…`;
}

function padAnsi(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - visibleLength(text)));
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

export function visibleLength(text: string): number {
  return stripAnsi(text).length;
}

export function stripAnsiForTest(text: string): string {
  return stripAnsi(text);
}
