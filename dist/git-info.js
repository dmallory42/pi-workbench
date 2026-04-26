import { execFileSync } from "node:child_process";
export function getGitInfo(cwd) {
    const branch = runGit(cwd, ["branch", "--show-current"]);
    if (!branch)
        return {};
    const status = runGit(cwd, ["status", "--porcelain"]);
    return { gitBranch: branch, gitDirty: status.length > 0 };
}
function runGit(cwd, args) {
    try {
        return execFileSync("git", ["-C", cwd, ...args], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
    }
    catch {
        return "";
    }
}
//# sourceMappingURL=git-info.js.map