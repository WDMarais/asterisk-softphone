// PBX-free stand-in for SipUa, selected by VITE_PBX_MOCK (see config.ts / main.ts).
// Satisfies the same RegistrationClient contract but speaks no SIP and opens no
// socket, so the registration UI + FSM can be driven with no live PBX. It does
// NOT import sip.js — the real transport stays isolated to ua.ts.
//
// Behaviour is deliberately minimal: register() resolves immediately (mirroring
// "REGISTER sent"), then emits an outcome on a short timer so the REGISTERING
// badge is briefly visible, exercising OFFLINE -> REGISTERING -> AVAILABLE. The
// password "fail" drives the REGISTRATION_FAILED path instead, so both branches
// are reachable in dev.

import type { OutcomeListener, RegistrationClient } from "./ua";
import type { SoftphoneConfig } from "../config";

/** Password that triggers a simulated rejection rather than a successful register. */
export const MOCK_FAIL_PASSWORD = "fail";

/** Delay before the mock emits its outcome, ms. Long enough to see REGISTERING. */
const MOCK_LATENCY_MS = 400;

export class MockSipUa implements RegistrationClient {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private registered = false;

  // config is accepted for parity with SipUa / the factory contract, but the
  // mock needs none of it — hence a plain ignored parameter, not a stored field.
  constructor(
    _config: SoftphoneConfig,
    private readonly onOutcome: OutcomeListener,
    private readonly latencyMs: number = MOCK_LATENCY_MS,
  ) {}

  async register(password: string): Promise<void> {
    this.clearTimer();
    this.emitLater(() => {
      if (password === MOCK_FAIL_PASSWORD) {
        this.registered = false;
        this.onOutcome({ kind: "failed", reason: "403 Forbidden (mock)" });
      } else {
        this.registered = true;
        this.onOutcome({ kind: "registered" });
      }
    });
  }

  async unregister(): Promise<void> {
    this.clearTimer();
    if (this.registered) {
      this.registered = false;
      this.onOutcome({ kind: "unregistered" });
    }
  }

  private emitLater(fn: () => void): void {
    // latency 0 (e.g. in tests with fake timers) still defers via setTimeout, so
    // the outcome stays asynchronous like the real REGISTER round-trip.
    this.timer = setTimeout(fn, this.latencyMs);
  }

  private clearTimer(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}
