#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { readRegistry, withStaleSessions } from "./registry.js";
import { quoteShell, tmux } from "./tmux.js";
const TMUX_SESSION = process.env.PI_WORKBENCH_TMUX_SESSION || "pi-workbench";
const SIDEBAR_WIDTH = Math.max(24, Math.min(48, Number(process.env.PI_WORKBENCH_SIDEBAR_WIDTH) || 32));
let selected = 0;
let mode = "list";
let input = "";
let message = "";
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
function getSessions() {
    const registry = withStaleSessions(readRegistry());
    return registry.sessions
        .filter((session) => session.tmuxSession === TMUX_SESSION || session.managed)
        .sort((a, b) => Number(b.status !== "stopped") - Number(a.status !== "stopped") || a.displayName.localeCompare(b.displayName));
}
function render() {
    enforceSidebarWidth();
    const sessions = getSessions();
    if (selected >= sessions.length)
        selected = Math.max(0, sessions.length - 1);
    const width = process.stdout.columns || 40;
    const height = process.stdout.rows || 24;
    const rows = [];
    rows.push(color("bold", "Pi Workbench"));
    rows.push("".padEnd(width, "─"));
    if (mode === "new") {
        rows.push("New session project path:");
        rows.push(input || process.cwd());
        rows.push("");
        rows.push("Enter start · Esc cancel");
    }
    else if (mode === "quit") {
        rows.push(color("yellow", "Quit workbench?"));
        rows.push("This will kill managed Pi processes.");
        rows.push("Pi histories can be resumed later.");
        rows.push("");
        rows.push("y confirm · n/Esc cancel");
    }
    else {
        for (let i = 0; i < Math.min(sessions.length, height - 7); i++) {
            const session = sessions[i];
            const prefix = i === selected ? color("cyan", "▶") : " ";
            rows.push(`${prefix} ${statusIcon(session.status)} ${truncate(session.displayName, 16)} ${color(statusColor(session.status), session.status)}`);
            rows.push(`    ${truncate(session.cwd, Math.max(10, width - 4))}`);
        }
        if (sessions.length === 0)
            rows.push(color("dim", "No registered Pi sessions yet."));
        rows.push("");
        rows.push(color("dim", "↑/↓ select · Enter switch"));
        rows.push(color("dim", "n new · q quit · F1 focus list"));
    }
    if (message) {
        rows.push("");
        rows.push(color("yellow", truncate(message, width)));
    }
    process.stdout.write("\x1b[H\x1b[2J");
    process.stdout.write(rows.slice(0, height).map((row) => truncate(stripPad(row, width), width)).join("\n"));
}
function onInput(chunk) {
    if (mode === "new")
        return onNewInput(chunk);
    if (mode === "quit")
        return onQuitInput(chunk);
    const sessions = getSessions();
    if (chunk === "\u001b[A")
        selected = Math.max(0, selected - 1);
    else if (chunk === "\u001b[B")
        selected = Math.min(Math.max(0, sessions.length - 1), selected + 1);
    else if (chunk === "\r" || chunk === "\n")
        switchTo(sessions[selected]);
    else if (chunk === "n") {
        mode = "new";
        input = process.cwd();
    }
    else if (chunk === "q" || chunk === "\u0003")
        mode = "quit";
    render();
}
function onNewInput(chunk) {
    if (chunk === "\u001b") {
        mode = "list";
        message = "";
    }
    else if (chunk === "\r" || chunk === "\n") {
        startSession(input.trim() || process.cwd());
        mode = "list";
    }
    else if (chunk === "\u007f")
        input = input.slice(0, -1);
    else if (chunk >= " " && chunk !== "\u007f")
        input += chunk;
    render();
}
function onQuitInput(chunk) {
    if (chunk === "y" || chunk === "Y") {
        tmux(["kill-session", "-t", TMUX_SESSION]);
        process.exit(0);
    }
    if (chunk === "n" || chunk === "N" || chunk === "\u001b")
        mode = "list";
    render();
}
function switchTo(session) {
    if (!session)
        return;
    if (session.status === "stopped" || !session.tmuxPaneId) {
        startSession(session.cwd, session.id, `Reopening ${session.displayName}`);
        return;
    }
    try {
        const panes = tmux(["list-panes", "-t", `${TMUX_SESSION}:workbench`, "-F", "#{pane_id}"]).split("\n");
        const rightPane = panes[1];
        if (!rightPane || rightPane === session.tmuxPaneId) {
            if (rightPane)
                tmux(["select-pane", "-t", rightPane]);
            return;
        }
        tmux(["swap-pane", "-s", session.tmuxPaneId, "-t", rightPane]);
        tmux(["select-pane", "-t", session.tmuxPaneId]);
        message = `Switched to ${session.displayName}`;
    }
    catch (error) {
        startSession(session.cwd, session.id, `Pane was gone; reopening ${session.displayName}`);
        message = `Switch failed; reopened ${session.displayName}`;
    }
}
function startSession(path, id = randomUUID(), successMessage) {
    const cwd = resolve(path.replace(/^~/, process.env.HOME || "~"));
    if (!existsSync(cwd)) {
        message = `Path does not exist: ${cwd}`;
        return;
    }
    try {
        const piCommand = process.env.PI_WORKBENCH_PI_COMMAND || "pi";
        const command = `PI_WORKBENCH_MANAGED=1 PI_WORKBENCH_SESSION_ID=${quoteShell(id)} PI_WORKBENCH_TMUX_SESSION=${quoteShell(TMUX_SESSION)} ${piCommand}`;
        tmux(["new-window", "-d", "-t", TMUX_SESSION, "-n", "pi", "-c", cwd, command]);
        message = successMessage ?? `Started Pi in ${cwd}`;
    }
    catch (error) {
        message = `Start failed: ${error instanceof Error ? error.message : String(error)}`;
    }
}
function enforceSidebarWidth() {
    if (!process.env.TMUX_PANE)
        return;
    try {
        tmux(["resize-pane", "-t", process.env.TMUX_PANE, "-x", String(SIDEBAR_WIDTH)]);
    }
    catch {
        // The sidebar can still function if resizing fails.
    }
}
function statusIcon(status) {
    if (status === "idle")
        return "●";
    if (status === "thinking")
        return "◐";
    if (status === "running")
        return "⚙";
    return "○";
}
function statusColor(status) {
    if (status === "idle")
        return "green";
    if (status === "thinking")
        return "yellow";
    if (status === "running")
        return "blue";
    return "dim";
}
function color(name, text) {
    const codes = { bold: 1, dim: 2, cyan: 36, green: 32, yellow: 33, blue: 34 };
    return `\x1b[${codes[name]}m${text}\x1b[0m`;
}
function truncate(text, length) {
    if (text.length <= length)
        return text;
    return `${text.slice(0, Math.max(0, length - 1))}…`;
}
function stripPad(text, width) {
    return text + " ".repeat(Math.max(0, width - text.replace(/\x1b\[[0-9;]*m/g, "").length));
}
//# sourceMappingURL=sidebar.js.map