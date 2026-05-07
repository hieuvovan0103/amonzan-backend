-- =============================================
-- AMONZAN DATABASE MIGRATION 002
-- Extend NotificationType enum to match backend
-- =============================================

DO $$ BEGIN
  ALTER TYPE "NotificationType" ADD VALUE 'ORDER_PAID';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "NotificationType" ADD VALUE 'ORDER_CONFIRMED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "NotificationType" ADD VALUE 'ORDER_RENTER_CONFIRMED_RECEIVED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "NotificationType" ADD VALUE 'EARLY_RETURN_REQUESTED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "NotificationType" ADD VALUE 'EARLY_RETURN_APPROVED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "NotificationType" ADD VALUE 'EARLY_RETURN_REJECTED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "NotificationType" ADD VALUE 'EARLY_RETURN_RECEIVED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "NotificationType" ADD VALUE 'ORDER_COMPLETED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

