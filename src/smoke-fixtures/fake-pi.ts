#!/usr/bin/env node
import { setInterval } from "node:timers";
import { formatSessionName, upsertSession } from "../registry.js";

const id = process.env.PI_WORKBENCH_SESSION_ID || `fake-${process.pid}`;
const cwd = process.cwd();
const tmuxSession = process.env.PI_WORKBENCH_TMUX_SESSION;
const tmuxPaneId = process.env.TMUX_PANE;

upsertSession({
  id,
  pid: process.pid,
  cwd,
  displayName: formatSessionName(cwd),
  status: "ready",
  tmuxPaneId,
  tmuxSession,
  managed: true,
  gitBranch: "main",
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

console.log(`FAKE_PI_READY ${id}`);
setInterval(() => {
  upsertSession({
    id,
    pid: process.pid,
    cwd,
    displayName: formatSessionName(cwd),
    status: "ready",
    tmuxPaneId,
    tmuxSession,
    managed: true,
    gitBranch: "main",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}, 1000);
