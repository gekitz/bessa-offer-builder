// Path ↔ AppSection mapping for react-router. We deploy on GitHub
// Pages with HashRouter so the URL looks like:
//   https://bessa.kitz.co.at/#/leaves      → urlaub
//   https://bessa.kitz.co.at/#/angebote    → angebote
//   https://bessa.kitz.co.at/#/crm         → crm
//
// "leaves" is the public-facing slug we hand out (printed on the
// office QR). The internal section id stays "urlaub" so most of the
// codebase doesn't need to learn the new word; both `/leaves` and
// `/urlaub` resolve to the same view.

export type AppSection = 'angebote' | 'crm' | 'urlaub';

const SECTION_TO_PATH: Record<AppSection, string> = {
  angebote: '/angebote',
  crm: '/crm',
  urlaub: '/leaves',
};

const PATH_ALIASES: Record<string, AppSection> = {
  '/': 'angebote',
  '/angebote': 'angebote',
  '/offers': 'angebote',
  '/crm': 'crm',
  '/leaves': 'urlaub',
  '/urlaub': 'urlaub',
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
