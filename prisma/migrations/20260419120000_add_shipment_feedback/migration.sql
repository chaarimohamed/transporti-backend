-- Add sender rating aggregates
ALTER TABLE "senders"
ADD COLUMN "averageRating" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN "totalReviews" INTEGER NOT NULL DEFAULT 0;

-- Create per-shipment feedback table
CREATE TABLE "shipment_feedback" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "senderToCarrierRating" INTEGER,
    "senderToCarrierComment" TEXT,
    "senderToCarrierSubmittedAt" TIMESTAMP(3),
    "carrierToSenderRating" INTEGER,
    "carrierToSenderComment" TEXT,
    "carrierToSenderSubmittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipment_feedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shipment_feedback_shipmentId_key" ON "shipment_feedback"("shipmentId");
CREATE INDEX "shipment_feedback_senderId_idx" ON "shipment_feedback"("senderId");
CREATE INDEX "shipment_feedback_carrierId_idx" ON "shipment_feedback"("carrierId");

ALTER TABLE "shipment_feedback" ADD CONSTRAINT "shipment_feedback_shipmentId_fkey"
FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shipment_feedback" ADD CONSTRAINT "shipment_feedback_senderId_fkey"
FOREIGN KEY ("senderId") REFERENCES "senders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shipment_feedback" ADD CONSTRAINT "shipment_feedback_carrierId_fkey"
FOREIGN KEY ("carrierId") REFERENCES "carriers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve existing sender -> carrier reviews
INSERT INTO "shipment_feedback" (
    "id",
    "shipmentId",
    "senderId",
    "carrierId",
    "senderToCarrierRating",
    "senderToCarrierComment",
    "senderToCarrierSubmittedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "shipmentId",
    "senderId",
    "carrierId",
    ROUND("rating")::INTEGER,
    "comment",
    "createdAt",
    "createdAt",
    "updatedAt"
FROM "reviews";

-- Refresh cached carrier rating fields from migrated feedback
UPDATE "carriers" AS c
SET
    "averageRating" = COALESCE(stats."averageRating", 0),
    "totalReviews" = COALESCE(stats."totalReviews", 0)
FROM (
    SELECT
        "carrierId",
        AVG("senderToCarrierRating")::DOUBLE PRECISION AS "averageRating",
        COUNT("senderToCarrierRating")::INTEGER AS "totalReviews"
    FROM "shipment_feedback"
    WHERE "senderToCarrierRating" IS NOT NULL
    GROUP BY "carrierId"
) AS stats
WHERE c."id" = stats."carrierId";

-- Remove replaced one-way review table
DROP TABLE "reviews";