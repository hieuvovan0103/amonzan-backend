-- =============================================
-- AMONZAN DATABASE MIGRATION 003
-- Add shop_profiles missing fields
-- =============================================

ALTER TABLE shop_profiles
ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS partner_type VARCHAR(50) DEFAULT 'individual',
ADD COLUMN IF NOT EXISTS identity_number VARCHAR(100),
ADD COLUMN IF NOT EXISTS identity_front_url TEXT,
ADD COLUMN IF NOT EXISTS identity_back_url TEXT,
ADD COLUMN IF NOT EXISTS province VARCHAR(100),
ADD COLUMN IF NOT EXISTS district VARCHAR(100),
ADD COLUMN IF NOT EXISTS address_detail VARCHAR(500);
