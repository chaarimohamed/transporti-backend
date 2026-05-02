/*
  Warnings:

  - You are about to drop the column `userId` on the `notifications` table. All the data in the column will be lost.
  - You are about to drop the `users` table. If the table is not empty, all the data it contains will be lost.

*/

-- Step 1: Create new tables for senders and carriers
CREATE TABLE "senders" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "senders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "carriers" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "license" TEXT,
    "matricule" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carriers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "senders_email_key" ON "senders"("email");
CREATE UNIQUE INDEX "carriers_email_key" ON "carriers"("email");

-- Step 2: Migrate data from users table to senders and carriers
INSERT INTO "senders" ("id", "email", "password", "firstName", "lastName", "phone", "createdAt", "updatedAt")
SELECT "id", "email", "password", "firstName", "lastName", "phone", "createdAt", "updatedAt"
FROM "users"
WHERE "role" = 'SENDER';

INSERT INTO "carriers" ("id", "email", "password", "firstName", "lastName", "phone", "license", "matricule", "createdAt", "updatedAt")
SELECT "id", "email", "password", "firstName", "lastName", "phone", "license", "matricule", "createdAt", "updatedAt"
FROM "users"
WHERE "role" = 'CARRIER';

-- Step 3: Add new columns to notifications table
ALTER TABLE "notifications" 
ADD COLUMN "carrierId" TEXT,
ADD COLUMN "senderId" TEXT;

-- Step 4: Migrate notification data based on user role
UPDATE "notifications" n
SET "senderId" = n."userId"
FROM "users" u
WHERE n."userId" = u."id" AND u."role" = 'SENDER';

UPDATE "notifications" n
SET "carrierId" = n."userId"
FROM "users" u
WHERE n."userId" = u."id" AND u."role" = 'CARRIER';

-- Step 5: Drop old foreign key constraints
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_userId_fkey";
ALTER TABLE "shipments" DROP CONSTRAINT "shipments_carrierId_fkey";
ALTER TABLE "shipments" DROP CONSTRAINT "shipments_senderId_fkey";

-- Step 6: Drop userId column and old index
DROP INDEX "notifications_userId_read_idx";
ALTER TABLE "notifications" DROP COLUMN "userId";

-- Step 7: Drop users table and Role enum
DROP TABLE "users";
DROP TYPE "Role";

-- Step 8: Add new foreign keys
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "senders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "carriers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "senders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "carriers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 9: Create new indexes
CREATE INDEX "notifications_senderId_read_idx" ON "notifications"("senderId", "read");
CREATE INDEX "notifications_carrierId_read_idx" ON "notifications"("carrierId", "read");

