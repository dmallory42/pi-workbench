#!/usr/bin/env node
import { setInterval, setTimeout } from "node:timers";
import piWorkbenchExtension from "../extension.js";

type Handler = (event?: any, ctx?: any) => Promise<any> | any;

const ctx = { ui: { notify: () => {} } };
let handlers = new Map<string, Handler>();

function loadExtension() {
  handlers = new Map<string, Handler>();
  piWorkbenchExtension({
    on: (event: string, handler: Handler) => handlers.set(event, handler),
    registerCommand: () => {},
    getSessionName: () => "status-pi",
  } as any);
}

async function emit(event: string, payload: any = {}) {
  const handler = handlers.get(event);
  if (!handler) {
    console.log(`FAKE_STATUS_PI_MISSING_HANDLER ${event}`);
    return;
  }
  await handler(payload, ctx);
}

async function main() {
  loadExtension();
  await emit("session_start", { reason: "new" });
  console.log("FAKE_STATUS_PI_READY");

  await delay(250);
  await emit("input", { source: "interactive", text: "initial prompt" });
  console.log("FAKE_STATUS_PI_INITIAL_INPUT");

  await delay(250);
  await emit("agent_end", {});
  console.log("FAKE_STATUS_PI_INITIAL_READY");

  await delay(250);
  await emit("session_shutdown", { reason: "reload" });
  console.log("FAKE_STATUS_PI_RELOAD_SHUTDOWN");

  loadExtension();
  await emit("session_start", { reason: "resume" });
  console.log("FAKE_STATUS_PI_RELOAD_READY");

  await delay(250);
  await emit("input", { source: "interactive", text: "after reload" });
  console.log("FAKE_STATUS_PI_RELOAD_INPUT");

  setInterval(() => {}, 1000);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
