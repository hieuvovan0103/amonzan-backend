-- =============================================
-- AMONZAN DATABASE MIGRATION 004
-- Add created_at to vouchers for listing/sorting
-- =============================================

ALTER TABLE vouchers
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

