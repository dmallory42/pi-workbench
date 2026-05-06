import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import piWorkbenchExtension from "../src/extension.js";
import { readRegistry } from "../src/registry.js";

type Handler = (event?: any, ctx?: any) => Promise<any> | any;

let tempDirs: string[] = [];

function tempStateDir() {
  const dir = mkdtempSync(join(tmpdir(), "pi-workbench-extension-test-"));
  tempDirs.push(dir);
  return dir;
}

function createPiHarness() {
  const handlers = new Map<string, Handler>();
  const pi = {
    on: vi.fn((event: string, handler: Handler) => handlers.set(event, handler)),
    registerCommand: vi.fn(),
    getSessionName: vi.fn(() => "repo"),
  };
  piWorkbenchExtension(pi as any);
  return { handlers, pi };
}

function setupStatusHarness(sessionId: string) {
  process.env.PI_WORKBENCH_STATE_DIR = tempStateDir();
  process.env.PI_WORKBENCH_SESSION_ID = sessionId;
  vi.spyOn(Date, "now").mockReturnValue(1000);
  return createPiHarness().handlers;
}

async function emit(handlers: Map<string, Handler>, event: string, payload: any = {}) {
  const handler = handlers.get(event);
  expect(handler, `${event} handler should be registered`).toBeTypeOf("function");
  await handler?.(payload, { ui: { notify: vi.fn() } });
}

afterEach(() => {
  delete (globalThis as Record<symbol, boolean>)[Symbol.for("pi-workbench.extension.loaded")];
  vi.restoreAllMocks();
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
  delete process.env.PI_WORKBENCH_STATE_DIR;
  delete process.env.PI_WORKBENCH_SESSION_ID;
});

describe("pi workbench extension status lifecycle", () => {
  it("tracks ready, running, ready across one prompt", async () => {
    const handlers = setupStatusHarness("session-status-test");

    await emit(handlers, "session_start");
    expect(readRegistry().sessions[0].status).toBe("ready");

    await emit(handlers, "input", { source: "interactive", text: "hello" });
    expect(readRegistry().sessions[0].status).toBe("running");

    await emit(handlers, "before_agent_start");
    expect(readRegistry().sessions[0].status).toBe("running");

    await emit(handlers, "agent_end");
    expect(readRegistry().sessions[0].status).toBe("ready");

    await emit(handlers, "session_shutdown");
  });

  it("only registers once if package discovery and explicit extension loading both load it", () => {
    process.env.PI_WORKBENCH_STATE_DIR = tempStateDir();
    process.env.PI_WORKBENCH_SESSION_ID = "duplicate-load-test";
    const first = createPiHarness();
    const second = createPiHarness();

    expect(first.handlers.size).toBeGreaterThan(0);
    expect(second.handlers.size).toBe(0);
  });

  it("allows handlers to register again after an extension runtime reload", async () => {
    process.env.PI_WORKBENCH_STATE_DIR = tempStateDir();
    process.env.PI_WORKBENCH_SESSION_ID = "runtime-reload-test";
    const first = createPiHarness();

    await emit(first.handlers, "session_start", { reason: "new" });
    await emit(first.handlers, "session_shutdown", { reason: "reload" });
    const second = createPiHarness();

    expect(second.handlers.size).toBeGreaterThan(0);
    await emit(second.handlers, "session_start", { reason: "resume" });
    await emit(second.handlers, "input", { source: "interactive", text: "hello" });
    expect(readRegistry().sessions[0]).toMatchObject({
      id: "runtime-reload-test",
      status: "running",
    });
  });

  it("recovers from a stale legacy duplicate-load guard left by an older extension", async () => {
    process.env.PI_WORKBENCH_STATE_DIR = tempStateDir();
    process.env.PI_WORKBENCH_SESSION_ID = "legacy-guard-reload-test";
    (globalThis as Record<symbol, boolean>)[Symbol.for("pi-workbench.extension.loaded")] = true;

    const reloaded = createPiHarness();

    expect(reloaded.handlers.size).toBeGreaterThan(0);
    await emit(reloaded.handlers, "input", { source: "interactive", text: "hello" });
    expect(readRegistry().sessions[0]).toMatchObject({
      id: "legacy-guard-reload-test",
      status: "running",
    });
  });

  it("allows a newly installed extension version to replace an older guard", async () => {
    process.env.PI_WORKBENCH_STATE_DIR = tempStateDir();
    process.env.PI_WORKBENCH_SESSION_ID = "version-guard-reload-test";
    (globalThis as Record<symbol, { owner: symbol; version: string }>)[Symbol.for("pi-workbench.extension.loaded")] = {
      owner: Symbol("older-owner"),
      version: "older-version",
    };

    const reloaded = createPiHarness();

    expect(reloaded.handlers.size).toBeGreaterThan(0);
    await emit(reloaded.handlers, "input", { source: "interactive", text: "hello" });
    expect(readRegistry().sessions[0]).toMatchObject({
      id: "version-guard-reload-test",
      status: "running",
    });
  });

  it("upserts a full session row on prompt status changes", async () => {
    const handlers = setupStatusHarness("upsert-status-test");

    await emit(handlers, "input", { source: "interactive", text: "hello" });

    expect(readRegistry().sessions[0]).toMatchObject({
      id: "upsert-status-test",
      displayName: "repo",
      status: "running",
    });
  });

  it("ignores extension-injected input when setting prompt status", async () => {
    const handlers = setupStatusHarness("extension-input-test");

    await emit(handlers, "session_start");
    await emit(handlers, "input", { source: "extension", text: "synthetic" });
    expect(readRegistry().sessions[0].status).toBe("ready");

    await emit(handlers, "session_shutdown");
  });

  it("marks ready when the final assistant message ends", async () => {
    const handlers = setupStatusHarness("message-end-ready-test");

    await emit(handlers, "session_start");
    await emit(handlers, "before_agent_start");
    expect(readRegistry().sessions[0].status).toBe("running");

    await emit(handlers, "message_end", { message: { role: "assistant", stopReason: "stop" } });
    expect(readRegistry().sessions[0].status).toBe("ready");

    await emit(handlers, "session_shutdown");
  });

  it("does not mark ready for assistant messages that are about to run tools", async () => {
    const handlers = setupStatusHarness("message-end-tool-use-test");

    await emit(handlers, "session_start");
    await emit(handlers, "before_agent_start");
    await emit(handlers, "message_end", { message: { role: "assistant", stopReason: "toolUse" } });
    expect(readRegistry().sessions[0].status).toBe("running");

    await emit(handlers, "session_shutdown");
  });

  it("keeps the status lifecycle independent from tool events", () => {
    const handlers = setupStatusHarness("tool-events-test");

    expect(handlers.has("tool_execution_start")).toBe(false);
    expect(handlers.has("tool_execution_end")).toBe(false);
  });
});
