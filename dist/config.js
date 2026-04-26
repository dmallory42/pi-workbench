import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getStateDir } from "./registry.js";
export const DEFAULT_CONFIG = {
    sidebarWidth: 32,
    hideTmuxStatus: true,
};
export function getConfigPath() {
    return join(getStateDir(), "config.json");
}
export function readConfig(path = getConfigPath()) {
    if (!existsSync(path))
        return DEFAULT_CONFIG;
    try {
        const raw = JSON.parse(readFileSync(path, "utf8"));
        return {
            sidebarWidth: clampWidth(Number(raw.sidebarWidth) || DEFAULT_CONFIG.sidebarWidth),
            hideTmuxStatus: Boolean(raw.hideTmuxStatus ?? DEFAULT_CONFIG.hideTmuxStatus),
        };
    }
    catch {
        return DEFAULT_CONFIG;
    }
}
export function writeConfig(config, path = getConfigPath()) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify({ ...config, sidebarWidth: clampWidth(config.sidebarWidth) }, null, 2)}\n`, "utf8");
}
export function getSidebarWidth() {
    return clampWidth(Number(process.env.PI_WORKBENCH_SIDEBAR_WIDTH) || readConfig().sidebarWidth);
}
function clampWidth(width) {
    return Math.max(24, Math.min(48, Math.floor(width)));
}
//# sourceMappingURL=config.js.map