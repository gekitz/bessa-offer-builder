// Deep-link parsing for the builder's `?offer=` query param.
//
// The param is overloaded across three historical cases:
//   1. `/?offer=<uuid>`               — open a saved offer by id. Fallback path:
//                                        the offer-accepted notification now
//                                        links via ?s=<share_code>, but
//                                        already-sent emails carry this form.
//   2. `/?offer=<base64-blob>`        — legacy shareable-state URL (never used in
//                                        production; kept for backwards compat).
//   3. `/?action=…&offer=<id>`        — the offer id belongs to another flow
//                                        (e.g. ?action=send-followup), handled by
//                                        that flow's own effect.
//
// Only case 1 is a load-by-id. This isolates that decision so it can be tested
// without standing up the whole builder page.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns the offer id to load when the URL is a bare `/?offer=<uuid>` deep
 * link, or null for the legacy base64 blob and action-owned id cases.
 */
export function offerIdFromDeepLink(
  search: string | URLSearchParams,
): string | null {
  const params =
    typeof search === 'string' ? new URLSearchParams(search) : search;
  const offer = params.get('offer');
  if (!offer || params.get('action')) return null;
  return UUID_RE.test(offer) ? offer : null;
}
