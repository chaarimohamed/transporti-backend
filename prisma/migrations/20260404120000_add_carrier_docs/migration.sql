-- AlterTable: add encrypted document fields and upload timestamp to carriers
ALTER TABLE "carriers" ADD COLUMN "cinDoc" TEXT;
ALTER TABLE "carriers" ADD COLUMN "permisDoc" TEXT;
ALTER TABLE "carriers" ADD COLUMN "docsUploadedAt" TIMESTAMP(3);
