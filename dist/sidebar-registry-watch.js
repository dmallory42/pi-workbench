import { dirname } from "node:path";
import { mkdirSync, watch } from "node:fs";
import { getRegistryPath } from "./registry.js";
export function watchRegistryChanges(onChange, options = {}) {
    const registryPath = options.registryPath ?? getRegistryPath();
    const watchDir = dirname(registryPath);
    const debounceMs = options.debounceMs ?? 25;
    const watchFn = options.watchFn ?? watch;
    const setTimeoutFn = options.setTimeoutFn ?? setTimeout;
    const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
    let pending;
    const scheduleChange = () => {
        if (pending)
            clearTimeoutFn(pending);
        pending = setTimeoutFn(() => {
            pending = undefined;
            onChange();
        }, debounceMs);
    };
    try {
        mkdirSync(watchDir, { recursive: true });
        const watcher = watchFn(watchDir, (_eventType, filename) => {
            if (!filename || registryPath.endsWith(String(filename)))
                scheduleChange();
        });
        watcher.on("close", () => {
            if (pending)
                clearTimeoutFn(pending);
            pending = undefined;
        });
        watcher.on("error", () => {
            if (pending)
                clearTimeoutFn(pending);
            pending = undefined;
        });
        return watcher;
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=sidebar-registry-watch.js.map