// SIP header parsing — the ONE place raw SIP headers are touched (spec §2.2).
// Everything else in the app consumes the typed SipHeaders, never raw headers.
//
// RED SKELETON: signatures are real; bodies throw so red-first tests (it.fails)
// stay honest until the behaviour is implemented. Implement, then drop the
// `.fails` markers in headers.test.ts.
/**
 * Parse the headers we care about out of a raw SIP INVITE message.
 * @param invite raw SIP message text (CRLF-delimited, headers + blank line + body).
 */
export function parseSipHeaders(invite) {
    // Split into lines; headers run until the first blank line (CRLF per RFC 3261,
    // but tolerate lone CR/LF). The request/status line has no colon and is skipped.
    const lines = invite.split(/\r\n|\r|\n/);
    const headers = new Map(); // lowercased name -> value, first wins
    for (const line of lines) {
        if (line === "")
            break; // end of header block
        const idx = line.indexOf(":");
        if (idx === -1)
            continue; // request line / junk
        const name = line.slice(0, idx).trim().toLowerCase();
        const value = line.slice(idx + 1).trim();
        if (name && !headers.has(name))
            headers.set(name, value);
    }
    // Reject input that isn't a SIP message at all → ok:false, raw preserved.
    const firstLine = lines[0] ?? "";
    const looksLikeSip = firstLine.includes("SIP/2.0") ||
        headers.has("from") ||
        headers.has("via") ||
        headers.has("call-id") ||
        headers.has("cseq");
    if (!looksLikeSip) {
        return { ok: false, warnings: ["not a SIP message"], raw: invite };
    }
    const warnings = [];
    // From → caller_id (SIP URI user part, RFC 3261). Tolerates display name,
    // angle brackets, and a bare URI; strips any params after the host.
    let caller_id = null;
    const from = headers.get("from");
    if (from === undefined) {
        warnings.push("From header missing");
    }
    else {
        caller_id = from.match(/sips?:([^@>;\s]+)@/i)?.[1] ?? null;
    }
    // X-Queue → queue_name. Absent is non-fatal (CallerID still shown).
    let queue_name = null;
    const xQueue = headers.get("x-queue");
    if (xQueue === undefined) {
        warnings.push("X-Queue missing");
    }
    else {
        queue_name = xQueue;
    }
    // Dialplan-injected correlation ids; absence is silent (no warning specced).
    const unique_id = headers.get("x-asterisk-uniqueid") ?? null;
    const linked_id = headers.get("x-asterisk-linkedid") ?? null;
    return { ok: true, warnings, value: { caller_id, queue_name, unique_id, linked_id } };
}
