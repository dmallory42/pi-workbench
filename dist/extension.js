import { execFileSync } from "node:child_process";
import { formatSessionName, markSessionStopped, patchSession, upsertSession } from "./registry.js";
export default function piWorkbenchExtension(pi) {
    const startedAt = Date.now();
    const id = process.env.PI_WORKBENCH_SESSION_ID || `${process.pid}-${startedAt}`;
    const cwd = process.cwd();
    const tmuxPaneId = process.env.TMUX_PANE;
    const tmuxSession = process.env.PI_WORKBENCH_TMUX_SESSION;
    const managed = process.env.PI_WORKBENCH_MANAGED === "1";
    function write(status) {
        upsertSession({
            id,
            pid: process.pid,
            cwd,
            displayName: pi.getSessionName?.() || formatSessionName(cwd),
            status,
            tmuxPaneId,
            tmuxSession,
            managed,
            createdAt: startedAt,
            updatedAt: Date.now(),
        });
    }
    pi.on("session_start", async (_event, ctx) => {
        write("idle");
        if (!commandExists("pi-workbench")) {
            ctx.ui.notify("pi-workbench CLI was not found on PATH. Install with `pi install npm:pi-workbench`, or run `npm link` while developing locally.", "warning");
        }
    });
    pi.on("model_select", async (event) => {
        patchSession(id, { model: `${event.model.provider}/${event.model.id}` });
    });
    pi.on("agent_start", async () => {
        patchSession(id, { status: "thinking" });
    });
    pi.on("tool_execution_start", async () => {
        patchSession(id, { status: "running" });
    });
    pi.on("agent_end", async () => {
        patchSession(id, { status: "idle" });
    });
    pi.on("session_shutdown", async () => {
        markSessionStopped(id);
    });
    pi.registerCommand("workbench", {
        description: "Show pi-workbench usage information",
        handler: async (_args, ctx) => {
            if (commandExists("pi-workbench")) {
                ctx.ui.notify("Run `pi-workbench` from your shell to open the session switcher.", "info");
            }
            else {
                ctx.ui.notify("pi-workbench CLI was not found on PATH. Install with `pi install npm:pi-workbench`, or run `npm link` while developing locally.", "warning");
            }
        },
    });
}
function commandExists(command) {
    try {
        execFileSync("sh", ["-lc", `command -v ${command}`], { stdio: "ignore" });
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=extension.js.map