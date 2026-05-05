-- =============================================
-- AMONZAN DATABASE MIGRATION 004
-- Add logo_url to shop_profiles
-- =============================================

ALTER TABLE shop_profiles
ADD COLUMN IF NOT EXISTS logo_url TEXT;
