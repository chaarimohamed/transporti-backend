-- AlterEnum
ALTER TYPE "ApplicationStatus" ADD VALUE 'COUNTER_OFFERED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'COUNTER_OFFER';
ALTER TYPE "NotificationType" ADD VALUE 'COUNTER_ACCEPTED';

-- AlterTable
ALTER TABLE "carriers" ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "senders" ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "shipment_applications" ADD COLUMN     "counterPrice" DOUBLE PRECISION;
