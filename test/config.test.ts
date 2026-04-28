import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, readConfig, writeConfig } from "../src/config.js";

let tempDir: string | undefined;

function tempConfigPath() {
  tempDir = mkdtempSync(join(tmpdir(), "pi-workbench-config-"));
  return join(tempDir, "config.json");
}

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("config", () => {
  it("defaults mouse mode on to preserve click-to-focus behavior", () => {
    expect(readConfig("/path/that/does/not/exist.json")).toEqual(DEFAULT_CONFIG);
    expect(DEFAULT_CONFIG.mouse).toBe(true);
  });

  it("reads persisted mouse mode opt-out", () => {
    const path = tempConfigPath();
    writeFileSync(path, JSON.stringify({ mouse: false }), "utf8");
    expect(readConfig(path).mouse).toBe(false);
  });

  it("writes clamped config with mouse preference", () => {
    const path = tempConfigPath();
    writeConfig({ sidebarWidth: 100, hideTmuxStatus: false, mouse: false }, path);
    expect(readConfig(path)).toEqual({ sidebarWidth: 48, hideTmuxStatus: false, mouse: false });
  });
});
