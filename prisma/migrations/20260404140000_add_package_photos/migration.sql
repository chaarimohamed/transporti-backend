-- Add packagePhotos column to shipments table (TEXT array for base64 images)
ALTER TABLE "shipments" ADD COLUMN "packagePhotos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
