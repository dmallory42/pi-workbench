import { execFileSync } from "node:child_process";

export interface GitInfo {
  gitBranch?: string;
  gitDirty?: boolean;
}

export function getGitInfo(cwd: string): GitInfo {
  const branch = runGit(cwd, ["branch", "--show-current"]);
  if (!branch) return {};
  const status = runGit(cwd, ["status", "--porcelain"]);
  return { gitBranch: branch, gitDirty: status.length > 0 };
}

function runGit(cwd: string, args: string[]): string {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}
