-- Add packagePhotos column to shipments table (TEXT array for base64 images)
ALTER TABLE "shipments" ADD COLUMN "packagePhotos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Match the schema end-state without requiring a follow-up cleanup migration.
ALTER TABLE "shipments" ALTER COLUMN "packagePhotos" DROP DEFAULT;
