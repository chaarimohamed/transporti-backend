-- Add separate deliveryHelperCount for the delivery screen helper dropdown
ALTER TABLE "shipments" ADD COLUMN "deliveryHelperCount" INTEGER NOT NULL DEFAULT 0;
