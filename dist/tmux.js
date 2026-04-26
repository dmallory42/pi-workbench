import { execFileSync, spawnSync } from "node:child_process";
export function hasTmux() {
    return spawnSync("tmux", ["-V"], { stdio: "ignore" }).status === 0;
}
export function tmux(args, options = {}) {
    return execFileSync("tmux", args, {
        encoding: "utf8",
        stdio: options.stdio ?? "pipe",
        cwd: options.cwd,
    }).trim();
}
export function hasSession(session) {
    return spawnSync("tmux", ["has-session", "-t", session], { stdio: "ignore" }).status === 0;
}
export function listPanes(session) {
    const output = tmux([
        "list-panes",
        "-a",
        "-t",
        session,
        "-F",
        "#{session_name}\t#{window_name}\t#{pane_index}\t#{pane_id}\t#{pane_active}\t#{pane_current_command}",
    ]);
    if (!output)
        return [];
    return output.split("\n").map((line) => {
        const [sessionName, window, index, id, active, command] = line.split("\t");
        return { session: sessionName, window, index, id, active: active === "1", command };
    });
}
export function quoteShell(value) {
    return `'${value.replaceAll("'", `'\\''`)}'`;
}
//# sourceMappingURL=tmux.js.map