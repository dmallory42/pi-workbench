import { dirname } from "node:path";
import { mkdirSync, watch, type FSWatcher } from "node:fs";
import { getRegistryPath } from "./registry.js";

export interface RegistryWatcherOptions {
  registryPath?: string;
  debounceMs?: number;
  watchFn?: typeof watch;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

export function watchRegistryChanges(onChange: () => void, options: RegistryWatcherOptions = {}): FSWatcher | undefined {
  const registryPath = options.registryPath ?? getRegistryPath();
  const watchDir = dirname(registryPath);
  const debounceMs = options.debounceMs ?? 25;
  const watchFn = options.watchFn ?? watch;
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
  let pending: ReturnType<typeof setTimeout> | undefined;

  const scheduleChange = () => {
    if (pending) clearTimeoutFn(pending);
    pending = setTimeoutFn(() => {
      pending = undefined;
      onChange();
    }, debounceMs);
  };

  try {
    mkdirSync(watchDir, { recursive: true });
    const watcher = watchFn(watchDir, (_eventType, filename) => {
      if (!filename || registryPath.endsWith(String(filename))) scheduleChange();
    });
    watcher.on("close", () => {
      if (pending) clearTimeoutFn(pending);
      pending = undefined;
    });
    watcher.on("error", () => {
      if (pending) clearTimeoutFn(pending);
      pending = undefined;
    });
    return watcher;
  } catch {
    return undefined;
  }
}
