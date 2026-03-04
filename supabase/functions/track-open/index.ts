import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 1x1 transparent GIF
const PIXEL = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), c => c.charCodeAt(0));

serve(async (req: Request) => {
  const url = new URL(req.url);
  const offerId = url.searchParams.get('offer_id');

  if (offerId) {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Update offer status to opened (only if currently 'sent' or 'delivered')
      const { data: offer } = await supabase
        .from('offers')
        .select('status')
        .eq('id', offerId)
        .single();

      if (offer && ['sent', 'delivered'].includes(offer.status)) {
        await supabase
          .from('offers')
          .update({ status: 'opened', opened_at: new Date().toISOString() })
          .eq('id', offerId);
      }

      // Log event
      await supabase.from('email_events').insert({
        offer_id: offerId,
        event_type: 'opened',
        metadata: {
          user_agent: req.headers.get('user-agent'),
          ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
        },
      });
    } catch (err) {
      console.error('track-open error:', err);
    }
  }

  return new Response(PIXEL, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
});
