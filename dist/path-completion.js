import { readdirSync } from "node:fs";
import { resolve } from "node:path";
export function completeDirectoryPath(input, cwd, home = "") {
    if (!input)
        return { value: input, matched: false, ambiguous: false };
    const { displayDir, lookupDir, fragment } = splitPathForCompletion(input, cwd, home);
    let names;
    try {
        names = readdirSync(lookupDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .filter((name) => (fragment.startsWith(".") ? true : !name.startsWith(".")))
            .filter((name) => name.startsWith(fragment))
            .sort((a, b) => a.localeCompare(b));
    }
    catch {
        return { value: input, matched: false, ambiguous: false };
    }
    if (names.length === 0)
        return { value: input, matched: false, ambiguous: false };
    if (names.length === 1)
        return { value: `${displayDir}${names[0]}/`, matched: true, ambiguous: false };
    const common = longestCommonPrefix(names);
    if (common.length > fragment.length)
        return { value: `${displayDir}${common}`, matched: true, ambiguous: true };
    return { value: input, matched: true, ambiguous: true };
}
function splitPathForCompletion(input, cwd, home) {
    const slash = input.lastIndexOf("/");
    const rawDir = slash >= 0 ? input.slice(0, slash + 1) : "";
    const fragment = slash >= 0 ? input.slice(slash + 1) : input;
    const displayDir = rawDir;
    let lookupDir;
    if (rawDir === "")
        lookupDir = cwd;
    else if (rawDir === "~/" || rawDir.startsWith("~/"))
        lookupDir = resolve(home || cwd, rawDir.slice(2));
    else if (rawDir.startsWith("/"))
        lookupDir = rawDir;
    else
        lookupDir = resolve(cwd, rawDir);
    return { displayDir, lookupDir, fragment };
}
function longestCommonPrefix(values) {
    if (values.length === 0)
        return "";
    let prefix = values[0];
    for (const value of values.slice(1)) {
        while (!value.startsWith(prefix))
            prefix = prefix.slice(0, -1);
    }
    return prefix;
}
//# sourceMappingURL=path-completion.js.map