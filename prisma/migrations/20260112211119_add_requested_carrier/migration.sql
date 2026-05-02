-- AlterEnum
ALTER TYPE "ShipmentStatus" ADD VALUE 'REQUESTED';

-- AlterTable
ALTER TABLE "shipments" ADD COLUMN     "requestedCarrierId" TEXT;
