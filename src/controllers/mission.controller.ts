import { Request, Response } from 'express';
import { ShipmentStatus } from '@prisma/client';
import prisma from '../config/database';

// Get available missions (for carriers to browse)
export const getAvailableMissions = async (req: Request, res: Response) => {
  try {
    const { status, sortBy } = req.query;

    const where: any = {
      status: status as ShipmentStatus || 'PENDING',
    };

    const missions = await prisma.shipment.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        carrier: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });

    res.json({ missions });
  } catch (error) {
    console.error('Error fetching missions:', error);
    res.status(500).json({ error: 'Failed to fetch missions' });
  }
};

// Get my missions (missions assigned to the logged-in carrier)
export const getMyMissions = async (req: Request, res: Response) => {
  try {
    const carrierId = (req as any).user.id;
    const { status } = req.query;

    const where: any = {
      carrierId,
    };

    if (status) {
      where.status = status as ShipmentStatus;
    }

    const missions = await prisma.shipment.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({ missions });
  } catch (error) {
    console.error('Error fetching my missions:', error);
    res.status(500).json({ error: 'Failed to fetch missions' });
  }
};

// Get mission by ID
export const getMissionById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const mission = await prisma.shipment.findUnique({
      where: { id },
      include: {
        carrier: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            matricule: true,
          },
        },
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });

    if (!mission) {
      return res.status(404).json({ error: 'Mission not found' });
    }

    res.json({ mission });
  } catch (error) {
    console.error('Error fetching mission:', error);
    res.status(500).json({ error: 'Failed to fetch mission' });
  }
};

// Accept a mission
export const acceptMission = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const carrierId = (req as any).user.id;
    const { counterOffer } = req.body;

    const mission = await prisma.shipment.findUnique({
      where: { id },
    });

    if (!mission) {
      return res.status(404).json({ error: 'Mission not found' });
    }

    if (mission.status !== 'PENDING' && mission.status !== 'REQUESTED') {
      return res.status(400).json({ error: 'Mission is not available' });
    }

    const updatedMission = await prisma.shipment.update({
      where: { id },
      data: {
        carrierId,
        status: 'CONFIRMED',
        price: counterOffer || mission.price,
      },
      include: {
        carrier: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });

    // BUG-01 fix: notify the sender that a transporter accepted their mission
    if (mission.senderId) {
      await prisma.notification.create({
        data: {
          type: 'REQUEST_ACCEPTED',
          title: '✅ Transporteur confirmé',
          message: `Un transporteur a accepté votre expédition ${mission.refNumber}. La livraison est maintenant confirmée.`,
          senderId: mission.senderId,
          shipmentId: id,
          data: {
            carrierId,
            shipmentRefNumber: mission.refNumber,
          },
        },
      });
      console.log(`🔔 Notification sent to sender ${mission.senderId} — carrier accepted mission ${mission.refNumber}`);
    }

    res.json({ mission: updatedMission });
  } catch (error) {
    console.error('Error accepting mission:', error);
    res.status(500).json({ error: 'Failed to accept mission' });
  }
};

// Update mission status
export const updateMissionStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const carrierId = (req as any).user.id;

    console.log('🔄 Update mission status request:', { id, status, carrierId });

    const mission = await prisma.shipment.findUnique({
      where: { id },
    });

    if (!mission) {
      return res.status(404).json({ error: 'Mission not found' });
    }

    console.log('📦 Mission found:', { 
      missionId: mission.id, 
      missionCarrierId: mission.carrierId,
      requestCarrierId: carrierId,
      status: mission.status 
    });

    // Check if carrier is authorized (must be assigned to this carrier)
    if (mission.carrierId && mission.carrierId !== carrierId) {
      console.log('❌ Authorization failed: carrier mismatch');
      return res.status(403).json({ error: 'Not authorized' });
    }

    // If no carrier assigned yet, assign it to the current carrier
    const updateData: any = { status: status as ShipmentStatus };
    if (!mission.carrierId) {
      console.log('➕ Assigning mission to carrier:', carrierId);
      updateData.carrierId = carrierId;
    }

    // Intercept: carrier requesting IN_TRANSIT must first wait for sender handover confirmation.
    // Instead of going directly to IN_TRANSIT, we set HANDOVER_PENDING and notify the sender.
    if (status === 'IN_TRANSIT' && mission.status === 'CONFIRMED') {
      updateData.status = 'HANDOVER_PENDING';

      const handoverMission = await prisma.shipment.update({
        where: { id },
        data: updateData,
        include: {
          carrier: { select: { id: true, firstName: true, lastName: true, phone: true } },
          sender: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      if (mission.senderId) {
        await prisma.notification.create({
          data: {
            senderId: mission.senderId,
            shipmentId: mission.id,
            type: 'HANDOVER_REQUESTED',
            title: '📦 Remise du colis',
            message: `Le transporteur est arrivé pour récupérer votre colis (${mission.refNumber}). Veuillez confirmer que vous lui avez remis le colis.`,
            data: { shipmentId: mission.id, shipmentRefNumber: mission.refNumber },
          },
        });
        console.log(`🔔 HANDOVER_REQUESTED notification sent to sender ${mission.senderId} for mission ${mission.refNumber}`);
      }

      console.log('✅ Mission set to HANDOVER_PENDING — awaiting sender confirmation');
      return res.json({ mission: handoverMission });
    }

    const updatedMission = await prisma.shipment.update({
      where: { id },
      data: updateData,
      include: {
        carrier: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Send notification to sender about status change
    if (mission.senderId && status === 'IN_TRANSIT') {
      // BUG-03 fix: shipmentId must be the top-level DB field, not buried in data JSON
      await prisma.notification.create({
        data: {
          senderId: mission.senderId,
          shipmentId: mission.id,
          type: 'SHIPMENT_IN_TRANSIT',
          title: '🚚 En route',
          message: `Le transporteur a récupéré votre colis (${mission.refNumber}) et est en route vers la destination.`,
          data: { shipmentId: mission.id, shipmentRefNumber: mission.refNumber },
        },
      });
      console.log(`🔔 IN_TRANSIT notification sent to sender ${mission.senderId} for mission ${mission.refNumber}`);
    }

    console.log('✅ Mission updated successfully:', updatedMission.status);
    res.json({ mission: updatedMission });
  } catch (error) {
    console.error('Error updating mission status:', error);
    res.status(500).json({ error: 'Failed to update mission status' });
  }
};

// Confirm delivery with payment code
export const confirmDelivery = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { code } = req.body;
    const carrierId = (req as any).user.id;

    console.log('💰 Confirm delivery request:', { id, code, carrierId });

    const mission = await prisma.shipment.findUnique({
      where: { id },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!mission) {
      return res.status(404).json({ error: 'Mission not found' });
    }

    if (mission.carrierId !== carrierId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Validate delivery code against the stored one-time code on the shipment
    // Fall back to '000000' for shipments that became IN_TRANSIT before this feature
    const expectedCode = mission.deliveryCode ?? '000000';
    if (code !== expectedCode) {
      return res.status(400).json({ 
        success: false,
        error: 'Code incorrect',
        attemptsLeft: 2,
      });
    }

    // Update mission status to DELIVERED
    const updatedMission = await prisma.shipment.update({
      where: { id },
      data: { status: 'DELIVERED' },
      include: {
        carrier: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            matricule: true,
          },
        },
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });

    // Send notification to sender
    if (mission.senderId) {
      // BUG-04 fix: shipmentId must be the top-level DB field so the mobile deep-link works
      await prisma.notification.create({
        data: {
          senderId: mission.senderId,
          shipmentId: mission.id,
          type: 'SHIPMENT_DELIVERED',
          title: '🎉 Livraison confirmée',
          message: `Votre colis (${mission.refNumber}) a été livré avec succès. Le code de confirmation a été validé.`,
          data: { shipmentId: mission.id, shipmentRefNumber: mission.refNumber },
        },
      });
      console.log(`🔔 DELIVERED notification sent to sender ${mission.senderId} for mission ${mission.refNumber}`);
    }

    console.log('✅ Delivery confirmed successfully');
    res.json({ 
      success: true,
      mission: updatedMission,
      receiptNumber: `RCP${Math.floor(Math.random() * 10000)}`,
    });
  } catch (error) {
    console.error('Error confirming delivery:', error);
    res.status(500).json({ error: 'Failed to confirm delivery' });
  }
};

// Cancel mission
export const cancelMission = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const carrierId = (req as any).user.id;

    const mission = await prisma.shipment.findUnique({
      where: { id },
    });

    if (!mission) {
      return res.status(404).json({ error: 'Mission not found' });
    }

    if (mission.carrierId !== carrierId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const updatedMission = await prisma.shipment.update({
      where: { id },
      data: {
        status: 'CANCELLED',
      },
    });

    res.json({ mission: updatedMission });
  } catch (error) {
    console.error('Error canceling mission:', error);
    res.status(500).json({ error: 'Failed to cancel mission' });
  }
};

// Get mission stats
export const getMissionStats = async (req: Request, res: Response) => {
  try {
    const carrierId = (req as any).user.id;

    const [assigned, inProgress, completed] = await Promise.all([
      prisma.shipment.count({
        where: { carrierId, status: 'CONFIRMED' },
      }),
      prisma.shipment.count({
        where: { carrierId, status: 'IN_TRANSIT' },
      }),
      prisma.shipment.count({
        where: { carrierId, status: 'DELIVERED' },
      }),
    ]);

    res.json({
      stats: {
        assigned,
        inProgress,
        completed,
      },
    });
  } catch (error) {
    console.error('Error fetching mission stats:', error);
    res.status(500).json({ error: 'Failed to fetch mission stats' });
  }
};
