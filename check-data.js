const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const shipmentCount = await prisma.shipment.count();
  const missionCount = await prisma.mission.count();
  
  console.log('\n=== DATABASE SUMMARY ===\n');
  console.log(`📦 Shipments: ${shipmentCount}`);
  console.log(`🚛 Missions: ${missionCount}`);
  
  if (shipmentCount > 0) {
    const shipments = await prisma.shipment.findMany({
      select: { refNumber: true, status: true, senderId: true, carrierId: true, requestedCarrierId: true }
    });
    console.log('\n--- Shipments Details ---');
    shipments.forEach(s => {
      console.log(`${s.refNumber}: ${s.status} | Sender: ${s.senderId.substring(0,8)} | Carrier: ${s.carrierId?.substring(0,8) || 'none'} | Requested: ${s.requestedCarrierId?.substring(0,8) || 'none'}`);
    });
  }
  
  if (missionCount > 0) {
    const missions = await prisma.mission.findMany({
      select: { refNumber: true, status: true, carrierId: true }
    });
    console.log('\n--- Missions Details ---');
    missions.forEach(m => {
      console.log(`${m.refNumber}: ${m.status} | Carrier: ${m.carrierId?.substring(0,8) || 'none'}`);
    });
  }
}

main().finally(() => prisma.$disconnect());
