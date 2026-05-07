-- Supabase/PostgREST upsert cannot target the partial unique index used for
-- renter reviews, so provide a non-partial unique index that matches the
-- onConflict column list in orders.service.ts.

CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_renter_order_shop_upsert
ON reviews(reviewer_shop_id, order_id, target_type, target_id);

NOTIFY pgrst, 'reload schema';
