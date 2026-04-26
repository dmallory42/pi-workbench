#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hasSession, hasTmux, quoteShell, tmux } from "./tmux.js";
const WORKBENCH_SESSION = process.env.PI_WORKBENCH_TMUX_SESSION || "pi-workbench";
const __dirname = dirname(fileURLToPath(import.meta.url));
const sidebarPath = join(__dirname, "sidebar.js");
function main() {
    if (!hasTmux()) {
        console.error("pi-workbench requires tmux, but tmux was not found on PATH.");
        console.error("Install tmux, then run pi-workbench again. On macOS: brew install tmux");
        process.exit(1);
    }
    if (!hasSession(WORKBENCH_SESSION)) {
        createWorkbench();
    }
    else {
        ensureWorkbenchLayout();
    }
    tmux(["attach-session", "-t", WORKBENCH_SESSION], { stdio: "inherit" });
}
function createWorkbench() {
    const cwd = process.cwd();
    const sidebarCommand = `PI_WORKBENCH_TMUX_SESSION=${quoteShell(WORKBENCH_SESSION)} node ${quoteShell(sidebarPath)}`;
    const piCommand = `PI_WORKBENCH_MANAGED=1 PI_WORKBENCH_SESSION_ID=${quoteShell(randomUUID())} PI_WORKBENCH_TMUX_SESSION=${quoteShell(WORKBENCH_SESSION)} pi`;
    tmux(["new-session", "-d", "-s", WORKBENCH_SESSION, "-n", "workbench", "-c", cwd, sidebarCommand]);
    configureTmuxForPi();
    tmux(["set-option", "-t", WORKBENCH_SESSION, "mouse", "on"]);
    tmux(["split-window", "-h", "-p", "80", "-t", `${WORKBENCH_SESSION}:workbench`, "-c", cwd, piCommand]);
    ensureWorkbenchLayout();
    tmux(["select-pane", "-t", "{right}"]);
}
function ensureWorkbenchLayout() {
    configureTmuxForPi();
    const panes = tmux(["list-panes", "-t", `${WORKBENCH_SESSION}:workbench`, "-F", "#{pane_id}"]).split("\n");
    const leftPane = panes[0];
    if (!leftPane)
        return;
    resizeSidebar(leftPane);
    tmux(["bind-key", "-T", "root", "F1", "select-pane", "-t", leftPane]);
}
function resizeSidebar(leftPane) {
    const width = Number(process.env.PI_WORKBENCH_SIDEBAR_WIDTH) || 32;
    tmux(["resize-pane", "-t", leftPane, "-x", String(Math.max(24, Math.min(48, width)))]);
}
function configureTmuxForPi() {
    tryTmux(["set-option", "-gq", "extended-keys", "on"]);
    tryTmux(["set-option", "-gq", "extended-keys-format", "csi-u"]);
}
function tryTmux(args) {
    try {
        tmux(args);
    }
    catch {
        // Best-effort compatibility tweak only.
    }
}
main();
//# sourceMappingURL=cli.js.map