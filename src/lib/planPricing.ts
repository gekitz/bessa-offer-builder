// Frontend entry to the shared payment-plan pricing module. The actual math
// lives beside the edge functions (supabase/functions/_shared/planPricing.ts)
// so stripe-complete-acceptance charges from the very same code the builder,
// PDF and accept page render. Import from here inside src/.
export * from '../../supabase/functions/_shared/planPricing';
