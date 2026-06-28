# asterisk-softphone — implementation plan

## Context

Phase 2 of the asterisk project. The broker (`asterisk-sandbox`) is a control-plane
API (`/originate`, `/calls`, `/events`) and the PBX is already WebRTC-ready: `6003` is a
`webrtc` PJSIP endpoint and nginx proxies `wss://{domain}/ws → ws://127.0.0.1:8088/ws`.

This repo is the first real **product consumer** of that API — a browser SIP UA that
registers as `6003` over WebRTC, drives the §2 state machine from `notes/spec.md`, and
shows agent/call state. It lives in its own repo per the "the API is the product" thesis
(broker = one provider, many consumer repos). It speaks **both planes**: media/signaling
direct to Asterisk (SIP/WebRTC over `wss`), control/CTI to the broker (`/originate`,
`/events`).

Build method: **hybrid TDD** — `harness-writer` red tests for the pure logic (FSM +
header parsing), scaffold-and-verify for the SIP.js/WebRTC glue (needs the live PBX).

## Stack

- **Vite + TypeScript** (strict mode)
- **SIP.js** (current release) — the SIP/WebRTC User Agent
- **Vitest** — unit tests, red-first on FSM + `parse_sip_headers`
- **npm** (pnpm not installed; staying minimal)
- No backend of its own — consumes the broker.

## Module layout

| Module | Responsibility |
|---|---|
| `src/sip/headers.ts` | `parse_sip_headers(invite)` — the **only** place raw SIP headers are touched. Discriminated-union `ParseResult<T>` (`{ok:true,value}` \| `{ok:false,warnings,raw}`). Extracts `caller_id`, `queue_name` (X-Queue), `unique_id` (X-Asterisk-Uniqueid), `linked_id`. |
| `src/fsm/agentState.ts` | `AgentState` enum (mirrors server names in `api/parsing.py` §1.3) + explicit transition table; illegal transitions throw at the boundary. Pure — fed events, no SIP.js import. |
| `src/sip/ua.ts` | SIP.js `UserAgent` wiring: register over `wss`, inbound/outbound sessions, hold, hangup. Translates SIP.js events → FSM events. |
| `src/broker/events.ts` | `EventSource("/events")` consumer (mirrors `api/static/dashboard.js`): `snapshot`, `call_started/updated/ended`, `agent_state_changed`. |
| `src/broker/api.ts` | typed `fetch` wrappers: `POST /originate {agent,destination}`, `GET /calls`, `GET /health`. |
| `src/ui/` | minimal UI: registration status, incoming-call card (CallerID + queue), in-call controls (answer/reject/hold/hangup/DND), the §2.7 three notification layers. |
| `src/config.ts` | `wssUrl`, `stunServers`, `autoRegister`, `retryN`, `sipUser`/`sipPassword`. |

## Sequencing

**Phase A — pure logic, red→green (Vitest, no PBX):**
1. `harness-writer` on spec §2.2 → `headers.test.ts` (red) → implement `headers.ts`.
2. `harness-writer` on §1.3 + §2.1/2.3/2.4/2.5 transitions → `agentState.test.ts` (red) →
   implement transition table.

**Phase B — scaffold-and-verify, live PBX:**
3. SIP.js UA: register `6003` over `wss`, place & receive a call. Verify against the live PBX.
4. Wire FSM ↔ UA events ↔ broker `/events`.
5. UI + §2.7 notification layers.
6. Resilience: §2.6 connection-loss/recovery (re-INVITE, backoff), STUN failure → `CALL_DEGRADED`.

## Config defaults (from spec — stated, not asked)

- `autoRegister = true` (§2.1); manual "Go Online" path supported.
- `retryN = 2` (§2.1, §2.6) for registration/reconnect backoff.
- **STUN**: public `stun.l.google.com:19302`. **TURN deferred** — only needed for symmetric NAT.
- **Origin / CORS**: broker sets **no CORS headers** today, and we keep it that way —
  - **Dev**: Vite dev-server **proxy** (`/ws`, `/events`, `/originate`, `/calls` → VPS). Same-origin to the browser, no CORS.
  - **Prod**: static build served **same-origin** by nginx (e.g. a `/phone` location or subdomain).
  - → **broker stays untouched**; no CORS middleware needed.

## Integration contract (verified against broker)

- WebRTC SIP: `wss://{domain}/ws` → `ws://127.0.0.1:8088/ws`. Register user `6003`, password `SIP_PASS_03`, context `internal`, codecs opus/ulaw, DTLS auto-cert, `max_contacts=2`.
- `POST /originate` body: `{agent: "6003", destination: "6001"}` → `{channel_id, status:"originating"}`.
- `GET /events` SSE: `snapshot` {agent_states, calls}, `call_started|updated|ended` (call snapshot; `_ended` adds `cause`), `agent_state_changed` {device,state,previous}.
- Call snapshot fields: `uniqueid, linkedid, channel, caller_id_num, caller_id_name, extension, state, origin, started_at, updated_at`.
- `AgentState` values to mirror: AVAILABLE, RINGING_IN, RINGING_OUT, IN_CALL, ON_HOLD, DND, DND_IN_CALL, DND_ON_HOLD, OFFLINE.

## Prerequisites / ops (NOT softphone code — flag for verify)

- **RTP UDP media path**: AWS SG must allow the Asterisk RTP UDP port range + `rtp.conf` set,
  or ICE fails and audio never establishes (→ `CALL_DEGRADED`). Confirm before the integration test.
- 6003 is currently a `webrtc` endpoint with `max_contacts=2` (so a desk 6003 and the browser can't both hold all slots — fine for testing).

## Verification

- **Unit**: `npm test` (Vitest) — FSM + header parsing green.
- **Integration** (`/verify`): `npm run dev`, open browser → registers `6003` over
  `wss://pbx.wdmarais.dev/ws` → place `6003 → 6001`, answer on a 6001 device → confirm
  two-way audio, FSM transitions (AVAILABLE→RINGING_OUT→IN_CALL), and the broker dashboard
  shows the call classified.

## Open ops item

- Verify RTP UDP ports are open in the AWS SG before the first integration call (else ICE/audio fails).
