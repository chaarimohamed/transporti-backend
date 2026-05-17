-- Add optional budget range to shipments
ALTER TABLE "shipments" ADD COLUMN "budgetMin" DOUBLE PRECISION;
ALTER TABLE "shipments" ADD COLUMN "budgetMax" DOUBLE PRECISION;
