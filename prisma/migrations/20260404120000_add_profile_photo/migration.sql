-- AlterTable: add profilePhoto column to senders and carriers
ALTER TABLE "senders" ADD COLUMN "profilePhoto" TEXT;
ALTER TABLE "carriers" ADD COLUMN "profilePhoto" TEXT;
