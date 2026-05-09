-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "shipments" ALTER COLUMN "price" DROP NOT NULL;

-- CreateTable
CREATE TABLE "shipment_applications" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "proposedPrice" DOUBLE PRECISION NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipment_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shipment_applications_shipmentId_carrierId_key" ON "shipment_applications"("shipmentId", "carrierId");

-- AddForeignKey
ALTER TABLE "shipment_applications" ADD CONSTRAINT "shipment_applications_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_applications" ADD CONSTRAINT "shipment_applications_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "carriers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
