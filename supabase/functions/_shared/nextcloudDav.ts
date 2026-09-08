// Single source of truth for the Nextcloud WebDAV plumbing — the pure,
// network-free logic that turns a PROPFIND multistatus response into the
// customer folders that match a Kundennummer.
//
// Imported by BOTH worlds:
//   - the nextcloud-proxy edge function (Deno) — does the actual PROPFIND and
//     feeds the raw XML through parsePropfind() / findCustomerFolders(), and
//   - the React app + vitest via src/lib/nextcloudDav.ts.
//
// Keep this file dependency-free: Deno resolves it by relative path with no
// import map, and the frontend bundles it from outside src/.
//
// Folder convention (confirmed against the real Nextcloud): the Kundennummer
// is a SUFFIX of the folder name, e.g. "Zum Alois - 233679", "Uni Cafe -
// 273530", "WME Gastronomie GmbH - Euco Restaurant - 238243". So we anchor the
// match to the end of the name — never a substring — which also sidesteps the
// classic "12345 inside 123456" false positive.

export interface DavFolder {
  /** Raw href from the multistatus response (percent-encoded, path-only). */
  href: string;
  /** Human display name — displayname if present, else decoded basename. */
  name: string;
  /** true for <collection> resources (folders). */
  isCollection: boolean;
  /** Path relative to the account's files root, decoded, no trailing slash. */
  relPath: string;
}

export interface CustomerFolder {
  name: string;
  /** files-root-relative path, e.g. "/Kunden/Zum Alois - 233679". */
  relPath: string;
  /** Deep link that opens the folder in the Nextcloud web UI. */
  url: string;
}

// Match an optional XML namespace prefix (d:, D:, lp1:, …) on a tag name.
const NS = "(?:[\\w-]+:)?";

/** Minimal XML entity decode — enough for displaynames (& < > " '). */
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&"); // last, so "&amp;lt;" → "&lt;" not "<"
}

function safeDecodeURI(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Basename of a decoded path, ignoring a trailing slash. */
function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const i = trimmed.lastIndexOf("/");
  return i >= 0 ? trimmed.slice(i + 1) : trimmed;
}

/**
 * Turn an href into a path relative to the account's files root by stripping
 * everything up to and including the WebDAV files prefix. Robust to Nextcloud
 * living under a subdirectory (…/nextcloud/remote.php/dav/files/<user>).
 */
export function hrefToRelPath(href: string, davUserPrefix: string): string {
  const decoded = safeDecodeURI(href.trim());
  const marker = davUserPrefix.replace(/\/+$/, "");
  const idx = decoded.indexOf(marker);
  let rel = idx >= 0 ? decoded.slice(idx + marker.length) : decoded;
  rel = rel.replace(/\/+$/, ""); // drop trailing slash
  if (!rel.startsWith("/")) rel = "/" + rel;
  return rel;
}

/**
 * Parse a WebDAV PROPFIND multistatus body into folder entries. Namespace-
 * prefix agnostic (Nextcloud uses `d:`, others `D:`), regex-based so it needs
 * no XML library in Deno — same approach as the Mesonic proxy.
 */
export function parsePropfind(xml: string, davUserPrefix: string): DavFolder[] {
  const out: DavFolder[] = [];
  const respRe = new RegExp(`<${NS}response\\b[^>]*>([\\s\\S]*?)<\\/${NS}response>`, "gi");
  const hrefRe = new RegExp(`<${NS}href\\b[^>]*>([\\s\\S]*?)<\\/${NS}href>`, "i");
  const nameRe = new RegExp(`<${NS}displayname\\b[^>]*>([\\s\\S]*?)<\\/${NS}displayname>`, "i");
  const collRe = new RegExp(`<${NS}collection\\b[^>]*\\/?>`, "i");

  let m: RegExpExecArray | null;
  while ((m = respRe.exec(xml)) !== null) {
    const block = m[1];
    const hrefMatch = block.match(hrefRe);
    if (!hrefMatch) continue;
    const href = hrefMatch[1].trim();
    const relPath = hrefToRelPath(href, davUserPrefix);

    const nameMatch = block.match(nameRe);
    const displayname = nameMatch ? decodeEntities(nameMatch[1].trim()) : "";
    const name = displayname || basename(safeDecodeURI(href));

    out.push({ href, name, isCollection: collRe.test(block), relPath });
  }
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Does this folder name carry the given Kundennummer as its suffix?
 * Anchored to the end with a non-digit boundary before it, so "233679" matches
 * "Zum Alois - 233679" but "12345" never matches "Foo - 123456".
 */
export function matchesCustomerFolder(name: string, customerNumber: string): boolean {
  const num = String(customerNumber).trim();
  if (!num) return false;
  const re = new RegExp(`(^|\\D)${escapeRegex(num)}\\s*$`);
  return re.test(name.trim());
}

/** Build the "open this folder in Nextcloud" deep link. */
export function buildFolderUrl(baseUrl: string, relPath: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/apps/files/?dir=${encodeURIComponent(relPath)}`;
}

/**
 * End-to-end: parse a PROPFIND body and return the customer folders that match.
 * Excludes the queried base folder itself (its href === basePath) and any
 * non-collection entries.
 */
export function findCustomerFolders(
  xml: string,
  opts: { customerNumber: string; davUserPrefix: string; baseUrl: string; basePath?: string },
): CustomerFolder[] {
  const { customerNumber, davUserPrefix, baseUrl, basePath } = opts;
  const selfRel = basePath ? basePath.replace(/\/+$/, "") : null;
  return parsePropfind(xml, davUserPrefix)
    .filter((f) => f.isCollection)
    .filter((f) => f.relPath !== selfRel)
    .filter((f) => matchesCustomerFolder(f.name, customerNumber))
    .map((f) => ({ name: f.name, relPath: f.relPath, url: buildFolderUrl(baseUrl, f.relPath) }));
}
