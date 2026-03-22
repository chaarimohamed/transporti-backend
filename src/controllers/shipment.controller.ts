import { Request, Response } from 'express';
import prisma from '../config/database';
import { ShipmentStatus } from '@prisma/client';

// Generate reference number for shipments
const generateRefNumber = () => {
  return `EXP-${Math.floor(1000 + Math.random() * 9000)}`;
};

/**
 * Create new shipment
 * POST /api/shipments
 */
export const createShipment = async (req: any, res: Response) => {
  try {
    const {
      from,
      to,
      cargo,
      price,
      description,
      pickupDate,
      weight,
      format,
      dimensions,
      declaredValue,
      insurance,
      specialInstructions,
    } = req.body;

    // Validate required fields
    if (!from || !to || !price) {
      return res.status(400).json({
        success: false,
        error: 'Les champs "from", "to" et "price" sont obligatoires',
      });
    }

    // Create shipment
    const shipment = await prisma.shipment.create({
      data: {
        refNumber: generateRefNumber(),
        from,
        to,
        cargo: cargo || '',
        price: parseFloat(price),
        description: description || '',
        senderId: req.user.id, // From auth middleware
        status: ShipmentStatus.PENDING,
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      data: shipment,
    });
  } catch (error) {
    console.error('Create shipment error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la création de l\'expédition',
    });
  }
};

/**
 * Get all shipments for the authenticated sender
 * GET /api/shipments
 */
export const getMyShipments = async (req: any, res: Response) => {
  try {
    const { status } = req.query;
    const userRole = req.user.role?.toUpperCase();

    // Build where clause based on user role
    let where: any;
    
    if (userRole === 'CARRIER') {
      // For carriers: return shipments where they are assigned (carrierId) OR requested (requestedCarrierId)
      where = {
        OR: [
          { carrierId: req.user.id }, // Shipments assigned to this carrier (CONFIRMED, IN_TRANSIT, DELIVERED)
          { requestedCarrierId: req.user.id }, // Shipments requested by this carrier (REQUESTED)
        ],
      };
    } else {
      // For senders: return shipments they created
      where = {
        senderId: req.user.id,
      };
    }

    // Filter by status if provided
    if (status && status !== 'all') {
      where.status = status.toUpperCase();
    }

    const shipments = await prisma.shipment.findMany({
      where,
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
            phone: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.status(200).json({
      success: true,
      data: shipments,
    });
  } catch (error) {
    console.error('Get shipments error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des expéditions',
    });
  }
};

/**
 * Get all available shipments (for carriers to browse)
 * GET /api/shipments/available
 */
export const getAvailableShipments = async (req: any, res: Response) => {
  try {
    const { status } = req.query;

    // Build where clause - only truly available shipments
    // - PENDING status (not yet requested by any carrier)
    // - No carrier assigned
    // - No carrier has requested it yet
    const where: any = {
      status: ShipmentStatus.PENDING, // Only pending shipments
      carrierId: null, // Not yet assigned to a carrier
      requestedCarrierId: null, // No carrier has requested yet
    };

    const shipments = await prisma.shipment.findMany({
      where,
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.status(200).json({
      success: true,
      data: shipments,
    });
  } catch (error) {
    console.error('Get available shipments error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des expéditions disponibles',
    });
  }
};

/**
 * Get single shipment by ID
 * GET /api/shipments/:id
 */
export const getShipmentById = async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    const shipment = await prisma.shipment.findUnique({
      where: { id },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
          },
        },
        carrier: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            license: true,
            matricule: true,
          },
        },
      },
    });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: 'Expédition introuvable',
      });
    }

    // Debug logging
    console.log('🔍 Authorization check:', {
      shipmentId: shipment.id,
      status: shipment.status,
      userId: req.user.id,
      userRole: req.user.role,
      senderId: shipment.senderId,
      carrierId: shipment.carrierId,
      requestedCarrierId: shipment.requestedCarrierId,
    });

    // Check authorization:
    // - Senders can view their own shipments
    // - Carriers can view:
    //   1. Shipments assigned to them (carrierId matches)
    //   2. Shipments they've requested (requestedCarrierId matches)
    //   3. PENDING or REQUESTED shipments (can view but may not be able to apply)
    const isSender = shipment.senderId === req.user.id;
    const isAssignedCarrier = shipment.carrierId === req.user.id;
    const hasRequestedShipment = shipment.requestedCarrierId === req.user.id;
    const canViewShipment = req.user.role?.toUpperCase() === 'CARRIER' && 
      (shipment.status === ShipmentStatus.PENDING || shipment.status === ShipmentStatus.REQUESTED);

    console.log('🔐 Authorization results:', {
      isSender,
      isAssignedCarrier,
      hasRequestedShipment,
      canViewShipment,
      authorized: isSender || isAssignedCarrier || hasRequestedShipment || canViewShipment,
    });

    if (!isSender && !isAssignedCarrier && !hasRequestedShipment && !canViewShipment) {
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé',
      });
    }

    res.status(200).json({
      success: true,
      data: shipment,
    });
  } catch (error) {
    console.error('Get shipment error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération de l\'expédition',
    });
  }
};

/**
 * Request a shipment (carrier expresses interest)
 * POST /api/shipments/:id/request
 */
export const requestShipment = async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    // Check if user is a carrier
    if (req.user.role?.toUpperCase() !== 'CARRIER') {
      return res.status(403).json({
        success: false,
        error: 'Seuls les transporteurs peuvent demander des expéditions',
      });
    }

    // Find shipment
    const shipment = await prisma.shipment.findUnique({
      where: { id },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: 'Expédition introuvable',
      });
    }

    // Check if shipment is still available
    if (shipment.status !== ShipmentStatus.PENDING) {
      return res.status(400).json({
        success: false,
        error: 'Cette expédition n\'est plus disponible',
      });
    }

    // Check if this carrier has already requested this shipment
    if (shipment.requestedCarrierId === req.user.id) {
      return res.status(400).json({
        success: false,
        error: 'Vous avez déjà postulé pour cette expédition',
      });
    }

    // Check if another carrier has already requested this shipment
    if (shipment.requestedCarrierId) {
      return res.status(400).json({
        success: false,
        error: 'Un autre transporteur a déjà postulé pour cette expédition',
      });
    }

    // Update shipment with requested carrier
    const updatedShipment = await prisma.shipment.update({
      where: { id },
      data: {
        status: ShipmentStatus.REQUESTED,
        requestedCarrierId: req.user.id,
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        carrier: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Create notification for sender
    await prisma.notification.create({
      data: {
        type: 'CARRIER_REQUEST',
        title: 'Nouvelle candidature',
        message: `Un transporteur souhaite prendre votre expédition ${shipment.refNumber}`,
        senderId: shipment.senderId,
        shipmentId: shipment.id,
        data: {
          shipmentRefNumber: shipment.refNumber,
          carrierId: req.user.id,
        },
      },
    });

    // TODO: Send push notification to sender
    console.log(`Notification: Carrier ${req.user.id} requested shipment ${shipment.refNumber} from sender ${shipment.sender.email}`);

    res.status(200).json({
      success: true,
      message: 'Demande envoyée à l\'expéditeur avec succès',
      data: updatedShipment,
    });
  } catch (error) {
    console.error('Request shipment error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la demande d\'expédition',
    });
  }
};

/**
 * Invite a carrier to a shipment (sender invites specific carrier)
 * POST /api/shipments/:id/invite-carrier
 */
export const inviteCarrier = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { carrierId } = req.body;

    // Validate carrierId
    if (!carrierId) {
      return res.status(400).json({
        success: false,
        error: 'L\'ID du transporteur est obligatoire',
      });
    }

    // Find shipment
    const shipment = await prisma.shipment.findUnique({
      where: { id },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: 'Expédition introuvable',
      });
    }

    // Only sender can invite carriers
    if (shipment.senderId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé',
      });
    }

    // Check if shipment is available
    if (shipment.status !== ShipmentStatus.PENDING) {
      return res.status(400).json({
        success: false,
        error: 'Cette expédition n\'est plus disponible',
      });
    }

    // Find the carrier
    const carrier = await prisma.carrier.findUnique({
      where: { id: carrierId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });

    if (!carrier) {
      return res.status(404).json({
        success: false,
        error: 'Transporteur introuvable',
      });
    }

    // Create notification for carrier
    await prisma.notification.create({
      data: {
        type: 'SHIPMENT_INVITATION',
        title: 'Nouvelle invitation',
        message: `${shipment.sender.firstName} ${shipment.sender.lastName} vous invite à prendre en charge l'expédition ${shipment.refNumber}`,
        carrierId: carrierId,
        shipmentId: shipment.id,
        data: {
          shipmentRefNumber: shipment.refNumber,
          senderId: shipment.senderId,
          senderName: `${shipment.sender.firstName} ${shipment.sender.lastName}`,
        },
      },
    });

    console.log(`📧 Invitation sent: Sender ${shipment.sender.email} invited carrier ${carrier.email} for shipment ${shipment.refNumber}`);

    res.status(200).json({
      success: true,
      message: 'Invitation envoyée au transporteur avec succès',
      data: {
        shipmentId: shipment.id,
        carrierId: carrier.id,
        carrierName: `${carrier.firstName} ${carrier.lastName}`,
      },
    });
  } catch (error) {
    console.error('Invite carrier error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'invitation du transporteur',
    });
  }
};

/**
 * Accept invitation (carrier accepts sender's invitation)
 * POST /api/shipments/:id/accept-invitation
 */
export const acceptInvitation = async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    // Check if user is a carrier
    if (req.user.role?.toUpperCase() !== 'CARRIER') {
      return res.status(403).json({
        success: false,
        error: 'Seuls les transporteurs peuvent accepter des invitations',
      });
    }

    // Find shipment
    const shipment = await prisma.shipment.findUnique({
      where: { id },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: 'Expédition introuvable',
      });
    }

    // Check if shipment is still available
    if (shipment.status !== ShipmentStatus.PENDING) {
      return res.status(400).json({
        success: false,
        error: 'Cette expédition n\'est plus disponible',
      });
    }

    // Directly confirm the shipment (skip REQUESTED status since sender invited this carrier)
    const updatedShipment = await prisma.shipment.update({
      where: { id },
      data: {
        status: ShipmentStatus.CONFIRMED,
        carrierId: req.user.id,
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        carrier: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Create notification for sender
    await prisma.notification.create({
      data: {
        type: 'REQUEST_ACCEPTED',
        title: 'Invitation acceptée',
        message: `Le transporteur a accepté votre invitation pour l'expédition ${shipment.refNumber}`,
        senderId: shipment.senderId,
        shipmentId: shipment.id,
        data: {
          shipmentRefNumber: shipment.refNumber,
          carrierId: req.user.id,
        },
      },
    });

    // Delete the invitation notification for the carrier
    await prisma.notification.deleteMany({
      where: {
        shipmentId: id,
        carrierId: req.user.id,
        type: 'SHIPMENT_INVITATION',
      },
    });

    console.log(`✅ Carrier ${req.user.id} accepted invitation for shipment ${shipment.refNumber} - Status set to CONFIRMED`);

    res.status(200).json({
      success: true,
      message: 'Invitation acceptée avec succès',
      data: updatedShipment,
    });
  } catch (error) {
    console.error('Accept invitation error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'acceptation de l\'invitation',
    });
  }
};

/**
 * Accept carrier request (sender accepts a carrier's application)
 * POST /api/shipments/:id/accept-carrier
 */
export const acceptCarrier = async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    // Find shipment
    const shipment = await prisma.shipment.findUnique({
      where: { id },
      include: {
        sender: true,
      },
    });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: 'Expédition introuvable',
      });
    }

    // Only sender can accept carrier
    if (shipment.senderId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé',
      });
    }

    // Check if shipment is in REQUESTED status
    if (shipment.status !== ShipmentStatus.REQUESTED) {
      return res.status(400).json({
        success: false,
        error: 'Aucune demande de transporteur pour cette expédition',
      });
    }

    if (!shipment.requestedCarrierId) {
      return res.status(400).json({
        success: false,
        error: 'Aucun transporteur n\'a demandé cette expédition',
      });
    }

    // Accept the carrier - assign them and set status to CONFIRMED
    const updatedShipment = await prisma.shipment.update({
      where: { id },
      data: {
        carrierId: shipment.requestedCarrierId,
        status: ShipmentStatus.CONFIRMED,
      },
      include: {
        carrier: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
          },
        },
      },
    });

    // Create notification for carrier
    await prisma.notification.create({
      data: {
        type: 'REQUEST_ACCEPTED',
        title: 'Candidature acceptée',
        message: `Votre candidature pour l'expédition ${shipment.refNumber} a été acceptée`,
        carrierId: shipment.requestedCarrierId,
        shipmentId: shipment.id,
        data: {
          shipmentRefNumber: shipment.refNumber,
          senderId: req.user.id,
        },
      },
    });

    res.status(200).json({
      success: true,
      message: 'Transporteur accepté avec succès',
      data: updatedShipment,
    });
  } catch (error) {
    console.error('Accept carrier error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'acceptation du transporteur',
    });
  }
};

/**
 * Reject carrier request (sender rejects a carrier's application)
 * POST /api/shipments/:id/reject-carrier
 */
export const rejectCarrier = async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    // Find shipment
    const shipment = await prisma.shipment.findUnique({
      where: { id },
    });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: 'Expédition introuvable',
      });
    }

    // Only sender can reject carrier
    if (shipment.senderId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé',
      });
    }

    // Check if shipment is in REQUESTED status
    if (shipment.status !== ShipmentStatus.REQUESTED) {
      return res.status(400).json({
        success: false,
        error: 'Aucune demande de transporteur pour cette expédition',
      });
    }

    // Create notification for carrier before resetting
    await prisma.notification.create({
      data: {
        type: 'REQUEST_REJECTED',
        title: 'Candidature refusée',
        message: `Votre candidature pour l'expédition ${shipment.refNumber} a été refusée`,
        carrierId: shipment.requestedCarrierId!,
        shipmentId: id,
        data: {
          shipmentRefNumber: shipment.refNumber,
          senderId: req.user.id,
        },
      },
    });

    // Reset shipment back to PENDING so a new carrier can apply
    const resetShipment = await prisma.shipment.update({
      where: { id },
      data: {
        status: ShipmentStatus.PENDING,
        requestedCarrierId: null,
        carrierId: null,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Transporteur refusé. L\'expédition est à nouveau disponible.',
      data: resetShipment,
    });
  } catch (error) {
    console.error('Reject carrier error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors du refus du transporteur',
    });
  }
};

/**
 * Update shipment
 * PUT /api/shipments/:id
 */
export const updateShipment = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { from, to, cargo, price, description, status } = req.body;

    // Find shipment
    const shipment = await prisma.shipment.findUnique({
      where: { id },
    });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: 'Expédition introuvable',
      });
    }

    // Only sender can update their shipment
    if (shipment.senderId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé',
      });
    }

    // Update shipment
    const updated = await prisma.shipment.update({
      where: { id },
      data: {
        ...(from && { from }),
        ...(to && { to }),
        ...(cargo && { cargo }),
        ...(price && { price: parseFloat(price) }),
        ...(description && { description }),
        ...(status && { status: status.toUpperCase() as ShipmentStatus }),
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
          },
        },
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

    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('Update shipment error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour de l\'expédition',
    });
  }
};

/**
 * Cancel shipment (soft delete)
 * DELETE /api/shipments/:id
 */
export const cancelShipment = async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    // Find shipment
    const shipment = await prisma.shipment.findUnique({
      where: { id },
    });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: 'Expédition introuvable',
      });
    }

    // Only sender can cancel their shipment
    if (shipment.senderId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé',
      });
    }

    // Update status to CANCELLED
    const cancelled = await prisma.shipment.update({
      where: { id },
      data: {
        status: ShipmentStatus.CANCELLED,
      },
    });

    res.status(200).json({
      success: true,
      data: cancelled,
      message: 'Expédition annulée avec succès',
    });
  } catch (error) {
    console.error('Cancel shipment error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'annulation de l\'expédition',
    });
  }
};

/**
 * Update shipment status by carrier
 * PUT /api/shipments/:id/status
 */
export const updateShipmentStatus = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const carrierId = req.user.id;

    console.log('🔄 Carrier updating shipment status:', { id, status, carrierId });

    // Validate status
    const allowedStatuses = ['IN_TRANSIT', 'DELIVERED'];
    if (!status || !allowedStatuses.includes(status.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: 'Statut invalide. Les statuts autorisés sont: IN_TRANSIT, DELIVERED',
      });
    }

    // Find shipment
    const shipment = await prisma.shipment.findUnique({
      where: { id },
    });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: 'Expédition introuvable',
      });
    }

    // Only assigned carrier can update status
    if (shipment.carrierId !== carrierId) {
      return res.status(403).json({
        success: false,
        error: 'Vous n\'êtes pas autorisé à modifier cette expédition',
      });
    }

    // Validate status transition
    const newStatus = status.toUpperCase() as ShipmentStatus;
    if (newStatus === 'IN_TRANSIT' && shipment.status !== ShipmentStatus.CONFIRMED) {
      return res.status(400).json({
        success: false,
        error: 'L\'expédition doit être confirmée avant de pouvoir être mise en transit',
      });
    }

    if (newStatus === 'DELIVERED' && shipment.status !== ShipmentStatus.IN_TRANSIT) {
      return res.status(400).json({
        success: false,
        error: 'L\'expédition doit être en transit avant de pouvoir être livrée',
      });
    }

    // Update shipment status
    const updated = await prisma.shipment.update({
      where: { id },
      data: { status: newStatus },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
          },
        },
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

    // Create notification for sender
    await prisma.notification.create({
      data: {
        type: newStatus === 'IN_TRANSIT' ? 'SHIPMENT_IN_TRANSIT' : 'SHIPMENT_DELIVERED',
        title: newStatus === 'IN_TRANSIT' 
          ? 'Expédition en transit'
          : 'Expédition livrée',
        message: newStatus === 'IN_TRANSIT' 
          ? `L'expédition ${shipment.refNumber} est maintenant en transit`
          : `L'expédition ${shipment.refNumber} a été livrée`,
        senderId: shipment.senderId,
        shipmentId: shipment.id,
        read: false,
      },
    });

    console.log('✅ Shipment status updated:', { id, newStatus });

    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('Update shipment status error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour du statut',
    });
  }
};

/**
 * Get shipment statistics for dashboard
 * GET /api/shipments/stats
 */
export const getShipmentStats = async (req: any, res: Response) => {
  try {
    const senderId = req.user.id;

    // Get counts by status
    const [inProgress, pending, requested, delivered, total] = await Promise.all([
      prisma.shipment.count({
        where: {
          senderId,
          status: ShipmentStatus.IN_TRANSIT,
        },
      }),
      prisma.shipment.count({
        where: {
          senderId,
          status: ShipmentStatus.PENDING,
        },
      }),
      prisma.shipment.count({
        where: {
          senderId,
          status: ShipmentStatus.REQUESTED,
        },
      }),
      prisma.shipment.count({
        where: {
          senderId,
          status: ShipmentStatus.DELIVERED,
        },
      }),
      prisma.shipment.count({
        where: { senderId },
      }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        inProgress,
        pending: pending + requested, // Include REQUESTED in pending count
        delivered,
        total,
      },
    });
  } catch (error) {
    console.error('Get shipment stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des statistiques',
    });
  }
};

/**
 * Get carrier shipment stats (for carrier dashboard)
 * GET /api/shipments/carrier-stats
 */
export const getCarrierShipmentStats = async (req: any, res: Response) => {
  try {
    const carrierId = req.user.id;
    console.log('🔍 Getting carrier stats for carrier:', carrierId);

    // Get counts by status for this carrier
    // pending = shipments where carrier requested, waiting for sender approval (requestedCarrierId = carrierId and status = REQUESTED)
    // assigned = shipments where carrier is confirmed but not yet started (carrierId = carrierId and status = CONFIRMED)
    // inProgress = shipments where carrier is assigned and in transit (carrierId = carrierId and status = IN_TRANSIT)
    // completed = shipments where carrier completed delivery (carrierId = carrierId and status = DELIVERED)
    const [pending, confirmed, inProgress, completed] = await Promise.all([
      prisma.shipment.count({
        where: {
          requestedCarrierId: carrierId,
          status: ShipmentStatus.REQUESTED,
        },
      }),
      prisma.shipment.count({
        where: {
          carrierId,
          status: ShipmentStatus.CONFIRMED,
        },
      }),
      prisma.shipment.count({
        where: {
          carrierId,
          status: ShipmentStatus.IN_TRANSIT,
        },
      }),
      prisma.shipment.count({
        where: {
          carrierId,
          status: ShipmentStatus.DELIVERED,
        },
      }),
    ]);

    const assigned = confirmed + inProgress; // Both CONFIRMED and IN_TRANSIT count as active/assigned
    const total = pending + assigned + completed;

    console.log('📊 Carrier stats:', { assigned, inProgress, completed, total, pending, confirmed });

    res.status(200).json({
      success: true,
      stats: {
        assigned, // Active shipments (CONFIRMED + IN_TRANSIT)
        inProgress, // Only IN_TRANSIT
        completed,
        total,
      },
    });
  } catch (error) {
    console.error('Get carrier shipment stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des statistiques',
    });
  }
};

/**
 * Get available carriers for a shipment (suggested transporters)
 * GET /api/shipments/:id/available-carriers
 */
export const getAvailableCarriers = async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    // Find the shipment
    const shipment = await prisma.shipment.findUnique({
      where: { id },
    });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: 'Expédition introuvable',
      });
    }

    // Only sender can view available carriers for their shipment
    if (shipment.senderId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé',
      });
    }

    // Get all carriers who haven't applied for this shipment
    // Return all carriers including invited ones (frontend will separate them)
    const carriers = await prisma.carrier.findMany({
      where: {
        // Exclude carrier who already applied
        id: {
          not: shipment.requestedCarrierId || undefined,
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        gouvernerat: true,
        verified: true,
        averageRating: true,
        totalReviews: true,
      },
      take: 20, // Limit to 20 carriers (increased from 10)
      orderBy: {
        createdAt: 'desc', // Most recent carriers first
      },
    });

    res.status(200).json({
      success: true,
      data: carriers,
    });
  } catch (error) {
    console.error('Get available carriers error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des transporteurs',
    });
  }
};
/**
 * Get carrier IDs who have been invited to a specific shipment
 * GET /api/shipments/:id/invited-carriers
 */
export const getInvitedCarriers = async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    // Only the sender of this shipment may query this
    const shipment = await prisma.shipment.findUnique({ where: { id } });
    if (!shipment) {
      return res.status(404).json({ success: false, error: 'Expédition introuvable' });
    }
    if (shipment.senderId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Accès non autorisé' });
    }

    const notifications = await prisma.notification.findMany({
      where: {
        type: 'SHIPMENT_INVITATION',
        shipmentId: id,
      },
      select: { carrierId: true },
    });

    const carrierIds = notifications.map(n => n.carrierId).filter(Boolean);

    res.status(200).json({ success: true, data: carrierIds });
  } catch (error) {
    console.error('Get invited carriers error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des transporteurs invités',
    });
  }
};

/**
 * Sender confirms handover — transitions shipment from HANDOVER_PENDING to IN_TRANSIT
 * POST /api/shipments/:id/confirm-handover
 */
export const confirmHandover = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const senderId = req.user.id;

    const shipment = await prisma.shipment.findUnique({ where: { id } });

    if (!shipment) {
      return res.status(404).json({ success: false, error: 'Expédition introuvable' });
    }

    if (shipment.senderId !== senderId) {
      return res.status(403).json({ success: false, error: 'Accès non autorisé' });
    }

    if (shipment.status !== 'HANDOVER_PENDING') {
      return res.status(400).json({
        success: false,
        error: 'La remise ne peut être confirmée que lorsque le transporteur est arrivé',
      });
    }

    const updatedShipment = await prisma.shipment.update({
      where: { id },
      data: { status: 'IN_TRANSIT' },
      include: {
        carrier: { select: { id: true, firstName: true, lastName: true, phone: true } },
        sender: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Notify carrier that the sender confirmed the handover
    if (shipment.carrierId) {
      // Carrier notification goes to their carrier record — reuse senderId field mapped to carrierId
      await prisma.notification.create({
        data: {
          carrierId: shipment.carrierId,
          shipmentId: shipment.id,
          type: 'HANDOVER_CONFIRMED',
          title: '✅ Remise confirmée',
          message: `L'expéditeur a confirmé la remise du colis (${shipment.refNumber}). Bonne route !`,
          data: { shipmentId: shipment.id, shipmentRefNumber: shipment.refNumber },
        },
      });
      console.log(`🔔 HANDOVER_CONFIRMED notification sent to carrier ${shipment.carrierId} for shipment ${shipment.refNumber}`);
    }

    // Also notify sender (IN_TRANSIT confirmation)
    await prisma.notification.create({
      data: {
        senderId: shipment.senderId,
        shipmentId: shipment.id,
        type: 'SHIPMENT_IN_TRANSIT',
        title: '🚚 En route',
        message: `Votre colis (${shipment.refNumber}) est maintenant en route vers la destination.`,
        data: { shipmentId: shipment.id, shipmentRefNumber: shipment.refNumber },
      },
    });

    console.log(`✅ Handover confirmed — shipment ${shipment.refNumber} is now IN_TRANSIT`);
    res.status(200).json({ success: true, data: updatedShipment });
  } catch (error) {
    console.error('Confirm handover error:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la confirmation de la remise' });
  }
};