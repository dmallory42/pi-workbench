import { readRegistry, withStaleSessions } from "./registry.js";
export function getDisplaySessions(tmuxSession) {
    const registry = withStaleSessions(readRegistry());
    const sessions = registry.sessions
        .filter((session) => session.tmuxSession === tmuxSession || session.managed)
        .sort((a, b) => Number(b.status !== "stopped") - Number(a.status !== "stopped") || a.displayName.localeCompare(b.displayName));
    return withDuplicateLabels(sessions);
}
export function renderSidebar(state, sessions, width, height) {
    let selected = state.selected;
    if (selected >= sessions.length)
        selected = Math.max(0, sessions.length - 1);
    const selectedSession = sessions[selected];
    const liveCount = sessions.filter((session) => session.status !== "stopped").length;
    const stoppedCount = sessions.length - liveCount;
    const rows = [];
    const title = `Pi Workbench ${liveCount} live${stoppedCount ? ` · ${stoppedCount} stopped` : ""}`;
    rows.push(padLine(color("bold", truncatePlain(title, contentWidth(width))), width, state.sidebarFocused));
    rows.push(padLine("".padEnd(contentWidth(width), "─"), width, state.sidebarFocused));
    if (state.mode === "list") {
        if (sessions.length === 0)
            rows.push(padLine(color("dim", "No Pi sessions yet."), width, state.sidebarFocused));
        const reservedRows = selectedSession ? 8 : 4;
        const maxListRows = Math.max(3, height - reservedRows);
        for (const row of getRows(sessions).slice(0, maxListRows)) {
            if (row.type === "header") {
                rows.push(row.label ? padLine(color("dim", row.label), width, state.sidebarFocused) : "");
            }
            else {
                rows.push(renderSessionRow(row.session, row.sessionIndex === selected, width, state.sidebarFocused));
            }
        }
        if (selectedSession) {
            pushBlankUntil(rows, height - 7);
            rows.push(padLine("".padEnd(contentWidth(width), "─"), width, state.sidebarFocused));
            rows.push(padLine(color("cyan", truncatePlain(shortPath(selectedSession.cwd, state.home), contentWidth(width))), width, state.sidebarFocused));
            rows.push(padLine(color("blue", selectedSession.gitBranch ? `⎇ ${selectedSession.gitBranch}${selectedSession.gitDirty ? "*" : ""}` : "⎇ —"), width, state.sidebarFocused));
            rows.push("");
            if (selectedSession.status === "stopped")
                rows.push(padLine(color("yellow", "↵ reopen   x remove"), width, state.sidebarFocused));
            else
                rows.push(padLine(color("yellow", "↵ switch   k kill"), width, state.sidebarFocused));
            if (state.sidebarFocused) {
                rows.push(padLine(color("dim", "n new      r rename"), width, state.sidebarFocused));
                rows.push(padLine(color("dim", "q quit"), width, state.sidebarFocused));
            }
            else {
                rows.push(padLine(color("dim", "F1 sidebar"), width, state.sidebarFocused));
                rows.push(padLine(color("dim", ""), width, state.sidebarFocused));
            }
        }
        else {
            pushBlankUntil(rows, height - 3);
            rows.push(padLine(color("dim", state.sidebarFocused ? "n new" : "F1 sidebar"), width, state.sidebarFocused));
            rows.push(padLine(color("dim", state.sidebarFocused ? "q quit" : ""), width, state.sidebarFocused));
        }
    }
    if (state.message && state.messageUntil > state.now) {
        rows.push("");
        rows.push(padLine(color("yellow", truncatePlain(state.message, contentWidth(width))), width, state.sidebarFocused));
    }
    return rows.slice(0, height).map((row) => padAnsi(row === "" ? padLine("", width, state.sidebarFocused) : row, width));
}
function withDuplicateLabels(sessions) {
    const totals = new Map();
    for (const session of sessions)
        totals.set(session.displayName, (totals.get(session.displayName) ?? 0) + 1);
    const seen = new Map();
    return sessions.map((session) => {
        const count = (seen.get(session.displayName) ?? 0) + 1;
        seen.set(session.displayName, count);
        const base = session.customName || session.displayName;
        const label = (totals.get(session.displayName) ?? 0) > 1 && !session.customName ? `${base} #${count}` : base;
        return { ...session, label };
    });
}
function getRows(sessions) {
    const rows = [];
    const live = sessions.filter((session) => session.status !== "stopped");
    const stopped = sessions.filter((session) => session.status === "stopped");
    if (live.length > 0) {
        rows.push({ type: "header", label: "Running" });
        for (const session of live)
            rows.push({ type: "session", session, sessionIndex: sessions.indexOf(session) });
    }
    if (stopped.length > 0) {
        if (rows.length > 0)
            rows.push({ type: "header", label: "" });
        rows.push({ type: "header", label: "Stopped" });
        for (const session of stopped)
            rows.push({ type: "session", session, sessionIndex: sessions.indexOf(session) });
    }
    return rows;
}
function renderSessionRow(session, isSelected, width, sidebarFocused) {
    const marker = isSelected && sidebarFocused ? color("cyan", "▸") : isSelected ? color("dim", "›") : " ";
    const status = session.status;
    const icon = statusIcon(status);
    const available = Math.max(6, contentWidth(width) - visibleLength(marker) - icon.length - status.length - 5);
    return padLine(`${marker} ${icon} ${truncatePlain(session.label, available).padEnd(available)} ${color(statusColor(status), status)}`, width, sidebarFocused);
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
function shortPath(path, home = process.env.HOME) {
    return home && path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}
function contentWidth(width) {
    return Math.max(1, width - 2);
}
function padLine(text, width, sidebarFocused) {
    const gutter = sidebarFocused ? color("cyan", "▌") : " ";
    return `${gutter} ${truncateAnsi(text, contentWidth(width))}`;
}
function pushBlankUntil(rows, targetLength) {
    while (rows.length < targetLength)
        rows.push("");
}
function truncatePlain(text, length) {
    if (text.length <= length)
        return text;
    return `${text.slice(0, Math.max(0, length - 1))}…`;
}
function truncateAnsi(text, width) {
    if (visibleLength(text) <= width)
        return text;
    return `${stripAnsi(text).slice(0, Math.max(0, width - 1))}…`;
}
function padAnsi(text, width) {
    return text + " ".repeat(Math.max(0, width - visibleLength(text)));
}
function stripAnsi(text) {
    return text.replace(/\x1b\[[0-9;]*m/g, "");
}
export function visibleLength(text) {
    return stripAnsi(text).length;
}
export function stripAnsiForTest(text) {
    return stripAnsi(text);
}
//# sourceMappingURL=sidebar-render.js.map