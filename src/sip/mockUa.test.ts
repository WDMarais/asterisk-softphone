import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { MockSipUa, MOCK_FAIL_PASSWORD } from "./mockUa";
import type { RegistrationOutcome } from "./ua";
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
