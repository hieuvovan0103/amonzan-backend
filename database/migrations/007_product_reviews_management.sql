-- Product review management
-- Adds moderation fields and prevents duplicate product reviews for the same renter/order/product.

ALTER TABLE reviews
ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS hidden_by UUID REFERENCES user_profiles(user_id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_reviews_product_visible
ON reviews(target_type, target_id, is_hidden, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_product_order_renter
ON reviews(renter_profile_id, order_id, target_type, target_id)
WHERE target_type = 'PRODUCT';
