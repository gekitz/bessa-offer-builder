// Path ↔ AppSection mapping for react-router. We deploy on GitHub
// Pages with HashRouter so the URL looks like:
//   https://bessa.kitz.co.at/#/kalender    → kalender
//   https://bessa.kitz.co.at/#/tickets     → tickets
//   https://bessa.kitz.co.at/#/angebote    → angebote
//   https://bessa.kitz.co.at/#/crm         → crm
//
// "leaves" is the public-facing slug originally handed out (printed
// on the office QR). It now resolves to the kalender section since
// CalendarPage hosts both the team calendar and the personal Urlaub
// tabs. Both `/leaves` and `/urlaub` remain valid aliases so any
// printed/bookmarked links keep working.

export type AppSection = 'dispatcher' | 'angebote' | 'crm' | 'kalender' | 'tickets';

const SECTION_TO_PATH: Record<AppSection, string> = {
  dispatcher: '/leitstelle',
  angebote: '/angebote',
  crm: '/crm',
  kalender: '/kalender',
  tickets: '/tickets',
};

const PATH_ALIASES: Record<string, AppSection> = {
  '/': 'angebote',
  '/angebote': 'angebote',
  '/offers': 'angebote',
  '/crm': 'crm',
  '/kalender': 'kalender',
  '/calendar': 'kalender',
  '/leaves': 'kalender',
  '/urlaub': 'kalender',
  '/tickets': 'tickets',
  '/leitstelle': 'dispatcher',
  '/dispatcher': 'dispatcher',
};

// Parse a router pathname into an app section. Tolerates trailing
// slashes and unknown values. Defaults to 'angebote'.
export function sectionFromPath(pathname: string): AppSection {
  if (!pathname) return 'angebote';
  // Normalise: lowercase, strip trailing slash (except root), keep
  // only the first segment so "/angebote/builder" still matches.
  const lower = pathname.toLowerCase();
  const trimmed = lower !== '/' ? lower.replace(/\/$/, '') : lower;
  if (PATH_ALIASES[trimmed]) return PATH_ALIASES[trimmed]!;
  // Match by first segment for nested routes like /angebote/builder.
  const firstSeg = '/' + (trimmed.split('/')[1] ?? '');
  return PATH_ALIASES[firstSeg] ?? 'angebote';
}

export function pathForSection(section: AppSection): string {
  return SECTION_TO_PATH[section];
}
