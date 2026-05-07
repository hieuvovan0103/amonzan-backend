-- =============================================
-- AMONZAN DATABASE MIGRATION 006
-- Product review workflow
-- =============================================

ALTER TYPE "ProductStatus" ADD VALUE IF NOT EXISTS 'PENDING_REVIEW';
ALTER TYPE "ProductStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "ProductStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

ALTER TABLE products
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES user_profiles(user_id) ON DELETE SET NULL;

UPDATE products
SET status = 'APPROVED'
WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_products_review_status ON products(status, created_at);
