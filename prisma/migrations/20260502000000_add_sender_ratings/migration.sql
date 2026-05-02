-- AlterTable: add missing rating fields to senders (carriers already have these from add_reviews_table)
ALTER TABLE "senders" ADD COLUMN IF NOT EXISTS "averageRating" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "senders" ADD COLUMN IF NOT EXISTS "totalReviews" INTEGER NOT NULL DEFAULT 0;
