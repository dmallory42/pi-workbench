import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
export const DEFAULT_STALE_MS = 30_000;
export function getStateDir() {
    return process.env.PI_WORKBENCH_STATE_DIR || join(homedir(), ".pi", "workbench");
}
export function getRegistryPath() {
    return join(getStateDir(), "sessions.json");
}
export function createEmptyRegistry() {
    return { version: 1, sessions: [], recentProjects: [] };
}
export function readRegistry(path = getRegistryPath()) {
    try {
        const raw = JSON.parse(readFileSync(path, "utf8"));
        return {
            version: 1,
            sessions: Array.isArray(raw.sessions) ? raw.sessions.filter(isSessionLike) : [],
            recentProjects: Array.isArray(raw.recentProjects)
                ? raw.recentProjects.filter((entry) => typeof entry === "string")
                : [],
        };
    }
    catch {
        return createEmptyRegistry();
    }
}
export function writeRegistry(registry, path = getRegistryPath()) {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
    renameSync(tmp, path);
}
export function upsertSession(session, path = getRegistryPath()) {
    const registry = readRegistry(path);
    const index = registry.sessions.findIndex((entry) => entry.id === session.id);
    if (index >= 0)
        registry.sessions[index] = session;
    else
        registry.sessions.push(session);
    registry.recentProjects = addRecentProject(registry.recentProjects, session.cwd);
    writeRegistry(registry, path);
    return registry;
}
export function patchSession(id, patch, path = getRegistryPath()) {
    const registry = readRegistry(path);
    const now = Date.now();
    const index = registry.sessions.findIndex((entry) => entry.id === id);
    if (index >= 0) {
        registry.sessions[index] = { ...registry.sessions[index], ...patch, updatedAt: now };
    }
    writeRegistry(registry, path);
    return registry;
}
export function markSessionStopped(id, path = getRegistryPath()) {
    return patchSession(id, { status: "stopped" }, path);
}
export function removeSession(id, path = getRegistryPath()) {
    const registry = readRegistry(path);
    registry.sessions = registry.sessions.filter((entry) => entry.id !== id);
    writeRegistry(registry, path);
    return registry;
}
export function withStaleSessions(registry, now = Date.now(), staleMs = DEFAULT_STALE_MS) {
    return {
        ...registry,
        sessions: registry.sessions.map((session) => {
            if (session.status !== "stopped" && now - session.updatedAt > staleMs) {
                return { ...session, status: "stopped" };
            }
            return session;
        }),
    };
}
export function addRecentProject(projects, cwd, limit = 20) {
    const next = [cwd, ...projects.filter((entry) => entry !== cwd)];
    return next.slice(0, limit);
}
export function formatSessionName(cwd, fallback = "Pi session") {
    const trimmed = cwd.replace(/\/+$/, "");
    const name = trimmed.split("/").filter(Boolean).at(-1);
    return name || fallback;
}
function isSessionLike(value) {
    if (!value || typeof value !== "object")
        return false;
    const record = value;
    return (typeof record.id === "string" &&
        typeof record.cwd === "string" &&
        typeof record.displayName === "string" &&
        typeof record.createdAt === "number" &&
        typeof record.updatedAt === "number" &&
        ["idle", "thinking", "running", "stopped"].includes(String(record.status)));
}
//# sourceMappingURL=registry.js.map