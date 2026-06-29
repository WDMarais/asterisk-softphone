// PBX-free stand-in for SipUa, selected by VITE_PBX_MOCK (see config.ts / main.ts).
// Satisfies the same PhoneClient contract but speaks no SIP and opens no socket,
// so the registration UI + FSM + dialpad can be driven with no live PBX. It does
// NOT import sip.js — the real transport stays isolated to ua.ts.
//
// Registration: register() resolves immediately (mirroring "REGISTER sent"), then
// emits an outcome on a short timer so the REGISTERING badge is briefly visible.
// Password "fail" drives the REGISTRATION_FAILED path.
//
// Calls (spec §2.3 outbound): placeCall() emits "ringing" then resolves on a timer
// per mockCallControl — a dev-panel-controlled outcome (answer / busy / unreachable
// / no-answer), preferred over reserved destinations so real numbers stay real and
// every failure mode is explicit.

import type {
  CallEvent,
  CallEventListener,
  OutcomeListener,
  PhoneClient,
} from "./ua";
import type { SoftphoneConfig } from "../config";

/** Password that triggers a simulated rejection rather than a successful register. */
export const MOCK_FAIL_PASSWORD = "fail";

/** Delay before the mock emits its registration outcome, ms. */
const MOCK_LATENCY_MS = 400;

/** How the next mock outbound call resolves. Set via the dev panel (ui/devPanel.ts). */
export type MockCallOutcome = "answer" | "busy" | "unreachable" | "no_answer";

export interface MockCallControl {
  /** Resolution for the next placeCall. */
  outcome: MockCallOutcome;
  /** Delay from "ringing" to the resolved outcome, ms. */
  latencyMs: number;
}

/**
 * Module-level dev control: the dev panel writes it, MockSipUa reads it on each
 * placeCall. Module-global (not per-instance) so the panel needn't thread a
 * reference to the client the controller constructed. Mock-only — tree-shaken
 * from real builds along with the rest of this module.
 */
export const mockCallControl: MockCallControl = { outcome: "answer", latencyMs: 1000 };

const FAILURE_REASON: Record<Exclude<MockCallOutcome, "answer">, string> = {
  busy: "Busy",
  unreachable: "Unreachable",
  no_answer: "No answer",
};

type CallState = "idle" | "ringing" | "in_call";

export class MockSipUa implements PhoneClient {
  private regTimer: ReturnType<typeof setTimeout> | undefined;
  private callTimer: ReturnType<typeof setTimeout> | undefined;
  private registered = false;
  private callState: CallState = "idle";
  private callListener: CallEventListener | undefined;

  // config is accepted for parity with SipUa / the factory contract, but the
  // mock needs none of it — hence a plain ignored parameter, not a stored field.
  constructor(
    _config: SoftphoneConfig,
    private readonly onOutcome: OutcomeListener,
    private readonly latencyMs: number = MOCK_LATENCY_MS,
  ) {}

  // --- registration ---

  async register(password: string): Promise<void> {
    this.clearRegTimer();
    this.regTimer = setTimeout(() => {
      if (password === MOCK_FAIL_PASSWORD) {
        this.registered = false;
        this.onOutcome({ kind: "failed", reason: "403 Forbidden (mock)" });
      } else {
        this.registered = true;
        this.onOutcome({ kind: "registered" });
      }
    }, this.latencyMs);
  }

  async unregister(): Promise<void> {
    this.clearRegTimer();
    if (this.registered) {
      this.registered = false;
      this.onOutcome({ kind: "unregistered" });
    }
  }

  // --- calls (spec §2.3 outbound) ---

  onCallEvent(listener: CallEventListener): void {
    this.callListener = listener;
  }

  async placeCall(destination: string): Promise<void> {
    this.clearCallTimer();
    this.callState = "ringing";
    this.emitCall({ kind: "ringing", destination });

    const { outcome, latencyMs } = mockCallControl;
    this.callTimer = setTimeout(() => {
      if (outcome === "answer") {
        this.callState = "in_call";
        this.emitCall({ kind: "answered" });
      } else {
        this.callState = "idle";
        this.emitCall({ kind: "failed", reason: FAILURE_REASON[outcome] });
      }
    }, latencyMs);
  }

  async hangup(): Promise<void> {
    this.clearCallTimer();
    if (this.callState === "idle") return; // nothing to hang up
    const reason = this.callState === "in_call" ? "Hung up" : "Cancelled";
    this.callState = "idle";
    this.emitCall({ kind: "ended", reason });
  }

  // --- internals ---

  private emitCall(event: CallEvent): void {
    this.callListener?.(event);
  }

  private clearRegTimer(): void {
    if (this.regTimer !== undefined) {
      clearTimeout(this.regTimer);
      this.regTimer = undefined;
    }
  }

  private clearCallTimer(): void {
    if (this.callTimer !== undefined) {
      clearTimeout(this.callTimer);
      this.callTimer = undefined;
    }
  }
}
