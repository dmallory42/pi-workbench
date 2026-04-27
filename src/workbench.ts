import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readConfig, getSidebarWidth } from "./config.js";
import { hasSession, quoteShell, tmux } from "./tmux.js";

export const DEFAULT_WORKBENCH_SESSION = "pi-workbench";
const __dirname = dirname(fileURLToPath(import.meta.url));
const sidebarPath = join(__dirname, "sidebar.js");

export interface WorkbenchOptions {
  piCommand?: string;
  sidebarCommand?: string;
}

export function ensureWorkbench(session: string, options: WorkbenchOptions = {}) {
  if (!hasSession(session)) createWorkbench(session, options);
  else ensureWorkbenchLayout(session);
}

export function createWorkbench(session: string, options: WorkbenchOptions = {}) {
  const cwd = process.cwd();
  const sidebarCommand = options.sidebarCommand ?? buildSidebarCommand(session);
  const piCommand = buildPiCommand(session, randomUUID(), options.piCommand);

  tmux(["new-session", "-d", "-s", session, "-n", "workbench", "-c", cwd, "sleep 1000000"]);
  configureTmuxForPi();
  tmux(["set-option", "-t", session, "mouse", "on"]);
  configureWorkbenchStatus(session);
  tmux(["split-window", "-h", "-p", "80", "-t", `${session}:workbench`, "-c", cwd, piCommand]);
  const leftPane = getWorkbenchPaneIds(session)[0];
  resizeSidebar(leftPane);
  tmux(["respawn-pane", "-k", "-t", leftPane, sidebarCommand]);
  ensureWorkbenchLayout(session);
  tmux(["select-pane", "-t", "{right}"]);
}

export function buildSidebarCommand(session: string): string {
  const piCommandEnv = process.env.PI_WORKBENCH_PI_COMMAND
    ? ` PI_WORKBENCH_PI_COMMAND=${quoteShell(process.env.PI_WORKBENCH_PI_COMMAND)}`
    : "";
  return `PI_WORKBENCH_TMUX_SESSION=${quoteShell(session)}${piCommandEnv} node ${quoteShell(sidebarPath)}`;
}

export function buildPiCommand(session: string, id: string, command = process.env.PI_WORKBENCH_PI_COMMAND || "pi"): string {
  return `PI_WORKBENCH_MANAGED=1 PI_WORKBENCH_SESSION_ID=${quoteShell(id)} PI_WORKBENCH_TMUX_SESSION=${quoteShell(session)} ${command}`;
}

export function ensureWorkbenchLayout(session: string) {
  configureTmuxForPi();
  const leftPane = getWorkbenchPaneIds(session)[0];
  if (!leftPane) return;
  resizeSidebar(leftPane);
  tmux(["bind-key", "-T", "root", "F1", "select-pane", "-t", leftPane]);
}

export function getWorkbenchPaneIds(session: string): string[] {
  const output = tmux(["list-panes", "-t", `${session}:workbench`, "-F", "#{pane_id}"]);
  return output ? output.split("\n") : [];
}

export function resizeSidebar(leftPane: string) {
  tmux(["resize-pane", "-t", leftPane, "-x", String(getSidebarWidth())]);
}

export function configureTmuxForPi() {
  tryTmux(["set-option", "-gq", "extended-keys", "on"]);
  tryTmux(["set-option", "-gq", "extended-keys-format", "csi-u"]);
}

export function configureWorkbenchStatus(session: string) {
  configurePaneBorders(session);
  const config = readConfig();
  if (config.hideTmuxStatus) {
    tryTmux(["set-option", "-t", session, "status", "off"]);
    return;
  }
  tryTmux(["set-option", "-t", session, "status", "on"]);
  tryTmux(["set-option", "-t", session, "status-left", " pi-workbench "]);
  tryTmux(["set-option", "-t", session, "status-right", " F1 sidebar · q quit "]);
  tryTmux(["set-option", "-t", session, "window-status-format", " #I:#W "]);
  tryTmux(["set-option", "-t", session, "window-status-current-format", " #I:#W* "]);
}

export function configurePaneBorders(session: string) {
  // Keep the divider stable regardless of which pane is focused. These are
  // window options, so set them explicitly on the visible workbench window;
  // otherwise a user's global active-pane colour can still leak through.
  const target = `${session}:workbench`;
  tryTmux(["set-window-option", "-t", target, "pane-border-style", "fg=colour244"]);
  tryTmux(["set-window-option", "-t", target, "pane-active-border-style", "fg=colour244"]);
  tryTmux(["set-window-option", "-t", target, "pane-border-indicators", "off"]);
  tryTmux(["set-window-option", "-t", target, "pane-border-lines", "single"]);
}

export function resetWorkbench(session: string): boolean {
  if (!hasSession(session)) return false;
  tmux(["kill-session", "-t", session]);
  return true;
}

export function tryTmux(args: string[]): string | undefined {
  try {
    return tmux(args);
  } catch {
    return undefined;
  }
}
