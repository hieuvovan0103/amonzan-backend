-- Vendor-to-renter reviews and lightweight review reporting.

ALTER TABLE reviews
ALTER COLUMN renter_profile_id DROP NOT NULL;

ALTER TABLE reviews
ADD COLUMN IF NOT EXISTS reviewer_shop_id UUID REFERENCES shop_profiles(shop_id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS reported_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reported_by_user_id UUID REFERENCES user_profiles(user_id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS report_reason TEXT,
ADD COLUMN IF NOT EXISTS report_status VARCHAR(30) NOT NULL DEFAULT 'NONE';

CREATE INDEX IF NOT EXISTS idx_reviews_renter_target
ON reviews(target_type, target_id, is_hidden, created_at DESC)
WHERE target_type = 'RENTER';

CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_renter_order_shop
ON reviews(reviewer_shop_id, order_id, target_type, target_id)
WHERE target_type = 'RENTER';
