// SIP.js UserAgent wrapper — registration only, for now. Registration needs no
// media, so this slice doesn't touch WebRTC/RTP (and so isn't blocked on the
// AWS SG RTP gate). Inbound/outbound call handling lands in the next slice.
//
// Emits coarse registration outcomes; the controller (ui/registration.ts) maps
// them onto AgentEvents and drives the FSM. This module owns SIP.js; nothing
// else imports it.

import type { UserAgent, Registerer } from "sip.js";
import type { SoftphoneConfig } from "../config";

export type RegistrationOutcome =
  | { kind: "registered" }
  | { kind: "failed"; reason: string }
  | { kind: "unregistered" };

/** Callback the UA invokes with each coarse registration outcome. */
export type OutcomeListener = (outcome: RegistrationOutcome) => void;

/**
 * The narrow contract the registration controller depends on. SipUa is the real,
 * sip.js-backed implementation; MockSipUa (sip/mockUa.ts) is the PBX-free one.
 * The controller imports only this interface, so it never pulls in sip.js.
 */
export interface RegistrationClient {
  register(password: string): Promise<void>;
  unregister(): Promise<void>;
}

/**
 * Builds a RegistrationClient from a config + outcome listener. Lets the
 * composition root (main.ts) choose the real vs mock implementation while the
 * controller stays agnostic.
 */
export type RegistrationClientFactory = (
  config: SoftphoneConfig,
  onOutcome: OutcomeListener,
) => RegistrationClient;

export class SipUa implements RegistrationClient {
  private ua: UserAgent | undefined;
  private registerer: Registerer | undefined;

  constructor(
    private readonly config: SoftphoneConfig,
    private readonly onOutcome: OutcomeListener,
  ) {}

  /**
   * Connect the transport and REGISTER as the configured user. Resolves once the
   * REGISTER request has been sent; the actual registered/failed result arrives
   * asynchronously via onOutcome.
   */
  async register(password: string): Promise<void> {
    // Discard any prior attempt (e.g. a failed registration being retried).
    // Network-free — must NOT send an un-REGISTER (the prior registerer may
    // never have registered, and SIP.js rejects unregister() in that case).
    await this.teardown();

    // Load sip.js lazily so it stays out of the initial bundle (and out of the
    // mock-mode graph entirely) — only a real registration pulls in the ~540kB dep.
    const { UserAgent, Registerer, RegistererState } = await import("sip.js");

    const uri = UserAgent.makeURI(`sip:${this.config.sipUser}@${this.config.sipDomain}`);
    if (!uri) throw new Error(`invalid SIP URI for user ${this.config.sipUser}`);

    this.ua = new UserAgent({
      uri,
      transportOptions: { server: this.config.wsServer },
      authorizationUsername: this.config.sipUser,
      authorizationPassword: password,
      logLevel: "warn",
    });

    try {
      await this.ua.start(); // open the WebSocket transport
    } catch (err) {
      this.onOutcome({ kind: "failed", reason: `transport: ${describeError(err)}` });
      return;
    }

    this.registerer = new Registerer(this.ua);
    this.registerer.stateChange.addListener((state) => {
      if (state === RegistererState.Registered) this.onOutcome({ kind: "registered" });
      else if (state === RegistererState.Unregistered) this.onOutcome({ kind: "unregistered" });
    });

    // onReject covers SIP rejections (e.g. 403 bad credentials); the catch covers
    // transport/timeout failures while sending.
    try {
      await this.registerer.register({
        requestDelegate: {
          onReject: (response) => {
            const { statusCode, reasonPhrase } = response.message;
            this.onOutcome({ kind: "failed", reason: `${statusCode} ${reasonPhrase ?? ""}`.trim() });
          },
        },
      });
    } catch (err) {
      this.onOutcome({ kind: "failed", reason: describeError(err) });
    }
  }

  /**
   * Unregister (best-effort) then tear down. Idempotent: safe when not
   * registered — only sends an un-REGISTER if we actually hold a registration.
   */
  async unregister(): Promise<void> {
    if (this.registerer) {
      const { RegistererState } = await import("sip.js");
      if (this.registerer.state === RegistererState.Registered) {
        try {
          await this.registerer.unregister();
        } catch {
          // best-effort; tear down regardless
        }
      }
    }
    await this.teardown();
  }

  /** Drop the UA/registerer locally. Network-free (no un-REGISTER) and never throws. */
  private async teardown(): Promise<void> {
    try {
      await this.ua?.stop();
    } catch {
      // already stopped / transport gone
    }
    this.registerer = undefined;
    this.ua = undefined;
  }
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
