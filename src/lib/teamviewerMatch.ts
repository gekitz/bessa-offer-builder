// Frontend entry to the shared TeamViewer match logic. The matching/normalising
// lives beside the edge functions (supabase/functions/_shared/teamviewer.ts) so
// the teamviewer-proxy and the vitest suite exercise the same code. Import from
// here inside src/.
export * from '../../supabase/functions/_shared/teamviewer';
