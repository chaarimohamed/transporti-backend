-- AlterTable: add extra shipment fields for sender/recipient info, instructions, helper, meeting points
ALTER TABLE "shipments"
  ADD COLUMN "senderName"           TEXT,
  ADD COLUMN "senderPhone"          TEXT,
  ADD COLUMN "pickupInstructions"   TEXT,
  ADD COLUMN "recipientName"        TEXT,
  ADD COLUMN "recipientPhone"       TEXT,
  ADD COLUMN "deliveryInstructions" TEXT,
  ADD COLUMN "helperCount"          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pickupMeetingPoint"   TEXT NOT NULL DEFAULT 'vehicle',
  ADD COLUMN "deliveryMeetingPoint" TEXT NOT NULL DEFAULT 'vehicle';
