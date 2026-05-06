import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeRegistry } from "../src/registry.js";

const getGitInfoMock = vi.fn();

vi.mock("../src/git-info.js", () => ({
  getGitInfo: getGitInfoMock,
}));

let tempStateDir: string | undefined;
const originalStateDir = process.env.PI_WORKBENCH_STATE_DIR;

afterEach(() => {
  if (tempStateDir) rmSync(tempStateDir, { recursive: true, force: true });
  tempStateDir = undefined;
  if (originalStateDir === undefined) delete process.env.PI_WORKBENCH_STATE_DIR;
  else process.env.PI_WORKBENCH_STATE_DIR = originalStateDir;
  vi.resetModules();
  getGitInfoMock.mockReset();
});

function useTempRegistry() {
  tempStateDir = mkdtempSync(join(tmpdir(), "pi-workbench-sidebar-git-test-"));
  process.env.PI_WORKBENCH_STATE_DIR = tempStateDir;
}

describe("getDisplaySessions git info", () => {
  it("fills missing branch details from git so selected project details do not flicker", async () => {
    useTempRegistry();
    getGitInfoMock.mockReturnValue({ gitBranch: "main", gitDirty: false });
    writeRegistry({
      version: 1,
      recentProjects: [],
      sessions: [
        {
          id: "missing-branch",
          cwd: "/tmp/repo",
          displayName: "repo",
          status: "ready",
          tmuxSession: "active",
          createdAt: 1,
          updatedAt: Date.now(),
        },
      ],
    });
    const { getDisplaySessions } = await import("../src/sidebar-render.js");

    expect(getDisplaySessions("active")[0]).toMatchObject({ gitBranch: "main", gitDirty: false });
  });

  it("reuses cached branch details when a later git lookup is temporarily unavailable", async () => {
    useTempRegistry();
    writeRegistry({
      version: 1,
      recentProjects: [],
      sessions: [
        {
          id: "cached-branch",
          cwd: "/tmp/repo",
          displayName: "repo",
          status: "ready",
          tmuxSession: "active",
          gitBranch: "main",
          gitDirty: true,
          createdAt: 1,
          updatedAt: Date.now(),
        },
      ],
    });
    const { getDisplaySessions } = await import("../src/sidebar-render.js");

    expect(getDisplaySessions("active")[0]).toMatchObject({ gitBranch: "main", gitDirty: true });

    writeRegistry({
      version: 1,
      recentProjects: [],
      sessions: [
        {
          id: "cached-branch",
          cwd: "/tmp/repo",
          displayName: "repo",
          status: "ready",
          tmuxSession: "active",
          createdAt: 1,
          updatedAt: Date.now(),
        },
      ],
    });
    getGitInfoMock.mockReturnValue({});

    expect(getDisplaySessions("active")[0]).toMatchObject({ gitBranch: "main", gitDirty: true });
  });
});
