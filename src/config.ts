// Runtime configuration for the softphone. Values here are the spec defaults
// (notes/spec.md §2.1, §2.6 in the asterisk-sandbox repo); override per-deployment.

export interface SoftphoneConfig {
  /** WebRTC SIP signalling endpoint. Same-origin in dev (Vite proxy) and prod (nginx). */
  readonly wsServer: string;
  /** SIP AOR / auth username to register as. */
  readonly sipUser: string;
  /** SIP domain (Asterisk realm) — the host part of the AOR uri. */
  readonly sipDomain: string;
  /** ICE STUN servers. TURN is deferred (only needed behind symmetric NAT). */
  readonly stunServers: readonly string[];
  /** Register automatically on page load (§2.1). When false, agent clicks "Go Online". */
  readonly autoRegister: boolean;
  /** Registration / reconnect retry count before surfacing the health indicator (§2.1, §2.6). */
  readonly retryN: number;
}

// The Asterisk SIP realm for the AOR (sip:6003@<sipDomain>). This must be the
// PBX domain even in dev — the browser connects to the Vite proxy on localhost,
// but the SIP identity/domain is always the real box. wsServer, by contrast, is
// derived from the page origin: ws://localhost:5173/ws (dev, proxied) or
// wss://<domain>/ws (prod, same-origin).
//
// Sourced from Vite env (VITE_PBX_DOMAIN, set in a gitignored .env). No default
// — the deployment domain must never live in source. Fail loud if unset.
const PBX_DOMAIN = import.meta.env.VITE_PBX_DOMAIN;

// Mock mode (VITE_PBX_MOCK=1) swaps in a PBX-free RegistrationClient (see
// sip/mockUa.ts), so it needs no real deployment domain. Real mode still fails
// loud — the deployment domain must never live in source.
export const isMock = import.meta.env.VITE_PBX_MOCK === "1";
if (!PBX_DOMAIN && !isMock) {
  throw new Error("VITE_PBX_DOMAIN is not set — copy .env.example to .env and set it.");
}

export const defaultConfig: SoftphoneConfig = {
  wsServer: `${location.origin.replace(/^http/, "ws")}/ws`,
  sipUser: "6003",
  sipDomain: PBX_DOMAIN ?? "mock.pbx.local",
  stunServers: ["stun:stun.l.google.com:19302"],
  autoRegister: true,
  retryN: 2,
};
