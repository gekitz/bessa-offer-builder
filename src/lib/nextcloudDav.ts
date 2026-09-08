// Frontend entry to the shared Nextcloud WebDAV logic. The parsing/matching
// lives beside the edge functions (supabase/functions/_shared/nextcloudDav.ts)
// so the nextcloud-proxy and the vitest suite exercise the very same code.
// Import from here inside src/.
export * from '../../supabase/functions/_shared/nextcloudDav';
