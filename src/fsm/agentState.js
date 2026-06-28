// Combined agent-state FSM — spec §1.3 (transition table) refined by §2.1
// (registration sub-states). Flat enum of valid presence×call combinations;
// illegal combinations are unrepresentable, illegal transitions raise at the
// boundary. Owning the transition table IS the point (spec §4).
//
// RED SKELETON: enum/error types are real; nextState() throws so red-first tests
// (it.fails) stay honest. Implement the table, then drop the `.fails` markers.
/**
 * The 9 core states mirror the server's AgentState (api/parsing.py) by name —
 * shared vocabulary, no shared package (§4). REGISTERING / REGISTRATION_FAILED
 * are client-only transient states (§2.1). CONNECTION_LOST / CALL_DEGRADED are
 * declared here but their transitions are specced in §2.6 (Phase B).
 */
export var AgentState;
(function (AgentState) {
    // --- core combined states (mirror server) ---
    AgentState["AVAILABLE"] = "AVAILABLE";
    AgentState["RINGING_IN"] = "RINGING_IN";
    AgentState["RINGING_OUT"] = "RINGING_OUT";
    AgentState["IN_CALL"] = "IN_CALL";
    AgentState["ON_HOLD"] = "ON_HOLD";
    AgentState["DND"] = "DND";
    AgentState["DND_IN_CALL"] = "DND_IN_CALL";
    AgentState["DND_ON_HOLD"] = "DND_ON_HOLD";
    AgentState["OFFLINE"] = "OFFLINE";
    // --- client-only transient states ---
    AgentState["REGISTERING"] = "REGISTERING";
    AgentState["REGISTRATION_FAILED"] = "REGISTRATION_FAILED";
    AgentState["CONNECTION_LOST"] = "CONNECTION_LOST";
    AgentState["CALL_DEGRADED"] = "CALL_DEGRADED";
})(AgentState || (AgentState = {}));
/** Events that drive the FSM. Derived from the §1.3 / §2.1 transition triggers. */
export var AgentEvent;
(function (AgentEvent) {
    // registration (§2.1)
    AgentEvent["START_REGISTER"] = "START_REGISTER";
    AgentEvent["REGISTER_OK"] = "REGISTER_OK";
    AgentEvent["REGISTER_FAIL"] = "REGISTER_FAIL";
    AgentEvent["RETRY"] = "RETRY";
    // call lifecycle (§1.3)
    AgentEvent["INCOMING_CALL"] = "INCOMING_CALL";
    AgentEvent["INITIATE_CALL"] = "INITIATE_CALL";
    AgentEvent["ANSWERED"] = "ANSWERED";
    AgentEvent["CALL_ENDED"] = "CALL_ENDED";
    AgentEvent["HOLD"] = "HOLD";
    AgentEvent["RESUME"] = "RESUME";
    // presence (§1.3)
    AgentEvent["SET_DND"] = "SET_DND";
    AgentEvent["CLEAR_DND"] = "CLEAR_DND";
    AgentEvent["UNREGISTER"] = "UNREGISTER";
})(AgentEvent || (AgentEvent = {}));
/** Raised when an event is not allowed from the current state (§1.3 blocked set + anything off-table). */
export class IllegalTransitionError extends Error {
    state;
    event;
    constructor(state, event) {
        super(`illegal transition: ${state} --${event}--> (not in allowed set)`);
        this.state = state;
        this.event = event;
        this.name = "IllegalTransitionError";
    }
}
/**
 * The explicit allowed transition table (§1.3 + §2.1). Any (state, event) pair
 * not present here is illegal — including the §1.3 explicitly-blocked
 * IN_CALL→OFFLINE and ON_HOLD→OFFLINE (absent UNREGISTER entries). §1.3's atomic
 * OFFLINE→AVAILABLE is intentionally decomposed into OFFLINE→REGISTERING→AVAILABLE.
 */
const TRANSITIONS = {
    [AgentState.OFFLINE]: {
        [AgentEvent.START_REGISTER]: AgentState.REGISTERING,
    },
    [AgentState.REGISTERING]: {
        [AgentEvent.REGISTER_OK]: AgentState.AVAILABLE,
        [AgentEvent.REGISTER_FAIL]: AgentState.REGISTRATION_FAILED,
    },
    [AgentState.REGISTRATION_FAILED]: {
        [AgentEvent.RETRY]: AgentState.REGISTERING,
    },
    [AgentState.AVAILABLE]: {
        [AgentEvent.INCOMING_CALL]: AgentState.RINGING_IN,
        [AgentEvent.INITIATE_CALL]: AgentState.RINGING_OUT,
        [AgentEvent.SET_DND]: AgentState.DND,
        [AgentEvent.UNREGISTER]: AgentState.OFFLINE,
    },
    [AgentState.RINGING_IN]: {
        [AgentEvent.ANSWERED]: AgentState.IN_CALL,
        [AgentEvent.CALL_ENDED]: AgentState.AVAILABLE,
    },
    [AgentState.RINGING_OUT]: {
        [AgentEvent.ANSWERED]: AgentState.IN_CALL,
        [AgentEvent.CALL_ENDED]: AgentState.AVAILABLE,
    },
    [AgentState.IN_CALL]: {
        [AgentEvent.HOLD]: AgentState.ON_HOLD,
        [AgentEvent.CALL_ENDED]: AgentState.AVAILABLE,
        [AgentEvent.SET_DND]: AgentState.DND_IN_CALL,
        // UNREGISTER intentionally absent — IN_CALL→OFFLINE is blocked (§1.3).
    },
    [AgentState.ON_HOLD]: {
        [AgentEvent.RESUME]: AgentState.IN_CALL,
        [AgentEvent.CALL_ENDED]: AgentState.AVAILABLE,
        [AgentEvent.SET_DND]: AgentState.DND_ON_HOLD,
        // UNREGISTER intentionally absent — ON_HOLD→OFFLINE is blocked (§1.3).
    },
    [AgentState.DND]: {
        [AgentEvent.CLEAR_DND]: AgentState.AVAILABLE,
        [AgentEvent.UNREGISTER]: AgentState.OFFLINE,
    },
    [AgentState.DND_IN_CALL]: {
        [AgentEvent.CALL_ENDED]: AgentState.DND, // auto-transition (§1.3 rationale)
    },
    [AgentState.DND_ON_HOLD]: {
        [AgentEvent.RESUME]: AgentState.DND_IN_CALL,
        [AgentEvent.CALL_ENDED]: AgentState.DND,
    },
};
/**
 * Pure transition function. Returns the next state for an allowed (state, event)
 * pair; throws IllegalTransitionError otherwise.
 */
export function nextState(state, event) {
    const target = TRANSITIONS[state]?.[event];
    if (target === undefined)
        throw new IllegalTransitionError(state, event);
    return target;
}
