-- Legacy OTP storage table.
-- Table nay da tung duoc dung cho flow tu generate OTP.
-- Hien tai app chuyen sang Supabase Auth phone verification,
-- nen bang nay chi duoc giu lai de dong bo schema voi database thuc te.

CREATE TABLE IF NOT EXISTS phone_verification_otps (
  otp_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  phone_number   VARCHAR(20) NOT NULL,
  otp_code       VARCHAR(10) NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  verified_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
