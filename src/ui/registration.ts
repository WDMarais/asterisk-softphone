// Registration screen — the first Phase B slice. A password field + Go Online
// button that registers 6003 over wss and drives the FSM, surfacing the live
// AgentState as a coloured badge. Vanilla DOM; no framework.

import { AgentState, AgentEvent } from "../fsm/agentState";
import { AgentStateMachine } from "../fsm/machine";
import type { RegistrationClientFactory } from "../sip/ua";
import type { SoftphoneConfig } from "../config";

// Badge colour per state — green = good, amber = transient, red = failed, grey = offline.
const BADGE_CLASS: Partial<Record<AgentState, string>> = {
  [AgentState.OFFLINE]: "badge-idle",
  [AgentState.REGISTERING]: "badge-pending",
  [AgentState.AVAILABLE]: "badge-ok",
  [AgentState.REGISTRATION_FAILED]: "badge-error",
};

export function mountRegistration(
  root: HTMLElement,
  config: SoftphoneConfig,
  makeClient: RegistrationClientFactory,
): void {
  const machine = new AgentStateMachine();

  // --- DOM ---
  root.innerHTML = `
    <main class="card">
      <h1>Softphone <small>${config.sipUser}@${config.sipDomain}</small></h1>
      <div class="status">
        <span id="badge" class="badge">OFFLINE</span>
        <span id="reason" class="reason"></span>
      </div>
      <label class="field">
        <span>SIP password</span>
        <input id="password" type="password" autocomplete="off" placeholder="6003 password" />
      </label>
      <div class="actions">
        <button id="online" type="button">Go Online</button>
        <button id="offline" type="button" hidden>Go Offline</button>
      </div>
      <p class="hint">Connecting to <code>${config.wsServer}</code></p>
    </main>
  `;

  const badge = root.querySelector<HTMLSpanElement>("#badge")!;
  const reason = root.querySelector<HTMLSpanElement>("#reason")!;
  const password = root.querySelector<HTMLInputElement>("#password")!;
  const onlineBtn = root.querySelector<HTMLButtonElement>("#online")!;
  const offlineBtn = root.querySelector<HTMLButtonElement>("#offline")!;

  const ua = makeClient(config, (outcome) => {
    // Map SIP outcomes onto FSM events — only when the current state expects them,
    // so stray SIP.js callbacks can't force an illegal transition.
    if (outcome.kind === "registered" && machine.state === AgentState.REGISTERING) {
      machine.dispatch(AgentEvent.REGISTER_OK);
    } else if (outcome.kind === "failed" && machine.state === AgentState.REGISTERING) {
      reason.textContent = outcome.reason;
      machine.dispatch(AgentEvent.REGISTER_FAIL);
    }
    // "unregistered" needs no dispatch — Go Offline already moved the FSM.
  });

  // --- render on every state change ---
  machine.onChange(render);
  render(machine.state);

  function render(state: AgentState): void {
    badge.textContent = state;
    badge.className = `badge ${BADGE_CLASS[state] ?? ""}`;

    const offline = state === AgentState.OFFLINE;
    const failed = state === AgentState.REGISTRATION_FAILED;
    const available = state === AgentState.AVAILABLE;
    const busy = state === AgentState.REGISTERING;

    onlineBtn.hidden = !(offline || failed);
    onlineBtn.textContent = failed ? "Retry" : "Go Online";
    onlineBtn.disabled = busy;
    offlineBtn.hidden = !available;
    password.disabled = !(offline || failed);
    if (!failed) reason.textContent = available || busy ? "" : reason.textContent;
  }

  // --- actions ---
  onlineBtn.addEventListener("click", () => {
    if (!password.value) {
      reason.textContent = "Enter the SIP password first.";
      return;
    }
    reason.textContent = "";
    // OFFLINE → REGISTERING, or REGISTRATION_FAILED → REGISTERING (retry).
    machine.dispatch(machine.state === AgentState.REGISTRATION_FAILED ? AgentEvent.RETRY : AgentEvent.START_REGISTER);
    // Surface a thrown register() as a failure rather than hanging on REGISTERING.
    ua.register(password.value).catch((err: unknown) => {
      if (machine.state !== AgentState.REGISTERING) return;
      reason.textContent = err instanceof Error ? err.message : String(err);
      machine.dispatch(AgentEvent.REGISTER_FAIL);
    });
  });

  offlineBtn.addEventListener("click", () => {
    machine.dispatch(AgentEvent.UNREGISTER); // AVAILABLE → OFFLINE
    void ua.unregister();
  });
}
