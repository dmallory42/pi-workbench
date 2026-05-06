import { formatSessionName, readRegistry, withStaleSessions, type WorkbenchSession } from "./registry.js";
import { tmux } from "./tmux.js";

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
  pathSuggestion?: string;
}

interface DisplaySession extends WorkbenchSession {
  label: string;
}

type DisplayRow =
  | { type: "header"; label: string }
  | { type: "session"; session: DisplaySession; sessionIndex: number };

export function getDisplaySessions(tmuxSession: string): DisplaySession[] {
  const registry = withStaleSessions(readRegistry());
  const sessions = appendUnregisteredTmuxPanes(registry.sessions, tmuxSession)
    .filter((session) => session.tmuxSession === tmuxSession || isReusableExternalSession(session))
    .sort((a, b) => Number(b.status !== "stopped") - Number(a.status !== "stopped") || a.displayName.localeCompare(b.displayName));
  return withDuplicateLabels(sessions);
}

function isReusableExternalSession(session: WorkbenchSession): boolean {
  return session.status !== "stopped" && !session.managed && !session.tmuxSession;
}

function appendUnregisteredTmuxPanes(sessions: WorkbenchSession[], tmuxSession: string): WorkbenchSession[] {
  const registeredLivePaneIds = new Set(sessions.filter((session) => session.status !== "stopped").map((session) => session.tmuxPaneId).filter(Boolean));
  const now = Date.now();
  try {
    const output = tmux([
      "list-panes",
      "-a",
      "-t",
      tmuxSession,
      "-F",
      "#{session_name}\t#{window_name}\t#{pane_index}\t#{pane_id}\t#{pane_current_path}\t#{pane_title}",
    ]);
    const recovered = output
      .split("\n")
      .map((line) => parseTmuxPaneLine(line, tmuxSession, registeredLivePaneIds, now))
      .filter((session): session is WorkbenchSession => Boolean(session));
    return recovered.length ? [...sessions, ...recovered] : sessions;
  } catch {
    return sessions;
  }
}

function parseTmuxPaneLine(line: string, tmuxSession: string, registeredLivePaneIds: Set<string | undefined>, now: number): WorkbenchSession | undefined {
  const [sessionName, windowName, paneIndex, paneId, cwd, title] = line.split("\t");
  if (sessionName !== tmuxSession || !paneId || !cwd || registeredLivePaneIds.has(paneId)) return undefined;
  if (windowName === "workbench" && paneIndex === "0") return undefined;
  if (windowName !== "workbench" && windowName !== "pi") return undefined;
  const displayName = title?.startsWith("π - ") ? title.slice(4) : formatSessionName(cwd);
  return {
    id: `tmux:${paneId}`,
    cwd,
    displayName,
    status: "ready",
    tmuxPaneId: paneId,
    tmuxSession,
    managed: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function renderSidebar(state: SidebarRenderState, sessions: DisplaySession[], width: number, height: number): string[] {
  let selected = state.selected;
  if (selected >= sessions.length) selected = Math.max(0, sessions.length - 1);
  const selectedSession = sessions[selected];
  const liveCount = sessions.filter((session) => session.status !== "stopped").length;
  const rows: string[] = [];
  rows.push(padLine(color("bold", "Pi Workbench"), width, state.sidebarFocused));
  rows.push(padLine("".padEnd(contentWidth(width), "─"), width, state.sidebarFocused));

  if (state.mode === "new") {
    const projects = state.projectChoices?.length ? state.projectChoices : [state.cwd];
    rows.push(padLine("New Pi session", width, state.sidebarFocused));
    rows.push(padLine(color("dim", "Choose a recent project:"), width, state.sidebarFocused));
    if (!state.input) {
      for (let i = 0; i < Math.min(projects.length, height - 11); i++) {
        const marker = i === state.projectPickerIndex ? color("cyan", "▸") : " ";
        const row = `${marker} ${truncatePlain(shortPath(projects[i], state.home), contentWidth(width) - 2)}`;
        rows.push(i === state.projectPickerIndex && state.sidebarFocused ? highlightLine(row, width) : padLine(row, width, state.sidebarFocused));
      }
      rows.push(padLine("", width, state.sidebarFocused));
      rows.push(padLine(color("dim", "Or type any directory path:"), width, state.sidebarFocused));
      rows.push(padLine(color("dim", "  ~/src/my-project"), width, state.sidebarFocused));
    } else {
      rows.push(padLine("", width, state.sidebarFocused));
      rows.push(padLine(color("dim", "Custom directory:"), width, state.sidebarFocused));
      rows.push(highlightPathLine(state.input, state.pathSuggestion, width));
      rows.push(padLine(color("dim", "⇥ complete · ↵ start"), width, state.sidebarFocused));
    }
    pushBlankUntil(rows, height - 4);
    rows.push(padLine(color("yellow", state.input ? "↵ start custom path" : "↵ start selected"), width, state.sidebarFocused));
    rows.push(padLine(color("dim", state.input ? "⇥ accept · ⌫ edit" : "↑↓ choose recent project"), width, state.sidebarFocused));
    rows.push(padLine(color("dim", "Type path · Esc cancel"), width, state.sidebarFocused));
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
    if (liveCount <= 1) rows.push(padLine("It will restart in place.", width, state.sidebarFocused));
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
        rows.push(padLine(color("dim", "ctrl+g sidebar"), width, state.sidebarFocused));
        rows.push(padLine(color("dim", ""), width, state.sidebarFocused));
      }
    } else {
      pushBlankUntil(rows, height - 3);
      rows.push(padLine(color("dim", state.sidebarFocused ? "n new" : "ctrl+g sidebar"), width, state.sidebarFocused));
      rows.push(padLine(color("dim", state.sidebarFocused ? "q quit" : ""), width, state.sidebarFocused));
    }
  }

  if (state.message && state.messageUntil > state.now) {
    const messageRow = padLine(color("yellow", truncatePlain(state.message, contentWidth(width))), width, state.sidebarFocused);
    if (rows.length >= height) rows[height - 1] = messageRow;
    else {
      pushBlankUntil(rows, height - 1);
      rows.push(messageRow);
    }
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
    rows.push({ type: "header", label: "Active Sessions" });
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
  const icon = color(statusIconColor(status), statusIcon(status));
  const available = Math.max(6, contentWidth(width) - visibleLength(marker) - visibleLength(icon) - status.length - 5);
  const row = `${marker} ${icon} ${truncatePlain(session.label, available).padEnd(available)} ${color(statusColor(status), status)}`;
  return isSelected && sidebarFocused ? highlightLine(row, width) : padLine(row, width, sidebarFocused);
}

function statusIcon(status: string): string {
  if (status === "ready") return "●";
  if (status === "running") return "⚙";
  return "○";
}

function statusIconColor(status: string): "yellow" | "blue" | "dim" {
  if (status === "ready") return "yellow";
  if (status === "running") return "blue";
  return "dim";
}

function statusColor(status: string): "green" | "yellow" | "blue" | "dim" {
  if (status === "ready") return "green";
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

function highlightPathLine(input: string, suggestion: string | undefined, width: number): string {
  const prefix = "▸ ";
  const suffix = suggestion?.startsWith(input) ? suggestion.slice(input.length) : "";
  const plain = truncatePlain(`${prefix}${input}${suffix}`, contentWidth(width));
  const visibleInput = truncatePlain(`${prefix}${input}`, contentWidth(width));
  const visibleSuffix = plain.slice(visibleInput.length);
  const padding = " ".repeat(Math.max(0, contentWidth(width) - visibleLength(plain)));
  return `\x1b[48;5;24m\x1b[97m▌ ${visibleInput}\x1b[2m${visibleSuffix}\x1b[22m${padding}\x1b[0m`;
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
