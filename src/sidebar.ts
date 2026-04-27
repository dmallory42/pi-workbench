#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { getSidebarWidth } from "./config.js";
import { patchSession, readRegistry, removeSession, renameSession, type WorkbenchSession } from "./registry.js";
import { getDisplaySessions, renderSidebar } from "./sidebar-render.js";
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
let sidebarFocused = true;

startSidebar();

function startSidebar() {
  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  process.stdout.write("\x1b[?25l\x1b[?1000h\x1b[?1004h\x1b[2J\x1b[H");

  const interval = setInterval(() => {
    enforceSidebarWidth();
    updateFocusFromTmux();
    render();
  }, 500);

  process.stdin.on("data", onInput);
  process.on("exit", () => {
    clearInterval(interval);
    process.stdout.write("\x1b[?25h\x1b[?1000l\x1b[?1004l\x1b[0m\x1b[2J\x1b[H");
  });
  process.on("SIGINT", () => process.exit(0));

  // Let tmux finish applying pane geometry before the first paint. Without this,
  // the footer can briefly render in a pre-resize position and then jump.
  setTimeout(() => {
    enforceSidebarWidth();
    updateFocusFromTmux();
    render();
  }, 250);
}

function getSessions() {
  return getDisplaySessions(TMUX_SESSION);
}

function render() {
  enforceSidebarWidth();
  clearExpiredMessage();
  const sessions = getSessions();
  if (selected >= sessions.length) selected = Math.max(0, sessions.length - 1);
  const width = process.stdout.columns || SIDEBAR_WIDTH;
  const height = process.stdout.rows || 24;
  const rows = renderSidebar(
    {
      tmuxSession: TMUX_SESSION,
      sidebarWidth: SIDEBAR_WIDTH,
      selected,
      mode,
      input,
      projectPickerIndex,
      message,
      messageUntil,
      killTargetId,
      sidebarFocused,
      now: Date.now(),
      cwd: process.cwd(),
      home: process.env.HOME,
      projectChoices: getProjectChoices(),
    },
    sessions,
    width,
    height,
  );

  process.stdout.write("\x1b[H\x1b[2J");
  process.stdout.write(rows.join("\n"));
}

function onInput(chunk: string) {
  if (chunk.includes("\u001b[I")) {
    sidebarFocused = true;
    render();
    chunk = chunk.replaceAll("\u001b[I", "");
    if (!chunk) return;
  }
  if (chunk.includes("\u001b[O")) {
    sidebarFocused = false;
    render();
    chunk = chunk.replaceAll("\u001b[O", "");
    if (!chunk) return;
  }
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

function updateFocusFromTmux() {
  if (!process.env.TMUX_PANE) return;
  try {
    const activePane = tmux(["display-message", "-p", "-t", `${TMUX_SESSION}:workbench`, "#{pane_id}"]);
    sidebarFocused = activePane === process.env.TMUX_PANE;
  } catch {
    // Keep the last known focus state if tmux cannot answer.
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
