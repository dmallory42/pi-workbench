import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { completeDirectoryPath } from "../src/path-completion.js";

let tmp: string | undefined;

afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = undefined;
});

function fixture() {
  tmp = mkdtempSync(join(process.cwd(), ".tmp-path-completion-"));
  mkdirSync(join(tmp, "projects"));
  mkdirSync(join(tmp, "project-alpha"));
  mkdirSync(join(tmp, "src"));
  mkdirSync(join(tmp, "src", "app"));
  mkdirSync(join(tmp, "src", "api"));
  mkdirSync(join(tmp, ".config"));
  return tmp;
}

describe("completeDirectoryPath", () => {
  it("completes a unique relative directory and appends a slash", () => {
    const cwd = fixture();
    expect(completeDirectoryPath("project-a", cwd, cwd)).toEqual({ value: "project-alpha/", matched: true, ambiguous: false });
  });

  it("extends to the longest common prefix for ambiguous matches", () => {
    const cwd = fixture();
    expect(completeDirectoryPath("src/a", cwd, cwd)).toEqual({ value: "src/ap", matched: true, ambiguous: true });
  });

  it("completes tilde paths while preserving the tilde display", () => {
    const cwd = fixture();
    expect(completeDirectoryPath("~/project-a", cwd, cwd)).toEqual({ value: "~/project-alpha/", matched: true, ambiguous: false });
  });

  it("does not include hidden directories unless the fragment starts with dot", () => {
    const cwd = fixture();
    expect(completeDirectoryPath("c", cwd, cwd)).toEqual({ value: "c", matched: false, ambiguous: false });
    expect(completeDirectoryPath(".", cwd, cwd)).toEqual({ value: ".config/", matched: true, ambiguous: false });
  });
});
