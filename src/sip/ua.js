// SIP.js UserAgent wrapper — registration only, for now. Registration needs no
// media, so this slice doesn't touch WebRTC/RTP (and so isn't blocked on the
// AWS SG RTP gate). Inbound/outbound call handling lands in the next slice.
//
// Emits coarse registration outcomes; the controller (ui/registration.ts) maps
// them onto AgentEvents and drives the FSM. This module owns SIP.js; nothing
// else imports it.
import { UserAgent, Registerer, RegistererState } from "sip.js";
export class SipUa {
    config;
    onOutcome;
    ua;
    registerer;
    constructor(config, onOutcome) {
        this.config = config;
        this.onOutcome = onOutcome;
    }
    /**
     * Connect the transport and REGISTER as the configured user. Resolves once the
     * REGISTER request has been sent; the actual registered/failed result arrives
     * asynchronously via onOutcome.
     */
    async register(password) {
        // Tear down any prior attempt (e.g. a failed registration being retried).
        if (this.ua)
            await this.unregister();
        const uri = UserAgent.makeURI(`sip:${this.config.sipUser}@${this.config.sipDomain}`);
        if (!uri)
            throw new Error(`invalid SIP URI for user ${this.config.sipUser}`);
        this.ua = new UserAgent({
            uri,
            transportOptions: { server: this.config.wsServer },
            authorizationUsername: this.config.sipUser,
            authorizationPassword: password,
            logLevel: "warn",
        });
        try {
            await this.ua.start(); // open the WebSocket transport
        }
        catch (err) {
            this.onOutcome({ kind: "failed", reason: `transport: ${describeError(err)}` });
            return;
        }
        this.registerer = new Registerer(this.ua);
        this.registerer.stateChange.addListener((state) => {
            if (state === RegistererState.Registered)
                this.onOutcome({ kind: "registered" });
            else if (state === RegistererState.Unregistered)
                this.onOutcome({ kind: "unregistered" });
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
        }
        catch (err) {
            this.onOutcome({ kind: "failed", reason: describeError(err) });
        }
    }
    /** Unregister and tear down the transport. Idempotent: safe to call when not registered. */
    async unregister() {
        try {
            await this.registerer?.unregister();
        }
        finally {
            await this.ua?.stop();
            this.registerer = undefined;
            this.ua = undefined;
        }
    }
}
function describeError(err) {
    return err instanceof Error ? err.message : String(err);
}
