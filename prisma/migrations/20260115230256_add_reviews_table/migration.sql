-- AlterTable
ALTER TABLE "carriers" ADD COLUMN     "averageRating" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "totalReviews" INTEGER NOT NULL DEFAULT 0;

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
CREATE UNIQUE INDEX "reviews_shipmentId_key" ON "reviews"("shipmentId");

-- CreateIndex
CREATE INDEX "reviews_carrierId_idx" ON "reviews"("carrierId");

-- CreateIndex
CREATE INDEX "reviews_senderId_idx" ON "reviews"("senderId");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "carriers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "senders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
