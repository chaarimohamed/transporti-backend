-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SENDER', 'CARRIER');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MissionStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "license" TEXT,
    "matricule" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" TEXT NOT NULL,
    "refNumber" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "cargo" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT,
    "senderId" TEXT NOT NULL,
    "carrierId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "missions" (
    "id" TEXT NOT NULL,
    "refNumber" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "cargo" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "MissionStatus" NOT NULL DEFAULT 'AVAILABLE',
    "description" TEXT,
    "carrierId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "missions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_refNumber_key" ON "shipments"("refNumber");

-- CreateIndex
CREATE UNIQUE INDEX "missions_refNumber_key" ON "missions"("refNumber");

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missions" ADD CONSTRAINT "missions_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
