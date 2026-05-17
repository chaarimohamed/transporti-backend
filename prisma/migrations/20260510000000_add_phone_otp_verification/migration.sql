-- Add phone OTP verification fields to senders and carriers
ALTER TABLE "senders"
  ADD COLUMN IF NOT EXISTS "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "otpCode"       TEXT,
  ADD COLUMN IF NOT EXISTS "otpExpiry"     TIMESTAMP(3);

ALTER TABLE "carriers"
  ADD COLUMN IF NOT EXISTS "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "otpCode"       TEXT,
  ADD COLUMN IF NOT EXISTS "otpExpiry"     TIMESTAMP(3);
