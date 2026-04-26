#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { getSidebarWidth } from "./config.js";
import { patchSession, readRegistry, removeSession, renameSession, withStaleSessions, type WorkbenchSession } from "./registry.js";
import { quoteShell, tmux } from "./tmux.js";

const TMUX_SESSION = process.env.PI_WORKBENCH_TMUX_SESSION || "pi-workbench";
const SIDEBAR_WIDTH = getSidebarWidth();
let selected = 0;
let mode: "list" | "new" | "quit" | "kill" | "rename" = "list";
let input = "";
let projectPickerIndex = 0;
let message = "";
let killTargetId: string | undefined;
let messageUntil = 0;

interface DisplaySession extends WorkbenchSession {
  label: string;
}

type DisplayRow =
  | { type: "header"; label: string }
  | { type: "session"; session: DisplaySession; sessionIndex: number };

process.stdin.setRawMode?.(true);
process.stdin.resume();
process.stdin.setEncoding("utf8");
process.stdout.write("\x1b[?25l\x1b[?1000h");

const interval = setInterval(() => {
  enforceSidebarWidth();
  render();
}, 1000);
process.stdin.on("data", onInput);
process.on("exit", () => {
  clearInterval(interval);
  process.stdout.write("\x1b[?25h\x1b[?1000l\x1b[0m\x1b[2J\x1b[H");
});
process.on("SIGINT", () => process.exit(0));

enforceSidebarWidth();
render();

function getSessions(): DisplaySession[] {
  const registry = withStaleSessions(readRegistry());
  const sessions = registry.sessions
    .filter((session) => session.tmuxSession === TMUX_SESSION || session.managed)
    .sort((a, b) => Number(b.status !== "stopped") - Number(a.status !== "stopped") || a.displayName.localeCompare(b.displayName));
  return withDuplicateLabels(sessions);
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

function render() {
  enforceSidebarWidth();
  clearExpiredMessage();
  const sessions = getSessions();
  if (selected >= sessions.length) selected = Math.max(0, sessions.length - 1);
  const selectedSession = sessions[selected];
  const liveCount = sessions.filter((session) => session.status !== "stopped").length;
  const stoppedCount = sessions.length - liveCount;
  const width = process.stdout.columns || SIDEBAR_WIDTH;
  const height = process.stdout.rows || 24;
  const rows: string[] = [];
  const title = `Pi Workbench ${liveCount} live${stoppedCount ? ` · ${stoppedCount} stopped` : ""}`;
  rows.push(color("bold", truncatePlain(title, width)));
  rows.push("".padEnd(width, "─"));

  if (mode === "new") {
    const projects = getProjectChoices();
    rows.push("New session");
    if (input) {
      rows.push(color("cyan", truncatePlain(input, width)));
    } else {
      for (let i = 0; i < Math.min(projects.length, height - 6); i++) {
        const marker = i === projectPickerIndex ? "▶" : " ";
        rows.push(`${marker} ${truncatePlain(projects[i], width - 2)}`);
      }
    }
    rows.push("");
    rows.push(color("dim", "↑↓ choose  / type"));
    rows.push(color("dim", "Enter start · Esc cancel"));
  } else if (mode === "quit") {
    rows.push(color("yellow", "Quit Pi Workbench?"));
    rows.push(`Stops ${liveCount} running Pi session${liveCount === 1 ? "" : "s"}.`);
    rows.push("Histories remain resumable.");
    rows.push("");
    rows.push(color("dim", "y confirm"));
    rows.push(color("dim", "n/Esc cancel"));
  } else if (mode === "kill") {
    const target = sessions.find((session) => session.id === killTargetId);
    rows.push(color("yellow", "Kill session?"));
    rows.push(truncatePlain(target?.label ?? "Selected session", width));
    rows.push("");
    rows.push("Stops this Pi process.");
    rows.push("History remains resumable.");
    if (liveCount <= 1) rows.push("A replacement will start.");
    rows.push("");
    rows.push(color("dim", "y confirm"));
    rows.push(color("dim", "n/Esc cancel"));
  } else if (mode === "rename") {
    rows.push("Rename session");
    rows.push(color("cyan", truncatePlain(input, width)));
    rows.push("");
    rows.push(color("dim", "Enter save"));
    rows.push(color("dim", "Esc cancel"));
  } else {
    if (sessions.length === 0) rows.push(color("dim", "No Pi sessions yet."));
    const maxListRows = Math.max(3, height - 8);
    for (const row of getRows(sessions).slice(0, maxListRows)) {
      if (row.type === "header") {
        rows.push(row.label ? color("dim", row.label) : "");
      } else {
        rows.push(renderSessionRow(row.session, row.sessionIndex === selected, width));
      }
    }

    rows.push("".padEnd(width, "─"));
    if (selectedSession) {
      rows.push(color("dim", truncatePlain(selectedSession.cwd, width)));
      rows.push(color("dim", selectedSession.gitBranch ? `git ${selectedSession.gitBranch}${selectedSession.gitDirty ? "*" : ""}` : "git —"));
      if (selectedSession.status === "stopped") rows.push(color("dim", "Stopped. ↵ reopen · x remove"));
      else rows.push(color("dim", "↵ switch · k kill"));
    }
    rows.push(color("dim", "↑↓ move  n new  r rename"));
    rows.push(color("dim", "q quit   F1 focus"));
  }

  if (message) {
    rows.push("");
    rows.push(color("yellow", truncatePlain(message, width)));
  }

  process.stdout.write("\x1b[H\x1b[2J");
  process.stdout.write(rows.slice(0, height).map((row) => padAnsi(row, width)).join("\n"));
}

function renderSessionRow(session: DisplaySession, isSelected: boolean, width: number): string {
  const marker = isSelected ? "▶" : " ";
  const status = session.status;
  const icon = statusIcon(status);
  const available = Math.max(6, width - marker.length - icon.length - status.length - 5);
  const plain = `${marker} ${icon} ${truncatePlain(session.label, available).padEnd(available)} ${status}`;
  const styled = `${marker} ${icon} ${truncatePlain(session.label, available).padEnd(available)} ${color(statusColor(status), status)}`;
  return isSelected ? inverse(styled, plain) : styled;
}

function onInput(chunk: string) {
  if (mode === "new") return onNewInput(chunk);
  if (mode === "rename") return onRenameInput(chunk);
  if (mode === "quit") return onQuitInput(chunk);
  if (mode === "kill") return onKillInput(chunk);

  const sessions = getSessions();
  if (chunk === "\u001b[A") selected = Math.max(0, selected - 1);
  else if (chunk === "\u001b[B") selected = Math.min(Math.max(0, sessions.length - 1), selected + 1);
  else if (chunk === "\r" || chunk === "\n") switchTo(sessions[selected]);
  else if (chunk === "n") {
    mode = "new";
    input = "";
    projectPickerIndex = 0;
    message = "";
  } else if (chunk === "x") removeSelectedStoppedSession(sessions[selected]);
  else if (chunk === "r") requestRenameSession(sessions[selected]);
  else if (chunk === "k") requestKillSession(sessions[selected]);
  else if (chunk === "q" || chunk === "\u0003") mode = "quit";
  render();
}

function onNewInput(chunk: string) {
  const projects = getProjectChoices();
  if (chunk === "\u001b") {
    mode = "list";
    message = "";
  } else if (!input && chunk === "\u001b[A") projectPickerIndex = Math.max(0, projectPickerIndex - 1);
  else if (!input && chunk === "\u001b[B") projectPickerIndex = Math.min(projects.length - 1, projectPickerIndex + 1);
  else if (chunk === "\r" || chunk === "\n") {
    startSession(input.trim() || projects[projectPickerIndex] || process.cwd());
    mode = "list";
  } else if (chunk === "\u007f") input = input.slice(0, -1);
  else if (chunk >= " " && chunk !== "\u007f") input += chunk;
  render();
}

function onRenameInput(chunk: string) {
  const session = getSessions()[selected];
  if (chunk === "\u001b") {
    mode = "list";
    message = "";
  } else if (chunk === "\r" || chunk === "\n") {
    if (session) renameSession(session.id, input);
    mode = "list";
    setMessage("Renamed session", 1500);
  } else if (chunk === "\u007f") input = input.slice(0, -1);
  else if (chunk >= " " && chunk !== "\u007f") input += chunk;
  render();
}

function getProjectChoices(): string[] {
  const registry = readRegistry();
  return [process.cwd(), ...registry.recentProjects].filter((item, index, list) => item && list.indexOf(item) === index).slice(0, 8);
}

function onQuitInput(chunk: string) {
  if (chunk === "y" || chunk === "Y") {
    tmux(["kill-session", "-t", TMUX_SESSION]);
    process.exit(0);
  }
  if (chunk === "n" || chunk === "N" || chunk === "\u001b") mode = "list";
  render();
}

function onKillInput(chunk: string) {
  if (chunk === "y" || chunk === "Y") {
    const session = getSessions().find((entry) => entry.id === killTargetId);
    killSession(session);
    mode = "list";
    killTargetId = undefined;
  }
  if (chunk === "n" || chunk === "N" || chunk === "\u001b") {
    mode = "list";
    killTargetId = undefined;
  }
  render();
}

function switchTo(session: WorkbenchSession | undefined) {
  if (!session) return;
  if (session.status === "stopped" || !session.tmuxPaneId) {
    startSession(session.cwd, session.id, `Reopening ${session.displayName}`);
    return;
  }
  try {
    const panes = tmux(["list-panes", "-t", `${TMUX_SESSION}:workbench`, "-F", "#{pane_id}"]).split("\n");
    const rightPane = panes[1];
    if (!rightPane || rightPane === session.tmuxPaneId) {
      if (rightPane) tmux(["select-pane", "-t", rightPane]);
      return;
    }
    tmux(["swap-pane", "-s", session.tmuxPaneId, "-t", rightPane]);
    tmux(["select-pane", "-t", session.tmuxPaneId]);
    setMessage(`Switched to ${session.displayName}`, 1500);
  } catch {
    startSession(session.cwd, session.id, `Pane was gone; reopening ${session.displayName}`);
    setMessage(`Switch failed; reopened ${session.displayName}`, 2500);
  }
}

function requestRenameSession(session: WorkbenchSession | undefined) {
  if (!session) return;
  input = session.customName || session.displayName;
  mode = "rename";
  message = "";
}

function requestKillSession(session: WorkbenchSession | undefined) {
  if (!session || session.status === "stopped") return;
  killTargetId = session.id;
  mode = "kill";
  message = "";
}

function killSession(session: WorkbenchSession | undefined) {
  if (!session || session.status === "stopped") return;
  const rightPane = getRightPane();
  const isActive = rightPane === session.tmuxPaneId;
  const liveSessions = getSessions().filter((entry) => entry.status !== "stopped" && entry.id !== session.id && entry.tmuxPaneId);

  try {
    if (isActive && liveSessions.length > 0) {
      switchTo(liveSessions[0]);
      if (session.tmuxPaneId) tmux(["kill-pane", "-t", session.tmuxPaneId]);
    } else if (isActive && rightPane) {
      const replacementId = randomUUID();
      const piCommand = process.env.PI_WORKBENCH_PI_COMMAND || "pi";
      const command = `PI_WORKBENCH_MANAGED=1 PI_WORKBENCH_SESSION_ID=${quoteShell(replacementId)} PI_WORKBENCH_TMUX_SESSION=${quoteShell(TMUX_SESSION)} ${piCommand}`;
      tmux(["respawn-pane", "-k", "-t", rightPane, "-c", session.cwd, command]);
    } else if (session.tmuxPaneId) {
      tmux(["kill-pane", "-t", session.tmuxPaneId]);
    }
    patchSession(session.id, { status: "stopped" });
    setMessage(`Killed ${session.displayName}`, 1500);
  } catch (error) {
    patchSession(session.id, { status: "stopped" });
    setMessage(`Kill failed: ${error instanceof Error ? error.message : String(error)}`, 4000);
  }
}

function getRightPane(): string | undefined {
  try {
    return tmux(["list-panes", "-t", `${TMUX_SESSION}:workbench`, "-F", "#{pane_id}"]).split("\n")[1];
  } catch {
    return undefined;
  }
}

function removeSelectedStoppedSession(session: WorkbenchSession | undefined) {
  if (!session || session.status !== "stopped") return;
  removeSession(session.id);
  selected = Math.max(0, selected - 1);
  setMessage(`Removed ${session.displayName}`, 1500);
}

function startSession(path: string, id: string = randomUUID(), successMessage?: string) {
  const cwd = resolve(path.replace(/^~/, process.env.HOME || "~"));
  if (!existsSync(cwd)) {
    setMessage(`Path does not exist: ${cwd}`, 4000);
    return;
  }
  try {
    const piCommand = process.env.PI_WORKBENCH_PI_COMMAND || "pi";
    const command = `PI_WORKBENCH_MANAGED=1 PI_WORKBENCH_SESSION_ID=${quoteShell(id)} PI_WORKBENCH_TMUX_SESSION=${quoteShell(TMUX_SESSION)} ${piCommand}`;
    tmux(["new-window", "-d", "-t", TMUX_SESSION, "-n", "pi", "-c", cwd, command]);
    setMessage(successMessage ?? `Started Pi in ${cwd}`, 1500);
  } catch (error) {
    setMessage(`Start failed: ${error instanceof Error ? error.message : String(error)}`, 4000);
  }
}

function enforceSidebarWidth() {
  if (!process.env.TMUX_PANE) return;
  try {
    tmux(["resize-pane", "-t", process.env.TMUX_PANE, "-x", String(SIDEBAR_WIDTH)]);
  } catch {
    // The sidebar can still function if resizing fails.
  }
}

function setMessage(text: string, ttlMs: number) {
  message = text;
  messageUntil = Date.now() + ttlMs;
}

function clearExpiredMessage() {
  if (message && messageUntil > 0 && Date.now() > messageUntil) {
    message = "";
    messageUntil = 0;
  }
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

function color(name: "bold" | "dim" | "cyan" | "green" | "yellow" | "blue", text: string): string {
  const codes = { bold: 1, dim: 2, cyan: 36, green: 32, yellow: 33, blue: 34 };
  return `\x1b[${codes[name]}m${text}\x1b[0m`;
}

function inverse(styled: string, plain: string): string {
  return `\x1b[7m${styled}\x1b[27m${" ".repeat(Math.max(0, SIDEBAR_WIDTH - visibleLength(plain)))}\x1b[0m`;
}

function truncatePlain(text: string, length: number): string {
  if (text.length <= length) return text;
  return `${text.slice(0, Math.max(0, length - 1))}…`;
}

function padAnsi(text: string, width: number): string {
  return text + " ".repeat(Math.max(0, width - visibleLength(text)));
}

function visibleLength(text: string): number {
  return text.replace(/\x1b\[[0-9;]*m/g, "").length;
}
