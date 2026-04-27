#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { getConfigPath, readConfig } from "./config.js";
import { getRegistryPath, readRegistry, removeSession, withStaleSessions } from "./registry.js";
import { hasSession, hasTmux, listPanes, tmux } from "./tmux.js";
import { DEFAULT_WORKBENCH_SESSION, createWorkbench, ensureWorkbench, getWorkbenchPaneIds, resetWorkbench, tryTmux } from "./workbench.js";

interface Args {
  command: string;
  session: string;
  clearRegistry: boolean;
  stopped: boolean;
  json: boolean;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!hasTmux()) {
    console.error("pi-workbench requires tmux, but tmux was not found on PATH.");
    console.error("Install tmux, then run pi-workbench again. On macOS: brew install tmux");
    process.exit(1);
  }

  if (args.command === "smoke") return runSmoke();
  if (args.command === "reset") return runReset(args);
  if (args.command === "doctor") return runDoctor(args);
  if (args.command === "prune") return runPrune(args);
  if (args.command !== "run") return usage(1);

  ensureWorkbench(args.session);
  tmux(["attach-session", "-t", args.session], { stdio: "inherit" });
}

function parseArgs(argv: string[]): Args {
  let command = "run";
  let session = process.env.PI_WORKBENCH_TMUX_SESSION || DEFAULT_WORKBENCH_SESSION;
  let clearRegistry = false;
  let stopped = false;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--session" && argv[i + 1]) session = argv[++i];
    else if (arg === "--clear-registry") clearRegistry = true;
    else if (arg === "--stopped") stopped = true;
    else if (arg === "--json") json = true;
    else if (arg === "--help" || arg === "-h") command = "help";
    else if (!arg.startsWith("-") && command === "run") command = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return { command, session, clearRegistry, stopped, json };
}

function usage(code = 0): never {
  console.log(`Usage: pi-workbench [command] [options]\n\nCommands:\n  run       Start or attach to the workbench (default)\n  smoke     Run automated tmux smoke test\n  doctor    Print environment diagnostics\n  reset     Kill the workbench tmux session\n  prune     Remove stale registry entries\n\nOptions:\n  --session <name>      tmux session name\n  --clear-registry      with reset, remove stopped/stale registry entries\n  --stopped             with prune, remove all stopped entries too\n  --json                with doctor, emit JSON`);
  process.exit(code);
}

function runReset(args: Args) {
  const killed = resetWorkbench(args.session);
  let pruned = 0;
  if (args.clearRegistry) pruned = pruneRegistry(true);
  console.log(`${killed ? "Killed" : "No"} tmux session: ${args.session}`);
  if (args.clearRegistry) console.log(`Removed ${pruned} registry entr${pruned === 1 ? "y" : "ies"}`);
}

function runPrune(args: Args) {
  const pruned = pruneRegistry(args.stopped);
  console.log(`Removed ${pruned} registry entr${pruned === 1 ? "y" : "ies"}`);
}

function pruneRegistry(removeStopped: boolean): number {
  const registry = withStaleSessions(readRegistry());
  const before = registry.sessions.length;
  for (const session of registry.sessions) {
    const paneMissing = session.tmuxPaneId ? !paneExists(session.tmuxPaneId) : session.status === "stopped";
    if ((session.status === "stopped" && removeStopped) || (session.status !== "stopped" && paneMissing)) {
      removeSession(session.id);
    }
  }
  return before - readRegistry().sessions.length;
}

function paneExists(paneId: string): boolean {
  return tryTmux(["display-message", "-p", "-t", paneId, "#{pane_id}"]) === paneId;
}

function runDoctor(args: Args) {
  const registry = withStaleSessions(readRegistry());
  const live = registry.sessions.filter((entry) => entry.status !== "stopped").length;
  const stoppedCount = registry.sessions.length - live;
  const diagnostics = {
    tmux: commandOutput("tmux", ["-V"]),
    pi: commandPath("pi"),
    piWorkbench: commandPath("pi-workbench"),
    extendedKeys: tryTmux(["show-options", "-gqv", "extended-keys"]),
    extendedKeysFormat: tryTmux(["show-options", "-gqv", "extended-keys-format"]),
    session: args.session,
    sessionExists: hasSession(args.session),
    registrySessions: registry.sessions.length,
    live,
    stopped: stoppedCount,
    registryPath: getRegistryPath(),
    configPath: getConfigPath(),
    config: readConfig(),
  };
  if (args.json) {
    console.log(JSON.stringify(diagnostics, null, 2));
    return;
  }
  line(Boolean(diagnostics.tmux), `tmux found: ${diagnostics.tmux || "missing"}`);
  line(Boolean(diagnostics.pi), `pi found: ${diagnostics.pi || "missing"}`);
  line(Boolean(diagnostics.piWorkbench), `pi-workbench found: ${diagnostics.piWorkbench || "missing"}`);
  line(diagnostics.extendedKeys === "on", `tmux extended-keys: ${diagnostics.extendedKeys || "unknown"}`);
  line(diagnostics.extendedKeysFormat === "csi-u", `tmux extended-keys-format: ${diagnostics.extendedKeysFormat || "unknown"}`);
  line(true, `workbench tmux session: ${diagnostics.sessionExists ? "exists" : "not running"} (${args.session})`);
  line(true, `registry: ${diagnostics.registryPath}`);
  line(true, `config: ${diagnostics.configPath}`);
  line(true, `registry sessions: ${diagnostics.registrySessions} (${live} live, ${stoppedCount} stopped)`);
  if (diagnostics.extendedKeys !== "on" || diagnostics.extendedKeysFormat !== "csi-u") {
    console.log("\nRecommended ~/.tmux.conf:");
    console.log("set -g extended-keys on");
    console.log("set -g extended-keys-format csi-u");
  }
}

function line(ok: boolean, text: string) {
  console.log(`${ok ? "✓" : "⚠"} ${text}`);
}

function commandPath(command: string): string {
  return commandOutput("sh", ["-lc", `command -v ${command}`]);
}

function commandOutput(command: string, args: string[]): string {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function runSmoke() {
  const session = `pi-workbench-smoke-${process.pid}`;
  const fakePi = "sh -lc 'echo FAKE_PI_READY; sleep 1000000'";
  const fakeSidebar = "sh -lc 'echo FAKE_SIDEBAR_READY; sleep 1000000'";
  tryTmux(["kill-session", "-t", session]);

  try {
    createWorkbench(session, { piCommand: fakePi, sidebarCommand: fakeSidebar });
    const panes = tmux([
      "list-panes",
      "-t",
      `${session}:workbench`,
      "-F",
      "#{pane_index}\t#{pane_id}\t#{pane_width}\t#{pane_current_command}",
    ])
      .split("\n")
      .map((line) => line.split("\t"));

    assert(panes.length === 2, `expected 2 panes, got ${panes.length}`);
    const leftWidth = Number(panes[0][2]);
    const rightWidth = Number(panes[1][2]);
    assert(leftWidth >= 24 && leftWidth <= 48, `expected compact left pane, got width ${leftWidth}`);
    assert(rightWidth > leftWidth, `expected right pane (${rightWidth}) wider than left pane (${leftWidth})`);

    const leftCapture = tmux(["capture-pane", "-p", "-t", panes[0][1]]);
    const rightCapture = tmux(["capture-pane", "-p", "-t", panes[1][1]]);
    assert(leftCapture.includes("FAKE_SIDEBAR_READY"), "left pane did not run sidebar command");
    assert(rightCapture.includes("FAKE_PI_READY"), "right pane did not run Pi command");

    const f1Binding = tmux(["list-keys", "-T", "root", "F1"]);
    assert(f1Binding.includes("select-pane"), "F1 binding was not installed");

    const borderStyle = tmux(["show-options", "-w", "-t", `${session}:workbench`, "-qv", "pane-border-style"]);
    const activeBorderStyle = tmux(["show-options", "-w", "-t", `${session}:workbench`, "-qv", "pane-active-border-style"]);
    assert(borderStyle === activeBorderStyle, "active pane border should match inactive border");

    tmux(["new-window", "-d", "-t", session, "-n", "fake-b", "sh", "-lc", "echo FAKE_PI_B_READY; sleep 1000000"]);
    const hiddenPane = listPanes(session).find((pane) => pane.window === "fake-b")?.id;
    const rightPane = getWorkbenchPaneIds(session)[1];
    assert(Boolean(hiddenPane && rightPane), "missing panes for swap smoke");
    tmux(["swap-pane", "-s", hiddenPane!, "-t", rightPane!]);
    const swappedCapture = tmux(["capture-pane", "-p", "-t", hiddenPane!]);
    assert(swappedCapture.includes("FAKE_PI_B_READY"), "swap-pane did not move fake B into right pane");

    console.log("pi-workbench smoke passed");
  } finally {
    tryTmux(["kill-session", "-t", session]);
  }
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Smoke failed: ${message}`);
}

main();
