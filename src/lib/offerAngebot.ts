// Frontend entry to the shared accepted-offer → WinLine-Angebot (Belegart 17)
// transform. The actual mapping lives beside the edge functions
// (supabase/functions/_shared/offerAngebot.ts) so export-offer-angebot writes
// the very same positions the builder freezes at save time. Import from here
// inside src/ (e.g. to build the frozen lineSnapshot shape).
export * from '../../supabase/functions/_shared/offerAngebot';
