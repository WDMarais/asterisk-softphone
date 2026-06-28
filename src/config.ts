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

export const defaultConfig: SoftphoneConfig = {
  wsServer: `${location.origin.replace(/^http/, "ws")}/ws`,
  sipUser: "6003",
  sipDomain: location.hostname,
  stunServers: ["stun:stun.l.google.com:19302"],
  autoRegister: true,
  retryN: 2,
};
