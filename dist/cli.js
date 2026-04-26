#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hasSession, hasTmux, quoteShell, tmux } from "./tmux.js";
const DEFAULT_WORKBENCH_SESSION = "pi-workbench";
const __dirname = dirname(fileURLToPath(import.meta.url));
const sidebarPath = join(__dirname, "sidebar.js");
function main() {
    if (!hasTmux()) {
        console.error("pi-workbench requires tmux, but tmux was not found on PATH.");
        console.error("Install tmux, then run pi-workbench again. On macOS: brew install tmux");
        process.exit(1);
    }
    if (process.argv[2] === "smoke") {
        runSmoke();
        return;
    }
    const session = process.env.PI_WORKBENCH_TMUX_SESSION || DEFAULT_WORKBENCH_SESSION;
    if (!hasSession(session)) {
        createWorkbench(session);
    }
    else {
        ensureWorkbenchLayout(session);
    }
    tmux(["attach-session", "-t", session], { stdio: "inherit" });
}
function createWorkbench(session, options = {}) {
    const cwd = process.cwd();
    const sidebarCommand = options.sidebarCommand ?? buildSidebarCommand(session);
    const piCommand = buildPiCommand(session, randomUUID(), options.piCommand);
    tmux(["new-session", "-d", "-s", session, "-n", "workbench", "-c", cwd, "sleep 1000000"]);
    configureTmuxForPi();
    tmux(["set-option", "-t", session, "mouse", "on"]);
    tmux(["split-window", "-h", "-p", "80", "-t", `${session}:workbench`, "-c", cwd, piCommand]);
    const leftPane = tmux(["list-panes", "-t", `${session}:workbench`, "-F", "#{pane_id}"]).split("\n")[0];
    resizeSidebar(leftPane);
    tmux(["respawn-pane", "-k", "-t", leftPane, sidebarCommand]);
    ensureWorkbenchLayout(session);
    tmux(["select-pane", "-t", "{right}"]);
}
function buildSidebarCommand(session) {
    const piCommandEnv = process.env.PI_WORKBENCH_PI_COMMAND
        ? ` PI_WORKBENCH_PI_COMMAND=${quoteShell(process.env.PI_WORKBENCH_PI_COMMAND)}`
        : "";
    return `PI_WORKBENCH_TMUX_SESSION=${quoteShell(session)}${piCommandEnv} node ${quoteShell(sidebarPath)}`;
}
function buildPiCommand(session, id, command = process.env.PI_WORKBENCH_PI_COMMAND || "pi") {
    return `PI_WORKBENCH_MANAGED=1 PI_WORKBENCH_SESSION_ID=${quoteShell(id)} PI_WORKBENCH_TMUX_SESSION=${quoteShell(session)} ${command}`;
}
function ensureWorkbenchLayout(session) {
    configureTmuxForPi();
    const panes = tmux(["list-panes", "-t", `${session}:workbench`, "-F", "#{pane_id}"]).split("\n");
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
function runSmoke() {
    const session = `pi-workbench-smoke-${process.pid}`;
    const fakePi = "sh -lc 'echo FAKE_PI_READY; sleep 1000000'";
    const fakeSidebar = "sh -lc 'echo FAKE_SIDEBAR_READY; sleep 1000000'";
    tryTmux(["kill-session", "-t", session]);
    try {
        createWorkbench(session, { piCommand: fakePi, sidebarCommand: fakeSidebar });
        const panes = tmux([
            "list-panes",
            "-t",
            `${session}:workbench`,
            "-F",
            "#{pane_index}\t#{pane_id}\t#{pane_width}\t#{pane_current_command}",
        ])
            .split("\n")
            .map((line) => line.split("\t"));
        assert(panes.length === 2, `expected 2 panes, got ${panes.length}`);
        const leftWidth = Number(panes[0][2]);
        const rightWidth = Number(panes[1][2]);
        assert(leftWidth >= 24 && leftWidth <= 48, `expected compact left pane, got width ${leftWidth}`);
        assert(rightWidth > leftWidth, `expected right pane (${rightWidth}) wider than left pane (${leftWidth})`);
        const leftCapture = tmux(["capture-pane", "-p", "-t", panes[0][1]]);
        const rightCapture = tmux(["capture-pane", "-p", "-t", panes[1][1]]);
        assert(leftCapture.includes("FAKE_SIDEBAR_READY"), "left pane did not run sidebar command");
        assert(rightCapture.includes("FAKE_PI_READY"), "right pane did not run Pi command");
        const f1Binding = tmux(["list-keys", "-T", "root", "F1"]);
        assert(f1Binding.includes("select-pane"), "F1 binding was not installed");
        console.log("pi-workbench smoke passed");
    }
    finally {
        tryTmux(["kill-session", "-t", session]);
    }
}
function assert(condition, message) {
    if (!condition)
        throw new Error(`Smoke failed: ${message}`);
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