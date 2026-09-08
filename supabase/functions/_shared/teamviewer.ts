// Single source of truth for the TeamViewer match logic — the pure,
// network-free code that turns a groups+devices snapshot into the devices that
// belong to a given Kundennummer, plus the connect-link builder.
//
// Imported by BOTH worlds:
//   - the teamviewer-proxy edge function (Deno) — fetches groups+devices and
//     feeds them through normalizeSnapshot()/findCustomerDevices(), and
//   - the React app + vitest via src/lib/teamviewerMatch.ts.
//
// Keep this file dependency-free: Deno resolves it by relative path with no
// import map, and the frontend bundles it from outside src/.
//
// Structure of the customer's Computers & Contacts (confirmed against the real
// account) is NOT uniformly "one group = one customer":
//   - Customer groups: the group IS the customer (e.g. "Zum Alois - 233679").
//     The Kundennummer lives on the GROUP name.
//   - Product groups: the group is a software bucket (e.g. "ETRON"), and every
//     DEVICE inside is a different customer. The Kundennummer lives on the
//     DEVICE alias.
// So a device belongs to a customer when the Kundennummer appears as a suffix
// on EITHER the device alias OR its group name. Number-only, anchored to the
// end with a non-digit boundary — no fuzzy name matching (so no wrong guesses).

export interface TvDevice {
  remotecontrol_id: string;
  alias: string;
  groupid: string;
  groupName: string;
  online: boolean;
  lastSeen?: string;
}

export interface CustomerDevice {
  alias: string;
  groupName: string;
  online: boolean;
  lastSeen?: string;
  /** Deep link that launches the technician's local TeamViewer client. */
  url: string;
}

/** Native URI scheme that launches the installed TeamViewer client. */
export const TV_CONNECT_SCHEME = "teamviewer://control?device=";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Does this text carry the Kundennummer as its suffix? Anchored to the end with
 * a non-digit boundary, so "233679" matches "Zum Alois - 233679" and
 * "Aichholzer KFZ - 233679" but "12345" never matches "... - 123456".
 */
export function matchesKundennummer(text: string, customerNumber: string): boolean {
  const num = String(customerNumber ?? "").trim();
  if (!num || !text) return false;
  const re = new RegExp(`(^|\\D)${escapeRegex(num)}\\s*$`);
  return re.test(String(text).trim());
}

/** Build the "connect" deep link for a device. */
export function buildConnectUrl(remotecontrolId: string, scheme: string = TV_CONNECT_SCHEME): string {
  return `${scheme}${remotecontrolId}`;
}

/**
 * Normalise the raw TeamViewer API payloads (groups list + devices list) into a
 * flat, self-contained device array with the group name resolved onto each
 * device. Tolerant of missing fields.
 */
export function normalizeSnapshot(
  groupsPayload: { groups?: Array<{ id?: string; name?: string }> } | null,
  devicesPayload: { devices?: Array<Record<string, unknown>> } | null,
): TvDevice[] {
  const groupNameById = new Map<string, string>();
  for (const g of groupsPayload?.groups ?? []) {
    if (g?.id) groupNameById.set(g.id, String(g.name ?? "").trim());
  }

  const out: TvDevice[] = [];
  for (const d of devicesPayload?.devices ?? []) {
    const remotecontrol_id = String(d.remotecontrol_id ?? "").trim();
    if (!remotecontrol_id) continue;
    const groupid = String(d.groupid ?? "").trim();
    out.push({
      remotecontrol_id,
      alias: String(d.alias ?? "").trim(),
      groupid,
      groupName: groupNameById.get(groupid) ?? "",
      online: String(d.online_state ?? "").toLowerCase() === "online",
      lastSeen: typeof d.last_seen === "string" ? d.last_seen : undefined,
    });
  }
  return out;
}

/**
 * The devices belonging to a Kundennummer: matched by the number appearing as a
 * suffix on the device alias OR its group name. Online devices first, then by
 * alias. Returns each with a ready-to-use connect link.
 */
export function findCustomerDevices(
  snapshot: TvDevice[],
  customerNumber: string,
  scheme: string = TV_CONNECT_SCHEME,
): CustomerDevice[] {
  const num = String(customerNumber ?? "").trim();
  if (!num) return [];

  return (snapshot ?? [])
    .filter((d) => matchesKundennummer(d.alias, num) || matchesKundennummer(d.groupName, num))
    .sort((a, b) => (a.online === b.online ? a.alias.localeCompare(b.alias) : a.online ? -1 : 1))
    .map((d) => ({
      alias: d.alias,
      groupName: d.groupName,
      online: d.online,
      lastSeen: d.lastSeen,
      url: buildConnectUrl(d.remotecontrol_id, scheme),
    }));
}
