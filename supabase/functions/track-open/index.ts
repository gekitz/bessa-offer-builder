import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

// 1x1 transparent GIF — kept so email clients that loaded the pixel don't show a broken image.
// All open-tracking is now handled by the Resend webhook (resend-webhook function).
const PIXEL = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), c => c.charCodeAt(0));

serve(() => {
  return new Response(PIXEL, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
});
