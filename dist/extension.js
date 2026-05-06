import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getGitInfo } from "./git-info.js";
import { formatSessionName, markSessionStopped, readRegistry, upsertSession } from "./registry.js";
const EXTENSION_VERSION = readPackageVersion();
export default function piWorkbenchExtension(pi) {
    const globalState = globalThis;
    const loadedKey = Symbol.for("pi-workbench.extension.loaded");
    const loaded = globalState[loadedKey];
    if (loaded && typeof loaded === "object" && loaded.version === EXTENSION_VERSION)
        return;
    const owner = Symbol("pi-workbench.extension.owner");
    globalState[loadedKey] = { owner, version: EXTENSION_VERSION };
    const startedAt = Date.now();
    const id = process.env.PI_WORKBENCH_SESSION_ID || `${process.pid}-${startedAt}`;
    const cwd = process.cwd();
    const tmuxPaneId = process.env.TMUX_PANE;
    const tmuxSession = process.env.PI_WORKBENCH_TMUX_SESSION;
    const managed = process.env.PI_WORKBENCH_MANAGED === "1";
    let currentStatus = "ready";
    let currentModel;
    const heartbeat = setInterval(() => write(currentStatus), 10_000);
    heartbeat.unref?.();
    function write(status) {
        currentStatus = status;
        const existing = readRegistry().sessions.find((session) => session.id === id);
        const gitInfo = getGitInfo(cwd);
        upsertSession({
            id,
            pid: process.pid,
            cwd,
            displayName: pi.getSessionName?.() || formatSessionName(cwd),
            customName: existing?.customName,
            model: currentModel ?? existing?.model,
            status,
            tmuxPaneId,
            tmuxSession,
            gitBranch: gitInfo.gitBranch ?? existing?.gitBranch,
            gitDirty: gitInfo.gitBranch ? gitInfo.gitDirty : existing?.gitDirty,
            managed,
            createdAt: existing?.createdAt ?? startedAt,
            updatedAt: Date.now(),
        });
    }
    pi.on("session_start", async (_event, ctx) => {
        write("ready");
        if (!commandExists("pi-workbench")) {
            ctx.ui.notify("pi-workbench CLI was not found on PATH. Install with `pi install npm:pi-workbench`, or run `npm link` while developing locally.", "warning");
        }
    });
    pi.on("model_select", async (event) => {
        currentModel = `${event.model.provider}/${event.model.id}`;
        write(currentStatus);
    });
    pi.on("input", async (event) => {
        if (event.source !== "extension")
            write("running");
        return { action: "continue" };
    });
    pi.on("before_agent_start", async () => {
        write("running");
    });
    pi.on("agent_start", async () => {
        write("running");
    });
    pi.on("message_end", async (event) => {
        if (event.message.role === "assistant" && event.message.stopReason !== "toolUse")
            write("ready");
    });
    pi.on("agent_end", async () => {
        write("ready");
    });
    pi.on("session_shutdown", async (event) => {
        clearInterval(heartbeat);
        const currentLoaded = globalState[loadedKey];
        if (currentLoaded && typeof currentLoaded === "object" && currentLoaded.owner === owner)
            delete globalState[loadedKey];
        if (!event || event.reason === "quit")
            markSessionStopped(id);
    });
    pi.registerCommand("workbench", {
        description: "Show pi-workbench usage or diagnostics",
        handler: async (args, ctx) => {
            if (!commandExists("pi-workbench")) {
                ctx.ui.notify("Pi Workbench extension is loaded, but `pi-workbench` is not on PATH. Published install: `pi install npm:pi-workbench`. Local dev: `cd ~/projects/pi-workbench && npm link`.", "warning");
                return;
            }
            if (args.trim() === "doctor") {
                const output = execFileSync("pi-workbench", ["doctor"], { encoding: "utf8" });
                ctx.ui.notify(output, "info");
                return;
            }
            ctx.ui.notify("Run `pi-workbench` from your shell to open the session switcher. Use `/workbench doctor` for diagnostics.", "info");
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
function readPackageVersion() {
    try {
        const packagePath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
        const parsed = JSON.parse(readFileSync(packagePath, "utf8"));
        return typeof parsed.version === "string" ? parsed.version : "unknown";
    }
    catch {
        return "unknown";
    }
}
//# sourceMappingURL=extension.js.map