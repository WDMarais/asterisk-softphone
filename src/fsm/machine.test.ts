import { describe, it, expect, vi } from "vitest";
import { AgentStateMachine } from "./machine";
import { AgentState as S, AgentEvent as E, IllegalTransitionError } from "./agentState";

describe("AgentStateMachine", () => {
  it("starts OFFLINE by default", () => {
    expect(new AgentStateMachine().state).toBe(S.OFFLINE);
  });

  it("honours an explicit initial state", () => {
    expect(new AgentStateMachine(S.AVAILABLE).state).toBe(S.AVAILABLE);
  });

  it("advances state on a legal dispatch and returns the new state", () => {
    const m = new AgentStateMachine();
    expect(m.dispatch(E.START_REGISTER)).toBe(S.REGISTERING);
    expect(m.state).toBe(S.REGISTERING);
  });

  it("notifies listeners on change and stops after unsubscribe", () => {
    const m = new AgentStateMachine();
    const seen = vi.fn();
    const off = m.onChange(seen);
    m.dispatch(E.START_REGISTER); // → REGISTERING
    m.dispatch(E.REGISTER_OK); // → AVAILABLE
    expect(seen).toHaveBeenNthCalledWith(1, S.REGISTERING);
    expect(seen).toHaveBeenNthCalledWith(2, S.AVAILABLE);
    off();
    m.dispatch(E.INITIATE_CALL); // → RINGING_OUT, not observed
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it("throws on an illegal dispatch and leaves the state unchanged", () => {
    const m = new AgentStateMachine(S.AVAILABLE);
    expect(() => m.dispatch(E.ANSWERED)).toThrow(IllegalTransitionError);
    expect(m.state).toBe(S.AVAILABLE);
  });
});
