// Red-first tests for parse_sip_headers — spec §2.2 (asterisk-sandbox/notes/spec.md).
//
// RED MECHANISM: each unbuilt-behaviour test uses `it.fails(...)` — Vitest's
// strict-xfail equivalent. While parseSipHeaders throws "not implemented" the
// body fails and `it.fails` reports GREEN. Once the behaviour is implemented and
// the assertions actually pass, `it.fails` flips the test RED — forcing you to
// delete `.fails`. Do NOT use it.skip (hides the test) and do NOT leave `.fails`
// on an implemented behaviour (that's an unimplemented-or-false-green).

import { describe, it, expect } from "vitest";
import { parseSipHeaders } from "./headers";
import type { SipHeaders } from "./headers";

/** Assemble a raw INVITE from header lines. CRLF per RFC 3261; undefined = omit. */
function buildInvite(headers: Record<string, string | undefined>): string {
  const lines = ["INVITE sip:6003@pbx.wdmarais.dev SIP/2.0"];
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined) lines.push(`${name}: ${value}`);
  }
  // headers, blank line, then (empty) body
  return lines.join("\r\n") + "\r\n\r\n";
}

// A fully-populated, well-formed inbound queue INVITE.
const FULL_HEADERS: Record<string, string | undefined> = {
  Via: "SIP/2.0/WSS pbx.wdmarais.dev;branch=z9hG4bK1",
  From: '"Support Line" <sip:0821234567@pbx.wdmarais.dev>;tag=abc123',
  To: "<sip:6003@pbx.wdmarais.dev>",
  "Call-ID": "call-001@pbx",
  CSeq: "1 INVITE",
  "X-Queue": "support",
  "X-Asterisk-Uniqueid": "0000000a",
  "X-Asterisk-Linkedid": "0000000b",
};

describe("parse_sip_headers (§2.2)", () => {
  // ---- Integration: the full happy-path contract ----
  it("extracts all four typed fields from a well-formed queue INVITE", () => {
    const result = parseSipHeaders(buildInvite(FULL_HEADERS));
    expect(result).toEqual({
      ok: true,
      warnings: [],
      value: {
        caller_id: "0821234567", // From user part — RFC 3261
        queue_name: "support", // X-Queue — dialplan-injected
        unique_id: "0000000a", // X-Asterisk-Uniqueid — correlates with AMI
        linked_id: "0000000b", // X-Asterisk-Linkedid — informational only
      } satisfies SipHeaders,
    });
  });

  // ---- Spec error case 1: X-Queue missing → not fatal, CallerID still shown ----
  it("returns queue_name=null with a warning when X-Queue is missing", () => {
    const result = parseSipHeaders(buildInvite({ ...FULL_HEADERS, "X-Queue": undefined }));
    // §2.2: "not fatal; CallerID still shown to agent" → still ok:true, value present.
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.queue_name).toBeNull();
    expect(result.value.caller_id).toBe("0821234567"); // still shown
    expect(result.warnings).toContain("X-Queue missing");
  });

  // ---- Spec error case 2: From missing → must not crash, surface as warning ----
  it("returns caller_id=null with a warning when From is missing", () => {
    const result = parseSipHeaders(buildInvite({ ...FULL_HEADERS, From: undefined }));
    // §2.2: "malformed INVITE — must not crash; surface as warning". Still ok:true.
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.caller_id).toBeNull();
    expect(result.warnings).toContain("From header missing");
    // other dialplan-injected fields still parsed
    expect(result.value.unique_id).toBe("0000000a");
  });

  // ---- Both warnings accumulate ----
  it("accumulates both warnings when From and X-Queue are absent", () => {
    const result = parseSipHeaders(
      buildInvite({ ...FULL_HEADERS, From: undefined, "X-Queue": undefined }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual(
      expect.arrayContaining(["From header missing", "X-Queue missing"]),
    );
    expect(result.value.caller_id).toBeNull();
    expect(result.value.queue_name).toBeNull();
  });

  // ---- Decomposition: From user-part extraction across common formats ----
  // caller_id is the SIP URI user part; the From header has several legal shapes.
  describe("From header → caller_id extraction", () => {
    const cases: Array<{ name: string; from: string; expected: string }> = [
      {
        name: "display-name + angle-bracketed URI + tag",
        from: '"Support" <sip:0821234567@pbx.wdmarais.dev>;tag=x',
        expected: "0821234567",
      },
      {
        name: "angle-bracketed URI, no display name",
        from: "<sip:0821234567@pbx.wdmarais.dev>;tag=x",
        expected: "0821234567",
      },
      {
        name: "bare URI, no angle brackets",
        from: "sip:0821234567@pbx.wdmarais.dev;tag=x",
        expected: "0821234567",
      },
    ];
    for (const c of cases) {
      it(`extracts user part: ${c.name}`, () => {
        const result = parseSipHeaders(buildInvite({ ...FULL_HEADERS, From: c.from }));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.caller_id).toBe(c.expected);
      });
    }
  });

  // ---- RFC 3261: header field names are case-insensitive ----
  // Not spec-explicit, but mandated by RFC 3261 §7.3.1; a correct parser must do it.
  it("matches header names case-insensitively (RFC 3261 §7.3.1)", () => {
    const result = parseSipHeaders(
      buildInvite({
        ...FULL_HEADERS,
        From: undefined,
        "X-Queue": undefined,
        from: '"Support" <sip:0821234567@pbx>;tag=x',
        "x-queue": "support",
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.caller_id).toBe("0821234567");
    expect(result.value.queue_name).toBe("support");
  });

  // ---- ok:false branch — SPEC GAP (see block below). Best-effort interpretation. ----
  it("returns ok:false with raw preserved for input that is not a SIP message", () => {
    const garbage = "this is not a SIP message";
    const result = parseSipHeaders(garbage);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.raw).toBe(garbage);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// === SPEC GAPS ===
// 1. ParseResult shape conflict: §2.2 examples return a usable partial `value`
//    *with* warnings (missing X-Queue still shows CallerID), but §4's union puts
//    `warnings` only on the ok:false branch (which hides `value`). Resolved here by
//    carrying `warnings` on the ok:true branch too. Architecture-proposer must ratify.
// 2. ok:false trigger is unspecified — §2.2's two error cases (missing X-Queue,
//    missing From) are both ok:true partial successes. The "not a SIP message" test
//    is a best-effort guess at when ok:false fires and what `raw` carries.
// 3. Anonymous calls (From: <sip:anonymous@anonymous.invalid>) — caller_id value vs
//    null is undefined by the spec; no test asserts behaviour.
// 4. From present but URI has no user part (e.g. sip:pbx) — caller_id null + warning?
//    Undefined; no test.
// 5. LF-only (non-CRLF) line endings — fixtures use CRLF per RFC; LF tolerance is
//    unspecified. Real SIP.js delivers CRLF, so left untested.
// 6. Duplicate X-Queue / multiple From headers — undefined; no test.
