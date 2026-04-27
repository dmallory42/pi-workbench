#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfigPath, readConfig } from "./config.js";
import { getRegistryPath, readRegistry, removeSession, withStaleSessions, writeRegistry } from "./registry.js";
import { hasSession, hasTmux, listPanes, tmux } from "./tmux.js";
import { DEFAULT_WORKBENCH_SESSION, createWorkbench, ensureWorkbench, getWorkbenchPaneIds, resetWorkbench, tryTmux } from "./workbench.js";
import { renderSidebar, stripAnsiForTest } from "./sidebar-render.js";
function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!hasTmux()) {
        console.error("pi-workbench requires tmux, but tmux was not found on PATH.");
        console.error("Install tmux, then run pi-workbench again. On macOS: brew install tmux");
        process.exit(1);
    }
    if (args.command === "smoke")
        return runSmoke();
    if (args.command === "reset")
        return runReset(args);
    if (args.command === "doctor")
        return runDoctor(args);
    if (args.command === "prune")
        return runPrune(args);
    if (args.command !== "run")
        return usage(1);
    ensureWorkbench(args.session);
    tmux(["attach-session", "-t", args.session], { stdio: "inherit" });
}
function parseArgs(argv) {
    let command = "run";
    let session = process.env.PI_WORKBENCH_TMUX_SESSION || DEFAULT_WORKBENCH_SESSION;
    let clearRegistry = false;
    let stopped = false;
    let json = false;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--session" && argv[i + 1])
            session = argv[++i];
        else if (arg === "--clear-registry")
            clearRegistry = true;
        else if (arg === "--stopped")
            stopped = true;
        else if (arg === "--json")
            json = true;
        else if (arg === "--help" || arg === "-h")
            command = "help";
        else if (!arg.startsWith("-") && command === "run")
            command = arg;
        else
            throw new Error(`Unknown argument: ${arg}`);
    }
    return { command, session, clearRegistry, stopped, json };
}
function usage(code = 0) {
    console.log(`Usage: pi-workbench [command] [options]\n\nCommands:\n  run       Start or attach to the workbench (default)\n  smoke     Run automated tmux smoke test\n  doctor    Print environment diagnostics\n  reset     Kill the workbench tmux session\n  prune     Remove stale registry entries\n\nOptions:\n  --session <name>      tmux session name\n  --clear-registry      with reset, remove stopped/stale registry entries\n  --stopped             with prune, remove all stopped entries too\n  --json                with doctor, emit JSON`);
    process.exit(code);
}
function runReset(args) {
    const killed = resetWorkbench(args.session);
    let pruned = 0;
    if (args.clearRegistry)
        pruned = pruneRegistry(true);
    console.log(`${killed ? "Killed" : "No"} tmux session: ${args.session}`);
    if (args.clearRegistry)
        console.log(`Removed ${pruned} registry entr${pruned === 1 ? "y" : "ies"}`);
}
function runPrune(args) {
    const pruned = pruneRegistry(args.stopped);
    console.log(`Removed ${pruned} registry entr${pruned === 1 ? "y" : "ies"}`);
}
function pruneRegistry(removeStopped) {
    const registry = withStaleSessions(readRegistry());
    const before = registry.sessions.length;
    for (const session of registry.sessions) {
        const paneMissing = session.tmuxPaneId ? !paneExists(session.tmuxPaneId) : session.status === "stopped";
        if ((session.status === "stopped" && removeStopped) || (session.status !== "stopped" && paneMissing)) {
            removeSession(session.id);
        }
    }
    return before - readRegistry().sessions.length;
}
function paneExists(paneId) {
    return tryTmux(["display-message", "-p", "-t", paneId, "#{pane_id}"]) === paneId;
}
function runDoctor(args) {
    const registry = withStaleSessions(readRegistry());
    const live = registry.sessions.filter((entry) => entry.status !== "stopped").length;
    const stoppedCount = registry.sessions.length - live;
    const diagnostics = {
        tmux: commandOutput("tmux", ["-V"]),
        pi: commandPath("pi"),
        piWorkbench: commandPath("pi-workbench"),
        extendedKeys: tryTmux(["show-options", "-gqv", "extended-keys"]),
        extendedKeysFormat: tryTmux(["show-options", "-gqv", "extended-keys-format"]),
        session: args.session,
        sessionExists: hasSession(args.session),
        registrySessions: registry.sessions.length,
        live,
        stopped: stoppedCount,
        registryPath: getRegistryPath(),
        configPath: getConfigPath(),
        config: readConfig(),
    };
    if (args.json) {
        console.log(JSON.stringify(diagnostics, null, 2));
        return;
    }
    line(Boolean(diagnostics.tmux), `tmux found: ${diagnostics.tmux || "missing"}`);
    line(Boolean(diagnostics.pi), `pi found: ${diagnostics.pi || "missing"}`);
    line(Boolean(diagnostics.piWorkbench), `pi-workbench found: ${diagnostics.piWorkbench || "missing"}`);
    line(diagnostics.extendedKeys === "on", `tmux extended-keys: ${diagnostics.extendedKeys || "unknown"}`);
    line(diagnostics.extendedKeysFormat === "csi-u", `tmux extended-keys-format: ${diagnostics.extendedKeysFormat || "unknown"}`);
    line(true, `workbench tmux session: ${diagnostics.sessionExists ? "exists" : "not running"} (${args.session})`);
    line(true, `registry: ${diagnostics.registryPath}`);
    line(true, `config: ${diagnostics.configPath}`);
    line(true, `registry sessions: ${diagnostics.registrySessions} (${live} live, ${stoppedCount} stopped)`);
    if (diagnostics.extendedKeys !== "on" || diagnostics.extendedKeysFormat !== "csi-u") {
        console.log("\nRecommended ~/.tmux.conf:");
        console.log("set -g extended-keys on");
        console.log("set -g extended-keys-format csi-u");
    }
}
function line(ok, text) {
    console.log(`${ok ? "✓" : "⚠"} ${text}`);
}
function commandPath(command) {
    return commandOutput("sh", ["-lc", `command -v ${command}`]);
}
function commandOutput(command, args) {
    try {
        return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    }
    catch {
        return "";
    }
}
function runSmoke() {
    runControllerSmoke();
    runReuseExistingCwdSmoke();
    runProductSmoke();
    runSidebarVisualSmoke();
    console.log("pi-workbench smoke passed");
}
function runControllerSmoke() {
    const session = `pi-workbench-smoke-controller-${process.pid}`;
    const fakePi = "sh -lc 'echo FAKE_PI_READY; sleep 1000000'";
    const fakeSidebar = "sh -lc 'echo FAKE_SIDEBAR_READY; sleep 1000000'";
    tryTmux(["kill-session", "-t", session]);
    try {
        createWorkbench(session, { piCommand: fakePi, sidebarCommand: fakeSidebar });
        sleep(1000);
        const panes = tmux([
            "list-panes",
            "-t",
            `${session}:workbench`,
            "-F",
            "#{pane_index}\t#{pane_id}\t#{pane_width}\t#{pane_current_command}",
        ])
            .split("\n")
            .map((line) => line.split("\t"));
        const windowSize = tmux(["display-message", "-p", "-t", `${session}:workbench`, "#{window_width}x#{window_height}"]);
        assert(windowSize === "120x40", `expected detached smoke window to start at 120x40, got ${windowSize}`);
        assert(panes.length === 2, `expected 2 panes, got ${panes.length}`);
        const leftWidth = Number(panes[0][2]);
        const rightWidth = Number(panes[1][2]);
        assert(leftWidth >= 24 && leftWidth <= 48, `expected compact left pane, got width ${leftWidth}`);
        assert(rightWidth > leftWidth, `expected right pane (${rightWidth}) wider than left pane (${leftWidth})`);
        const leftCapture = tmux(["capture-pane", "-p", "-t", panes[0][1]]);
        const rightCapture = tmux(["capture-pane", "-p", "-t", panes[1][1]]);
        assert(leftCapture.includes("FAKE_SIDEBAR_READY"), "controller smoke: left pane did not run injected sidebar command");
        assert(rightCapture.includes("FAKE_PI_READY"), "controller smoke: right pane did not run Pi command");
        const f1Binding = tmux(["list-keys", "-T", "root", "F1"]);
        assert(f1Binding.includes("select-pane"), "F1 binding was not installed");
        const borderStyle = tmux(["show-options", "-w", "-t", `${session}:workbench`, "-qv", "pane-border-style"]);
        const activeBorderStyle = tmux(["show-options", "-w", "-t", `${session}:workbench`, "-qv", "pane-active-border-style"]);
        const borderIndicators = tmux(["show-options", "-w", "-t", `${session}:workbench`, "-qv", "pane-border-indicators"]);
        assert(borderStyle === activeBorderStyle, "active pane border should match inactive border");
        assert(borderIndicators === "off", "active pane border indicators should be disabled");
        tmux(["new-window", "-d", "-t", session, "-n", "fake-b", "sh", "-lc", "echo FAKE_PI_B_READY; sleep 1000000"]);
        const hiddenPane = listPanes(session).find((pane) => pane.window === "fake-b")?.id;
        const rightPane = getWorkbenchPaneIds(session)[1];
        assert(Boolean(hiddenPane && rightPane), "missing panes for swap smoke");
        tmux(["swap-pane", "-s", hiddenPane, "-t", rightPane]);
        const swappedCapture = tmux(["capture-pane", "-p", "-t", hiddenPane]);
        assert(swappedCapture.includes("FAKE_PI_B_READY"), "swap-pane did not move fake B into right pane");
    }
    finally {
        tryTmux(["kill-session", "-t", session]);
    }
}
function runReuseExistingCwdSmoke() {
    const session = `pi-workbench-smoke-reuse-${process.pid}`;
    const externalSession = `${session}-existing`;
    const oldStateDir = process.env.PI_WORKBENCH_STATE_DIR;
    const stateDir = mkdtempSync(join(tmpdir(), "pi-workbench-smoke-reuse-"));
    const fakePiPath = join(process.cwd(), "dist", "smoke-fixtures", "fake-pi.js");
    const fakePi = `node ${JSON.stringify(fakePiPath)}`;
    process.env.PI_WORKBENCH_STATE_DIR = stateDir;
    tryTmux(["kill-session", "-t", session]);
    tryTmux(["kill-session", "-t", externalSession]);
    try {
        tmux([
            "new-session",
            "-d",
            "-s",
            externalSession,
            "-c",
            process.cwd(),
            `PI_WORKBENCH_STATE_DIR=${JSON.stringify(stateDir)} PI_WORKBENCH_SESSION_ID=existing node ${JSON.stringify(fakePiPath)}`,
        ]);
        sleep(1000);
        assert(readRegistry().sessions.some((entry) => entry.id === "existing" && entry.status !== "stopped"), "reuse smoke: existing Pi session did not register");
        createWorkbench(session, { piCommand: fakePi });
        sleep(1000);
        const panes = getWorkbenchPaneIds(session);
        assert(panes.length === 2, `reuse smoke: expected 2 panes, got ${panes.length}`);
        const rightCapture = tmux(["capture-pane", "-p", "-t", panes[1]]);
        assert(rightCapture.includes("FAKE_PI_READY existing"), "reuse smoke: existing same-directory session was not reused in right pane");
        const live = readRegistry().sessions.filter((entry) => entry.status !== "stopped");
        assert(live.length === 1, `reuse smoke: expected no extra Pi session to be spawned, got ${live.length} live sessions`);
        assert(live[0]?.id === "existing", "reuse smoke: live session id should remain the existing same-directory session");
    }
    finally {
        tryTmux(["kill-session", "-t", session]);
        tryTmux(["kill-session", "-t", externalSession]);
        rmSync(stateDir, { recursive: true, force: true });
        if (oldStateDir === undefined)
            delete process.env.PI_WORKBENCH_STATE_DIR;
        else
            process.env.PI_WORKBENCH_STATE_DIR = oldStateDir;
    }
}
function runProductSmoke() {
    const session = `pi-workbench-smoke-product-${process.pid}`;
    const oldStateDir = process.env.PI_WORKBENCH_STATE_DIR;
    const stateDir = mkdtempSync(join(tmpdir(), "pi-workbench-smoke-"));
    const fakePi = `node ${JSON.stringify(join(process.cwd(), "dist", "smoke-fixtures", "fake-pi.js"))}`;
    process.env.PI_WORKBENCH_STATE_DIR = stateDir;
    tryTmux(["kill-session", "-t", session]);
    try {
        writeRegistry({
            version: 1,
            recentProjects: ["/Users/mal/projects/pi-workbench"],
            sessions: [
                {
                    id: "two",
                    cwd: "/Users/mal/projects/pi-workbench",
                    displayName: "pi-workbench",
                    status: "stopped",
                    tmuxSession: session,
                    gitBranch: "main",
                    createdAt: 1,
                    updatedAt: Date.now(),
                },
            ],
        });
        createWorkbench(session, { piCommand: fakePi });
        sleep(1000);
        const panes = getWorkbenchPaneIds(session);
        assert(panes.length === 2, `product smoke: expected 2 panes, got ${panes.length}`);
        const sidebarCapture = tmux(["capture-pane", "-p", "-t", panes[0]]);
        const piCapture = tmux(["capture-pane", "-p", "-t", panes[1]]);
        const liveBeforeKill = readRegistry().sessions.filter((entry) => entry.status !== "stopped");
        assert(liveBeforeKill.length === 1, `product smoke: expected one live fake Pi before kill, got ${liveBeforeKill.length}`);
        const liveIdBeforeKill = liveBeforeKill[0].id;
        assert(sidebarCapture.includes("Pi Workbench"), "product smoke: real sidebar did not render title");
        assert(sidebarCapture.includes("Running"), "product smoke: real sidebar did not render running group");
        assert(sidebarCapture.includes("Stopped"), "product smoke: real sidebar did not render stopped group");
        assert(sidebarCapture.includes("~/projects/pi-workbench"), "product smoke: real sidebar did not render bottom project details");
        assert(sidebarCapture.includes("⎇ main"), "product smoke: real sidebar did not render git branch details");
        assert(piCapture.includes("FAKE_PI_READY"), "product smoke: fake Pi did not render in right pane");
        tmux(["select-pane", "-t", panes[0]]);
        sleep(700);
        const focusedCapture = tmux(["capture-pane", "-p", "-t", panes[0]]);
        assert(focusedCapture.includes("▌"), "product smoke: focused sidebar did not render gutter");
        tmux(["select-pane", "-t", panes[1]]);
        sleep(700);
        const unfocusedCapture = tmux(["capture-pane", "-p", "-t", panes[0]]);
        assert(unfocusedCapture.includes("F1 sidebar"), "product smoke: unfocused sidebar did not show F1 hint");
        tmux(["select-pane", "-t", panes[0]]);
        sleep(500);
        tmux(["send-keys", "-t", panes[0], "q"]);
        sleep(300);
        const quitCapture = tmux(["capture-pane", "-p", "-t", panes[0]]);
        assert(quitCapture.includes("Quit Pi Workbench?"), "product smoke: q did not render quit confirmation");
        tmux(["send-keys", "-t", panes[0], "n"]);
        sleep(300);
        const cancelledQuitCapture = tmux(["capture-pane", "-p", "-t", panes[0]]);
        assert(cancelledQuitCapture.includes("Pi Workbench"), "product smoke: cancelling quit did not return to list");
        tmux(["send-keys", "-t", panes[0], "k"]);
        sleep(300);
        tmux(["send-keys", "-t", panes[0], "y"]);
        sleep(1200);
        const afterKillRegistry = readRegistry();
        const liveAfterKill = afterKillRegistry.sessions.filter((entry) => entry.status !== "stopped");
        assert(liveAfterKill.length === 1, `product smoke: expected one live restarted session after active-only kill, got ${liveAfterKill.length}`);
        assert(liveAfterKill[0]?.id === liveIdBeforeKill, "product smoke: active-only kill should restart in-place using the same workbench row");
    }
    finally {
        tryTmux(["kill-session", "-t", session]);
        rmSync(stateDir, { recursive: true, force: true });
        if (oldStateDir === undefined)
            delete process.env.PI_WORKBENCH_STATE_DIR;
        else
            process.env.PI_WORKBENCH_STATE_DIR = oldStateDir;
    }
}
function runSidebarVisualSmoke() {
    const sessions = [
        {
            id: "one",
            cwd: "/Users/mal/projects/pi-workbench",
            displayName: "pi-workbench",
            label: "pi-workbench #1",
            status: "idle",
            tmuxSession: "pi-workbench-smoke",
            gitBranch: "main",
            createdAt: 1,
            updatedAt: 1000,
        },
        {
            id: "two",
            cwd: "/Users/mal/projects/pi-workbench",
            displayName: "pi-workbench",
            label: "pi-workbench #2",
            status: "stopped",
            tmuxSession: "pi-workbench-smoke",
            gitBranch: "main",
            createdAt: 1,
            updatedAt: 1000,
        },
    ];
    const rows = renderSidebar({
        tmuxSession: "pi-workbench-smoke",
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
    }, sessions, 36, 20);
    assert(rows.length === 20, "sidebar visual smoke should fill requested height");
    for (const row of rows) {
        assert(stripAnsiForTest(row).startsWith("▌"), "focused sidebar gutter should be continuous");
    }
    assert(rows.join("\n").includes("48;5;24"), "focused selected row should be highlighted");
    const plain = rows.map(stripAnsiForTest).join("\n");
    assert(plain.includes("~/projects/pi-workbench"), "sidebar should shorten home path in details");
    assert(plain.includes("⎇ main"), "sidebar should render git branch detail");
}
function sleep(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function assert(condition, message) {
    if (!condition)
        throw new Error(`Smoke failed: ${message}`);
}
main();
//# sourceMappingURL=cli.js.map