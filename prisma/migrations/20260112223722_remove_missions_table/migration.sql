/*
  Warnings:

  - You are about to drop the `missions` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "missions" DROP CONSTRAINT "missions_carrierId_fkey";

-- DropTable
DROP TABLE "missions";

-- DropEnum
DROP TYPE "MissionStatus";
