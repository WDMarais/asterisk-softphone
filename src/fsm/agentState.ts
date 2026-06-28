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
export enum AgentState {
  // --- core combined states (mirror server) ---
  AVAILABLE = "AVAILABLE",
  RINGING_IN = "RINGING_IN",
  RINGING_OUT = "RINGING_OUT",
  IN_CALL = "IN_CALL",
  ON_HOLD = "ON_HOLD",
  DND = "DND",
  DND_IN_CALL = "DND_IN_CALL",
  DND_ON_HOLD = "DND_ON_HOLD",
  OFFLINE = "OFFLINE",
  // --- client-only transient states ---
  REGISTERING = "REGISTERING", // §2.1
  REGISTRATION_FAILED = "REGISTRATION_FAILED", // §2.1
  CONNECTION_LOST = "CONNECTION_LOST", // §2.6 — Phase B
  CALL_DEGRADED = "CALL_DEGRADED", // §2.6 — Phase B
}

/** Events that drive the FSM. Derived from the §1.3 / §2.1 transition triggers. */
export enum AgentEvent {
  // registration (§2.1)
  START_REGISTER = "START_REGISTER", // auto on load, or "Go Online"
  REGISTER_OK = "REGISTER_OK",
  REGISTER_FAIL = "REGISTER_FAIL", // SIP 403 / timeout / DNS failure
  RETRY = "RETRY", // backoff tick or manual retry
  // call lifecycle (§1.3)
  INCOMING_CALL = "INCOMING_CALL",
  INITIATE_CALL = "INITIATE_CALL",
  ANSWERED = "ANSWERED", // agent answers inbound OR remote answers outbound
  CALL_ENDED = "CALL_ENDED", // hangup / reject / cancel / no-answer
  HOLD = "HOLD",
  RESUME = "RESUME",
  // presence (§1.3)
  SET_DND = "SET_DND",
  CLEAR_DND = "CLEAR_DND",
  UNREGISTER = "UNREGISTER", // browser close / SIP reg expiry
}

/** Raised when an event is not allowed from the current state (§1.3 blocked set + anything off-table). */
export class IllegalTransitionError extends Error {
  constructor(
    readonly state: AgentState,
    readonly event: AgentEvent,
  ) {
    super(`illegal transition: ${state} --${event}--> (not in allowed set)`);
    this.name = "IllegalTransitionError";
  }
}

/**
 * The explicit allowed transition table (§1.3 + §2.1). Any (state, event) pair
 * not present here is illegal — including the §1.3 explicitly-blocked
 * IN_CALL→OFFLINE and ON_HOLD→OFFLINE (absent UNREGISTER entries). §1.3's atomic
 * OFFLINE→AVAILABLE is intentionally decomposed into OFFLINE→REGISTERING→AVAILABLE.
 */
const TRANSITIONS: {
  readonly [state in AgentState]?: { readonly [event in AgentEvent]?: AgentState };
} = {
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
export function nextState(state: AgentState, event: AgentEvent): AgentState {
  const target = TRANSITIONS[state]?.[event];
  if (target === undefined) throw new IllegalTransitionError(state, event);
  return target;
}
