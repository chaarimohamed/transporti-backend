/*
  Warnings:

  - A unique constraint covering the columns `[resetToken]` on the table `carriers` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[resetToken]` on the table `senders` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SHIPMENT_INVITATION';

-- AlterTable
ALTER TABLE "carriers" ADD COLUMN     "resetToken" TEXT,
ADD COLUMN     "resetTokenExpiry" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "senders" ADD COLUMN     "resetToken" TEXT,
ADD COLUMN     "resetTokenExpiry" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "carriers_resetToken_key" ON "carriers"("resetToken");

-- CreateIndex
CREATE UNIQUE INDEX "senders_resetToken_key" ON "senders"("resetToken");
