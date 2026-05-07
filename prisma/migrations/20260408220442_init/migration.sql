-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING', 'REQUESTED', 'CONFIRMED', 'HANDOVER_PENDING', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('CARRIER_REQUEST', 'SHIPMENT_INVITATION', 'REQUEST_ACCEPTED', 'REQUEST_REJECTED', 'HANDOVER_REQUESTED', 'HANDOVER_CONFIRMED', 'SHIPMENT_IN_TRANSIT', 'SHIPMENT_DELIVERED');

-- CreateTable
CREATE TABLE "senders" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "dateOfBirth" TEXT,
    "profilePhoto" TEXT,
    "resetToken" TEXT,
    "resetTokenExpiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "senders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carriers" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "gouvernerat" TEXT,
    "license" TEXT,
    "matricule" TEXT,
    "vehicleType" TEXT,
    "vehicleSize" TEXT,
    "dateOfBirth" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "profilePhoto" TEXT,
    "cinDoc" TEXT,
    "permisDoc" TEXT,
    "docsUploadedAt" TIMESTAMP(3),
    "averageRating" DOUBLE PRECISION DEFAULT 0,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "resetToken" TEXT,
    "resetTokenExpiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carriers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" TEXT NOT NULL,
    "refNumber" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "cargo" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT,
    "senderId" TEXT NOT NULL,
    "carrierId" TEXT,
    "requestedCarrierId" TEXT,
    "senderName" TEXT,
    "senderPhone" TEXT,
    "pickupInstructions" TEXT,
    "recipientName" TEXT,
    "recipientPhone" TEXT,
    "deliveryInstructions" TEXT,
    "helperCount" INTEGER NOT NULL DEFAULT 0,
    "deliveryHelperCount" INTEGER NOT NULL DEFAULT 0,
    "pickupMeetingPoint" TEXT NOT NULL DEFAULT 'vehicle',
    "deliveryMeetingPoint" TEXT NOT NULL DEFAULT 'vehicle',
    "packagePhotos" TEXT[],
    "deliveryCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "senderId" TEXT,
    "carrierId" TEXT,
    "shipmentId" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "comment" TEXT,
    "carrierId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "senders_email_key" ON "senders"("email");

-- CreateIndex
CREATE UNIQUE INDEX "senders_resetToken_key" ON "senders"("resetToken");

-- CreateIndex
CREATE UNIQUE INDEX "carriers_email_key" ON "carriers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "carriers_resetToken_key" ON "carriers"("resetToken");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_refNumber_key" ON "shipments"("refNumber");

-- CreateIndex
CREATE INDEX "notifications_senderId_read_idx" ON "notifications"("senderId", "read");

-- CreateIndex
CREATE INDEX "notifications_carrierId_read_idx" ON "notifications"("carrierId", "read");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_shipmentId_key" ON "reviews"("shipmentId");

-- CreateIndex
CREATE INDEX "reviews_carrierId_idx" ON "reviews"("carrierId");

-- CreateIndex
CREATE INDEX "reviews_senderId_idx" ON "reviews"("senderId");

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "senders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "carriers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_requestedCarrierId_fkey" FOREIGN KEY ("requestedCarrierId") REFERENCES "carriers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "senders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "carriers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "carriers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "senders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
