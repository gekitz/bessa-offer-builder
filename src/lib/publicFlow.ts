// Which URL query params denote a PUBLIC, customer-facing flow that must
// bypass the Microsoft-SSO wall (ProtectedRoute in main.jsx). Each of these
// authenticates via its own share token in the URL, not via SSO:
//   ?a=<share_code>  offer accept page
//   ?t=<share_code>  ticket-tracking portal
//   ?c=<token>       campaign landing (RKSV wizard etc.)
//
// This is the single source of truth for the auth-wall bypass. App.jsx routes
// each param to its own page; if you add a new customer-facing flow there,
// add its param HERE too — otherwise the page renders only for already-logged-
// in users and external recipients get bounced to the SSO login.
export const PUBLIC_FLOW_PARAMS = ['a', 't', 'c'] as const;

export function isPublicFlow(search: URLSearchParams): boolean {
  return PUBLIC_FLOW_PARAMS.some((p) => search.has(p));
}
