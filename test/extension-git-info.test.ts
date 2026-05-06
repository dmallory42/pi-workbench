import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readRegistry } from "../src/registry.js";

const getGitInfoMock = vi.fn();

vi.mock("../src/git-info.js", () => ({
  getGitInfo: getGitInfoMock,
}));

type Handler = (event?: any, ctx?: any) => Promise<any> | any;

let tempDirs: string[] = [];

function tempStateDir() {
  const dir = mkdtempSync(join(tmpdir(), "pi-workbench-extension-git-test-"));
  tempDirs.push(dir);
  return dir;
}

async function createPiHarness() {
  const handlers = new Map<string, Handler>();
  const pi = {
    on: vi.fn((event: string, handler: Handler) => handlers.set(event, handler)),
    registerCommand: vi.fn(),
    getSessionName: vi.fn(() => "repo"),
  };
  const { default: piWorkbenchExtension } = await import("../src/extension.js");
  piWorkbenchExtension(pi as any);
  return { handlers, pi };
}

async function emit(handlers: Map<string, Handler>, event: string, payload: any = {}) {
  const handler = handlers.get(event);
  expect(handler, `${event} handler should be registered`).toBeTypeOf("function");
  await handler?.(payload, { ui: { notify: vi.fn() } });
}

afterEach(() => {
  delete (globalThis as Record<symbol, boolean>)[Symbol.for("pi-workbench.extension.loaded")];
  vi.restoreAllMocks();
  vi.resetModules();
  getGitInfoMock.mockReset();
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
  delete process.env.PI_WORKBENCH_STATE_DIR;
  delete process.env.PI_WORKBENCH_SESSION_ID;
});

describe("pi workbench extension git info", () => {
  it("preserves the last known branch when a later status heartbeat cannot read git info", async () => {
    process.env.PI_WORKBENCH_STATE_DIR = tempStateDir();
    process.env.PI_WORKBENCH_SESSION_ID = "git-preserve-test";
    vi.spyOn(Date, "now").mockReturnValue(1000);
    getGitInfoMock.mockReturnValueOnce({ gitBranch: "main", gitDirty: true }).mockReturnValueOnce({});
    const { handlers } = await createPiHarness();

    await emit(handlers, "session_start");
    expect(readRegistry().sessions[0]).toMatchObject({ gitBranch: "main", gitDirty: true });

    await emit(handlers, "agent_end");
    expect(readRegistry().sessions[0]).toMatchObject({ gitBranch: "main", gitDirty: true });
  });
});
