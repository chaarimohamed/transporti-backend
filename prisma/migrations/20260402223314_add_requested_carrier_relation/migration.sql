-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_requestedCarrierId_fkey" FOREIGN KEY ("requestedCarrierId") REFERENCES "carriers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
