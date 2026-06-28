// Thin stateful wrapper around the pure transition table (agentState.ts). Holds
// the current state, dispatches events through nextState(), and notifies
// listeners on change. Illegal events throw and leave the state untouched, so a
// bad dispatch can never corrupt the machine.

import { AgentState, AgentEvent, nextState } from "./agentState";

export class AgentStateMachine {
  private _state: AgentState;
  private readonly listeners = new Set<(state: AgentState) => void>();

  constructor(initial: AgentState = AgentState.OFFLINE) {
    this._state = initial;
  }

  get state(): AgentState {
    return this._state;
  }

  /** Apply an event. Throws IllegalTransitionError (state unchanged) if not allowed. */
  dispatch(event: AgentEvent): AgentState {
    const next = nextState(this._state, event); // throws before any mutation
    this._state = next;
    for (const listener of this.listeners) listener(next);
    return next;
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  onChange(listener: (state: AgentState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
