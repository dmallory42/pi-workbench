import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type WorkbenchStatus = "idle" | "thinking" | "running" | "stopped";

export interface WorkbenchSession {
  id: string;
  pid?: number;
  cwd: string;
  displayName: string;
  status: WorkbenchStatus;
  tmuxPaneId?: string;
  tmuxSession?: string;
  model?: string;
  createdAt: number;
  updatedAt: number;
  managed?: boolean;
}

export interface WorkbenchRegistry {
  version: 1;
  sessions: WorkbenchSession[];
  recentProjects: string[];
}

export const DEFAULT_STALE_MS = 30_000;

export function getStateDir(): string {
  return process.env.PI_WORKBENCH_STATE_DIR || join(homedir(), ".pi", "workbench");
}

export function getRegistryPath(): string {
  return join(getStateDir(), "sessions.json");
}

export function createEmptyRegistry(): WorkbenchRegistry {
  return { version: 1, sessions: [], recentProjects: [] };
}

export function readRegistry(path = getRegistryPath()): WorkbenchRegistry {
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<WorkbenchRegistry>;
    return {
      version: 1,
      sessions: Array.isArray(raw.sessions) ? raw.sessions.filter(isSessionLike) : [],
      recentProjects: Array.isArray(raw.recentProjects)
        ? raw.recentProjects.filter((entry): entry is string => typeof entry === "string")
        : [],
    };
  } catch {
    return createEmptyRegistry();
  }
}

export function writeRegistry(registry: WorkbenchRegistry, path = getRegistryPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

export function upsertSession(session: WorkbenchSession, path = getRegistryPath()): WorkbenchRegistry {
  const registry = readRegistry(path);
  const index = registry.sessions.findIndex((entry) => entry.id === session.id);
  if (index >= 0) registry.sessions[index] = session;
  else registry.sessions.push(session);
  registry.recentProjects = addRecentProject(registry.recentProjects, session.cwd);
  writeRegistry(registry, path);
  return registry;
}

export function patchSession(
  id: string,
  patch: Partial<Omit<WorkbenchSession, "id" | "createdAt">>,
  path = getRegistryPath(),
): WorkbenchRegistry {
  const registry = readRegistry(path);
  const now = Date.now();
  const index = registry.sessions.findIndex((entry) => entry.id === id);
  if (index >= 0) {
    registry.sessions[index] = { ...registry.sessions[index], ...patch, updatedAt: now };
  }
  writeRegistry(registry, path);
  return registry;
}

export function markSessionStopped(id: string, path = getRegistryPath()): WorkbenchRegistry {
  return patchSession(id, { status: "stopped" }, path);
}

export function removeSession(id: string, path = getRegistryPath()): WorkbenchRegistry {
  const registry = readRegistry(path);
  registry.sessions = registry.sessions.filter((entry) => entry.id !== id);
  writeRegistry(registry, path);
  return registry;
}

export function withStaleSessions(registry: WorkbenchRegistry, now = Date.now(), staleMs = DEFAULT_STALE_MS): WorkbenchRegistry {
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

export function addRecentProject(projects: string[], cwd: string, limit = 20): string[] {
  const next = [cwd, ...projects.filter((entry) => entry !== cwd)];
  return next.slice(0, limit);
}

export function formatSessionName(cwd: string, fallback = "Pi session"): string {
  const trimmed = cwd.replace(/\/+$/, "");
  const name = trimmed.split("/").filter(Boolean).at(-1);
  return name || fallback;
}

function isSessionLike(value: unknown): value is WorkbenchSession {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.cwd === "string" &&
    typeof record.displayName === "string" &&
    typeof record.createdAt === "number" &&
    typeof record.updatedAt === "number" &&
    ["idle", "thinking", "running", "stopped"].includes(String(record.status))
  );
}
