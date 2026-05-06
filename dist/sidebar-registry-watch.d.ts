import { watch, type FSWatcher } from "node:fs";
export interface RegistryWatcherOptions {
    registryPath?: string;
    debounceMs?: number;
    watchFn?: typeof watch;
    setTimeoutFn?: typeof setTimeout;
    clearTimeoutFn?: typeof clearTimeout;
}
export declare function watchRegistryChanges(onChange: () => void, options?: RegistryWatcherOptions): FSWatcher | undefined;
