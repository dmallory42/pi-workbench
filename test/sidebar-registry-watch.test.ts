import { EventEmitter } from "node:events";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { watchRegistryChanges } from "../src/sidebar-registry-watch.js";

class FakeWatcher extends EventEmitter {
  close = vi.fn(() => this.emit("close"));
}

describe("registry change watcher", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("watches the registry directory and renders promptly when sessions.json changes", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const fakeWatcher = new FakeWatcher();
    let listener: ((eventType: string, filename: string | Buffer | null) => void) | undefined;
    const watchFn = vi.fn((path, callback) => {
      listener = callback as typeof listener;
      return fakeWatcher;
    });
    const registryPath = join("/tmp", "pi-workbench", "sessions.json");

    watchRegistryChanges(onChange, { registryPath, debounceMs: 25, watchFn: watchFn as any });

    expect(watchFn).toHaveBeenCalledWith(join("/tmp", "pi-workbench"), expect.any(Function));
    listener?.("change", "sessions.json");
    vi.advanceTimersByTime(24);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("ignores unrelated files and coalesces bursts of registry writes", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const fakeWatcher = new FakeWatcher();
    let listener: ((eventType: string, filename: string | Buffer | null) => void) | undefined;
    const watchFn = vi.fn((_path, callback) => {
      listener = callback as typeof listener;
      return fakeWatcher;
    });

    watchRegistryChanges(onChange, { registryPath: "/tmp/pi-workbench/sessions.json", debounceMs: 25, watchFn: watchFn as any });

    listener?.("change", "other.json");
    vi.advanceTimersByTime(50);
    expect(onChange).not.toHaveBeenCalled();

    listener?.("rename", "sessions.json");
    vi.advanceTimersByTime(10);
    listener?.("change", "sessions.json");
    vi.advanceTimersByTime(24);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("falls back quietly when the registry directory cannot be watched", () => {
    const onChange = vi.fn();
    const watchFn = vi.fn(() => {
      throw new Error("missing directory");
    });

    expect(watchRegistryChanges(onChange, { registryPath: "/missing/sessions.json", watchFn: watchFn as any })).toBeUndefined();
    expect(onChange).not.toHaveBeenCalled();
  });
});
