// ═══════════════════════════════════════════════════════
// Mesonic session helpers — PURE logic (no Deno / no fetch)
// ═══════════════════════════════════════════════════════
//
// Extracted from index.ts so the fragile bits — XML parsing, staleness
// detection, and the decision of *when* to re-verify a session — can be
// unit-tested from Node/vitest (see session.test.ts). index.ts wires these
// pure functions to the real fetch/login runtime.

// ─── Sentinel account for liveness probes ───
// A dead WinLine session frequently returns an EMPTY result set instead of a
// 001001/001002 session error, so "empty" is ambiguous: it could be a genuine
// no-match, or a silently-dead session. To disambiguate we probe a Konto that
// is *guaranteed to always exist* — 24998 "HAUSINTERN", an internal house
// account. Overridable via the MESONIC_PROBE_KONTO secret.
export const DEFAULT_PROBE_KONTO = "24998"; // HAUSINTERN

// After we prove a session is alive (real data came back, or a probe
// succeeded) we trust it for this long before probing again on an empty
// result — bounds probe traffic so a fresh session that legitimately returns
// no matches doesn't fire a probe on every keystroke.
export const PROBE_VERIFY_TTL_MS = 30 * 1000;

// ─── Check if a response indicates a session error ───
// These are the codes/strings WinLine returns when it *knows* the session is
// gone. A dead-but-silent session won't match here — that's what the empty-
// result probe (needsLivenessProbe) is for.
export function isSessionError(text: string): boolean {
  return text.includes("001001") || text.includes("001002") ||
    text.toLowerCase().includes("session was not found") ||
    text.toLowerCase().includes("no webservice session");
}

// ─── Parse Mesonic XML response to JSON ───
// Mesonic XML formats:
//   Success: <MESOWebService TemplateType="1" Template="X"><X><Field>val</Field>...</X><X>...</X></MESOWebService>
//   Error:   <MESOWebServiceResult><OverallSuccess>false</OverallSuccess><ResultDetails><ErrorCode>000161</ErrorCode><ErrorText>...</ErrorText></ResultDetails></MESOWebServiceResult>
export function parseEximXml(
  xml: string,
): { error?: string; errorCode?: string; records: Record<string, string>[] } {
  // Check for error responses
  const successMatch = xml.match(/<OverallSuccess>(\w+)<\/OverallSuccess>/i);
  if (successMatch && successMatch[1].toLowerCase() === "false") {
    const codeMatch = xml.match(/<ErrorCode>(\d+)<\/ErrorCode>/i);
    const textMatch = xml.match(/<ErrorText>([^<]*)<\/ErrorText>/i);
    return {
      error: textMatch ? textMatch[1] : "Unknown Mesonic error",
      errorCode: codeMatch ? codeMatch[1] : undefined,
      records: [],
    };
  }

  // Also check if the entire response is just an error code
  const trimmed = xml.trim();
  if (/^\d{6}$/.test(trimmed)) {
    return { error: `Mesonic error code: ${trimmed}`, errorCode: trimmed, records: [] };
  }

  const records: Record<string, string>[] = [];

  // Extract template name from wrapper: <MESOWebService Template="WebKontenExport">
  // Records are direct children of MESOWebService, tagged with the template name
  const templateMatch = xml.match(/<MESOWebService[^>]*Template="([^"]+)"[^>]*>/i);
  const templateTag = templateMatch ? templateMatch[1] : null;

  if (templateTag) {
    // Match all <TemplateName>...</TemplateName> record blocks
    const recordRegex = new RegExp(
      `<${templateTag}>([\\s\\S]*?)<\\/${templateTag}>`,
      "gi",
    );
    let recordMatch;
    while ((recordMatch = recordRegex.exec(xml)) !== null) {
      const recordXml = recordMatch[1];
      const fields: Record<string, string> = {};
      const fieldRegex = /<([A-Za-z0-9_.\-]+)>([\s\S]*?)<\/\1>/g;
      let fieldMatch;
      while ((fieldMatch = fieldRegex.exec(recordXml)) !== null) {
        fields[fieldMatch[1]] = fieldMatch[2].trim();
      }
      if (Object.keys(fields).length > 0) {
        records.push(fields);
      }
    }
  }

  // Fallback: try generic Record/Datensatz tags
  if (records.length === 0) {
    const recordRegex = /<(?:Record|Datensatz)\b[^>]*>([\s\S]*?)<\/(?:Record|Datensatz)>/gi;
    let recordMatch;
    while ((recordMatch = recordRegex.exec(xml)) !== null) {
      const recordXml = recordMatch[1];
      const fields: Record<string, string> = {};
      const fieldRegex = /<([A-Za-z0-9_.\-]+)>([\s\S]*?)<\/\1>/g;
      let fieldMatch;
      while ((fieldMatch = fieldRegex.exec(recordXml)) !== null) {
        fields[fieldMatch[1]] = fieldMatch[2].trim();
      }
      if (Object.keys(fields).length > 0) {
        records.push(fields);
      }
    }
  }

  // Fallback: parse as flat fields (skip known wrappers)
  if (records.length === 0 && xml.includes("<")) {
    const fields: Record<string, string> = {};
    const fieldRegex = /<([A-Za-z0-9_.\-]+)>([^<]*)<\/\1>/g;
    let fieldMatch;
    while ((fieldMatch = fieldRegex.exec(xml)) !== null) {
      const tag = fieldMatch[1];
      if (
        !["MESOWebService", "MESOWebServiceResult", "OverallSuccess", "ResultDetails", "string", "xml"]
          .includes(tag)
      ) {
        fields[tag] = fieldMatch[2].trim();
      }
    }
    if (Object.keys(fields).length > 0) {
      records.push(fields);
    }
  }

  return { records };
}

// ─── Decide whether an empty response warrants a liveness probe ───
// Returns true when a query came back with zero records AND we haven't proven
// the session alive recently. A `true` means: run the sentinel probe; if the
// probe is ALSO empty, the session is silently dead → re-login + retry.
//
// We only probe on empty results (a non-empty result already proves the
// session is alive) and rate-limit via lastVerifiedAt so genuine no-matches
// don't spam WinLine.
export function needsLivenessProbe(
  recordCount: number,
  lastVerifiedAt: number,
  now: number,
  ttlMs: number = PROBE_VERIFY_TTL_MS,
): boolean {
  if (recordCount > 0) return false; // real data → session provably alive
  return now - lastVerifiedAt > ttlMs; // empty & not recently verified → probe
}
