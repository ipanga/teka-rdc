-- Initiative #3 (Seller Payouts Operationalization) / B1
-- Reusable payout destination on the seller profile, so sellers don't re-enter
-- their mobile-money method + phone on every payout request. Nullable until the
-- seller configures it. Idempotent.

ALTER TABLE "seller_profiles" ADD COLUMN IF NOT EXISTS "payoutMethod" TEXT;
ALTER TABLE "seller_profiles" ADD COLUMN IF NOT EXISTS "payoutPhone" TEXT;
