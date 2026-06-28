// Red-first tests for the combined agent-state FSM — spec §1.3 (transition table)
// + §2.1 (registration sub-states). asterisk-sandbox/notes/spec.md.
//
// RED MECHANISM: `it.fails(...)` is the strict-xfail equivalent (see headers.test.ts).
// Green while nextState() throws "not implemented"; flips RED once the real table
// is in place and assertions pass — forcing removal of `.fails`.
import { describe, it, expect } from "vitest";
import { AgentState as S, AgentEvent as E, nextState, IllegalTransitionError } from "./agentState";
/** Drive a start state through a sequence of events, returning the final state. */
function drive(start, events) {
    return events.reduce((state, event) => nextState(state, event), start);
}
// The complete allowed transition table — the test OWNS the contract.
// §1.3's atomic OFFLINE→AVAILABLE is decomposed into OFFLINE→REGISTERING→AVAILABLE (§2.1).
const ALLOWED = [
    // registration (§2.1)
    [S.OFFLINE, E.START_REGISTER, S.REGISTERING],
    [S.REGISTERING, E.REGISTER_OK, S.AVAILABLE],
    [S.REGISTERING, E.REGISTER_FAIL, S.REGISTRATION_FAILED],
    [S.REGISTRATION_FAILED, E.RETRY, S.REGISTERING],
    // from AVAILABLE
    [S.AVAILABLE, E.INCOMING_CALL, S.RINGING_IN],
    [S.AVAILABLE, E.INITIATE_CALL, S.RINGING_OUT],
    [S.AVAILABLE, E.SET_DND, S.DND],
    [S.AVAILABLE, E.UNREGISTER, S.OFFLINE],
    // ringing
    [S.RINGING_IN, E.ANSWERED, S.IN_CALL],
    [S.RINGING_IN, E.CALL_ENDED, S.AVAILABLE],
    [S.RINGING_OUT, E.ANSWERED, S.IN_CALL],
    [S.RINGING_OUT, E.CALL_ENDED, S.AVAILABLE],
    // in call / on hold
    [S.IN_CALL, E.HOLD, S.ON_HOLD],
    [S.IN_CALL, E.CALL_ENDED, S.AVAILABLE],
    [S.IN_CALL, E.SET_DND, S.DND_IN_CALL],
    [S.ON_HOLD, E.RESUME, S.IN_CALL],
    [S.ON_HOLD, E.CALL_ENDED, S.AVAILABLE],
    [S.ON_HOLD, E.SET_DND, S.DND_ON_HOLD],
    // DND family
    [S.DND, E.CLEAR_DND, S.AVAILABLE],
    [S.DND, E.UNREGISTER, S.OFFLINE],
    [S.DND_IN_CALL, E.CALL_ENDED, S.DND], // auto-transition (§1.3 rationale)
    [S.DND_ON_HOLD, E.RESUME, S.DND_IN_CALL],
    [S.DND_ON_HOLD, E.CALL_ENDED, S.DND],
];
describe("agent-state FSM (§1.3 + §2.1)", () => {
    // ---- Integration: full lifecycle sequences drive the FSM end to end ----
    it("outbound call happy path: register → call → hold → resume → end", () => {
        const final = drive(S.OFFLINE, [
            E.START_REGISTER,
            E.REGISTER_OK,
            E.INITIATE_CALL,
            E.ANSWERED,
            E.HOLD,
            E.RESUME,
            E.CALL_ENDED,
        ]);
        expect(final).toBe(S.AVAILABLE);
    });
    it("inbound call then DND mid-call auto-drops to DND, cleared back to AVAILABLE", () => {
        const final = drive(S.AVAILABLE, [
            E.INCOMING_CALL,
            E.ANSWERED,
            E.SET_DND, // → DND_IN_CALL
            E.CALL_ENDED, // → DND (auto)
            E.CLEAR_DND, // → AVAILABLE
        ]);
        expect(final).toBe(S.AVAILABLE);
    });
    it("DND set while on hold, resume returns to DND_IN_CALL, end drops to DND", () => {
        const final = drive(S.AVAILABLE, [
            E.INCOMING_CALL,
            E.ANSWERED,
            E.HOLD, // → ON_HOLD
            E.SET_DND, // → DND_ON_HOLD
            E.RESUME, // → DND_IN_CALL
            E.CALL_ENDED, // → DND
        ]);
        expect(final).toBe(S.DND);
    });
    // ---- Every allowed transition produces its specified target ----
    describe("allowed transitions (§1.3 table)", () => {
        for (const [from, event, to] of ALLOWED) {
            it(`${from} --${event}--> ${to}`, () => {
                expect(nextState(from, event)).toBe(to);
            });
        }
    });
    // ---- Registration failure + manual retry (§2.1) ----
    it("registration can fail and retry without losing the FSM", () => {
        let s = drive(S.OFFLINE, [E.START_REGISTER, E.REGISTER_FAIL]);
        expect(s).toBe(S.REGISTRATION_FAILED);
        s = nextState(s, E.RETRY);
        expect(s).toBe(S.REGISTERING);
        s = nextState(s, E.REGISTER_OK);
        expect(s).toBe(S.AVAILABLE);
    });
    // ---- Explicitly blocked transitions (§1.3) must raise ----
    describe("blocked transitions raise IllegalTransitionError (§1.3)", () => {
        const blocked = [
            [S.IN_CALL, E.UNREGISTER], // IN_CALL → OFFLINE rejected
            [S.ON_HOLD, E.UNREGISTER], // ON_HOLD → OFFLINE rejected
        ];
        for (const [from, event] of blocked) {
            it(`${from} --${event}--> REJECTED`, () => {
                expect(() => nextState(from, event)).toThrow(IllegalTransitionError);
            });
        }
    });
    // ---- Arbitrary off-table transitions raise ----
    describe("off-table transitions raise IllegalTransitionError", () => {
        const illegal = [
            [S.AVAILABLE, E.ANSWERED], // nothing ringing
            [S.OFFLINE, E.HOLD], // not in a call
            [S.OFFLINE, E.INCOMING_CALL], // unregistered can't ring
            [S.AVAILABLE, E.RESUME], // nothing to resume
            [S.DND, E.INCOMING_CALL], // queue must not route to DND
            [S.REGISTERING, E.INCOMING_CALL], // not yet available
        ];
        for (const [from, event] of illegal) {
            it(`${from} --${event}--> raises`, () => {
                expect(() => nextState(from, event)).toThrow(IllegalTransitionError);
            });
        }
    });
});
// === SPEC GAPS ===
// 1. §1.3 atomic OFFLINE→AVAILABLE vs §2.1 OFFLINE→REGISTERING→AVAILABLE: resolved
//    by implementing the §2.1 path (no direct OFFLINE→AVAILABLE). Architecture-proposer
//    should ratify that §1.3 line 140 is the collapsed view, not a second legal edge.
// 2. DND_IN_CALL → DND_ON_HOLD (hold while DND-in-call) is NOT in the §1.3 allowed set,
//    yet ON_HOLD→DND_ON_HOLD and DND_ON_HOLD→DND_IN_CALL both exist. So an agent in
//    DND_IN_CALL cannot hold. Treated as illegal here; likely a spec omission to confirm.
// 3. CONNECTION_LOST / CALL_DEGRADED (§2.6) transitions not modelled here — Phase B.
//    "resume FSM state prior to CONNECTION_LOST" (§2.6) implies the machine must store
//    prior state; this section's pure nextState() has no memory — a stateful wrapper
//    (AgentStateMachine) will be needed for §2.6.
// 4. ANSWERED is reused for both RINGING_IN→IN_CALL (agent answers) and RINGING_OUT→IN_CALL
//    (remote answers). Same target, distinct real-world trigger; collapsed for table clarity.
// 5. CALL_ENDED is one event covering hangup/reject/cancel/no-answer across all call-bearing
//    and ringing states. The spec distinguishes "missed/rejected" prose but maps them to the
//    same target (→ AVAILABLE / → DND), so a single event is faithful.
