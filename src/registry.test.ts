import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  addRecentProject,
  createEmptyRegistry,
  readRegistry,
  removeSession,
  upsertSession,
  withStaleSessions,
} from "./registry.js";

let tempDirs: string[] = [];

function tempRegistry() {
  const dir = mkdtempSync(join(tmpdir(), "pi-workbench-test-"));
  tempDirs.push(dir);
  return join(dir, "sessions.json");
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

describe("registry", () => {
  it("returns an empty registry when missing", () => {
    expect(readRegistry(tempRegistry())).toEqual(createEmptyRegistry());
  });

  it("upserts sessions and tracks recent projects", () => {
    const path = tempRegistry();
    upsertSession(
      {
        id: "one",
        cwd: "/tmp/project",
        displayName: "project",
        status: "idle",
        createdAt: 100,
        updatedAt: 100,
      },
      path,
    );
    upsertSession(
      {
        id: "one",
        cwd: "/tmp/project",
        displayName: "renamed",
        status: "thinking",
        createdAt: 100,
        updatedAt: 200,
      },
      path,
    );

    const registry = readRegistry(path);
    expect(registry.sessions).toHaveLength(1);
    expect(registry.sessions[0].displayName).toBe("renamed");
    expect(registry.sessions[0].status).toBe("thinking");
    expect(registry.recentProjects).toEqual(["/tmp/project"]);
  });

  it("marks old live sessions stale", () => {
    const registry = withStaleSessions(
      {
        version: 1,
        recentProjects: [],
        sessions: [
          { id: "old", cwd: "/a", displayName: "a", status: "idle", createdAt: 0, updatedAt: 0 },
          { id: "new", cwd: "/b", displayName: "b", status: "running", createdAt: 0, updatedAt: 95 },
        ],
      },
      100,
      50,
    );
    expect(registry.sessions[0].status).toBe("stopped");
    expect(registry.sessions[1].status).toBe("running");
  });

  it("removes sessions", () => {
    const path = tempRegistry();
    upsertSession({ id: "one", cwd: "/tmp", displayName: "tmp", status: "idle", createdAt: 1, updatedAt: 1 }, path);
    removeSession("one", path);
    expect(readRegistry(path).sessions).toHaveLength(0);
  });

  it("deduplicates recent projects", () => {
    expect(addRecentProject(["/a", "/b"], "/b")).toEqual(["/b", "/a"]);
  });
});
