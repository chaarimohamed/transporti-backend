-- CreateTable
CREATE TABLE IF NOT EXISTS "shipment_feedback" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "senderToCarrierRating" INTEGER,
    "senderToCarrierComment" TEXT,
    "senderToCarrierSubmittedAt" TIMESTAMPTZ,
    "carrierToSenderRating" INTEGER,
    "carrierToSenderComment" TEXT,
    "carrierToSenderSubmittedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "shipment_feedback_shipmentId_key" ON "shipment_feedback"("shipmentId");
CREATE INDEX IF NOT EXISTS "shipment_feedback_senderId_idx" ON "shipment_feedback"("senderId");
CREATE INDEX IF NOT EXISTS "shipment_feedback_carrierId_idx" ON "shipment_feedback"("carrierId");

-- AddForeignKey (safe: only add if not exists)
DO $$ BEGIN
  ALTER TABLE "shipment_feedback" ADD CONSTRAINT "shipment_feedback_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "shipment_feedback" ADD CONSTRAINT "shipment_feedback_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "senders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "shipment_feedback" ADD CONSTRAINT "shipment_feedback_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "carriers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
