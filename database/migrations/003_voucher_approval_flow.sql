-- =============================================
-- AMONZAN DATABASE MIGRATION 003
-- Voucher approval flow
-- =============================================

ALTER TABLE vouchers
  ADD COLUMN IF NOT EXISTS scope VARCHAR(20) NOT NULL DEFAULT 'PLATFORM'
    CHECK (scope IN ('PLATFORM', 'SHOP')),
  ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shop_profiles(shop_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'APPROVED'
    CHECK (status IN ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED')),
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES user_profiles(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$ BEGIN
  ALTER TABLE vouchers
    ADD CONSTRAINT voucher_scope_shop_consistency
    CHECK (
      (scope = 'SHOP' AND shop_id IS NOT NULL)
      OR (scope = 'PLATFORM' AND shop_id IS NULL)
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_vouchers_code ON vouchers (UPPER(code));
CREATE INDEX IF NOT EXISTS idx_vouchers_status_scope ON vouchers (status, scope);
CREATE INDEX IF NOT EXISTS idx_vouchers_shop ON vouchers (shop_id);

