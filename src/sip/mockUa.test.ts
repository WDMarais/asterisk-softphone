import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { MockSipUa, MOCK_FAIL_PASSWORD, mockCallControl } from "./mockUa";
import type { CallEvent, RegistrationOutcome } from "./ua";
import type { SoftphoneConfig } from "../config";

const config: SoftphoneConfig = {
  wsServer: "ws://localhost:5173/ws",
  sipUser: "6003",
  sipDomain: "mock.pbx.local",
  stunServers: [],
  autoRegister: true,
  retryN: 2,
};

describe("MockSipUa", () => {
  let outcomes: RegistrationOutcome[];
  let ua: MockSipUa;

  beforeEach(() => {
    vi.useFakeTimers();
    outcomes = [];
    ua = new MockSipUa(config, (o) => outcomes.push(o));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits the outcome asynchronously, not on the register() call", async () => {
    await ua.register("anything");
    expect(outcomes).toEqual([]); // nothing yet — mirrors REGISTER round-trip latency
    vi.runAllTimers();
    expect(outcomes).toEqual([{ kind: "registered" }]);
  });

  it("registers successfully for an ordinary password", async () => {
    await ua.register("hunter2");
    vi.runAllTimers();
    expect(outcomes).toEqual([{ kind: "registered" }]);
  });

  it("rejects the reserved fail password", async () => {
    await ua.register(MOCK_FAIL_PASSWORD);
    vi.runAllTimers();
    expect(outcomes).toEqual([{ kind: "failed", reason: "403 Forbidden (mock)" }]);
  });

  it("emits unregistered only when currently registered", async () => {
    await ua.unregister();
    vi.runAllTimers();
    expect(outcomes).toEqual([]); // never registered → no-op

    await ua.register("hunter2");
    vi.runAllTimers();
    await ua.unregister();
    expect(outcomes).toEqual([{ kind: "registered" }, { kind: "unregistered" }]);
  });

  it("a retry supersedes a pending outcome rather than emitting twice", async () => {
    await ua.register(MOCK_FAIL_PASSWORD); // schedule a failure...
    await ua.register("hunter2"); // ...then retry before the timer fires
    vi.runAllTimers();
    expect(outcomes).toEqual([{ kind: "registered" }]);
  });
});

describe("MockSipUa calls (spec §2.3 outbound)", () => {
  let events: CallEvent[];
  let ua: MockSipUa;

  beforeEach(() => {
    vi.useFakeTimers();
    events = [];
    // reset the module-level dev control between tests
    mockCallControl.outcome = "answer";
    mockCallControl.latencyMs = 1000;
    ua = new MockSipUa(config, () => {});
    ua.onCallEvent((e) => events.push(e));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rings immediately, then answers after the control latency", async () => {
    await ua.placeCall("6001");
    expect(events).toEqual([{ kind: "ringing", destination: "6001" }]);
    vi.runAllTimers();
    expect(events).toEqual([
      { kind: "ringing", destination: "6001" },
      { kind: "answered" },
    ]);
  });

  it("resolves to a failure per mockCallControl.outcome", async () => {
    mockCallControl.outcome = "busy";
    await ua.placeCall("6001");
    vi.runAllTimers();
    expect(events).toEqual([
      { kind: "ringing", destination: "6001" },
      { kind: "failed", reason: "Busy" },
    ]);
  });

  it("hangup after answer emits ended/Hung up", async () => {
    await ua.placeCall("6001");
    vi.runAllTimers(); // answered
    await ua.hangup();
    expect(events.at(-1)).toEqual({ kind: "ended", reason: "Hung up" });
  });

  it("hangup while still ringing cancels the call", async () => {
    await ua.placeCall("6001");
    await ua.hangup(); // before the answer timer fires
    expect(events.at(-1)).toEqual({ kind: "ended", reason: "Cancelled" });
    vi.runAllTimers(); // the superseded answer timer must not fire
    expect(events.filter((e) => e.kind === "answered")).toEqual([]);
  });

  it("hangup with no active call is a no-op", async () => {
    await ua.hangup();
    vi.runAllTimers();
    expect(events).toEqual([]);
  });
});
