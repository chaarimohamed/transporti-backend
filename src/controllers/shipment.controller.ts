import { Request, Response } from 'express';
import prisma from '../config/database';
import { ShipmentStatus } from '@prisma/client';
import { sendPushNotification } from '../utils/pushNotification';

// Generate reference number for shipments
const generateRefNumber = () => {
  return `EXP-${Math.floor(1000 + Math.random() * 9000)}`;
};

const getFeedbackSummary = (shipment: any, user: any) => {
  const isSender = shipment.senderId === user.id;
  const isCarrier = shipment.carrierId === user.id;
  const hasCarrier = Boolean(shipment.carrierId);
  const isDelivered = shipment.status === ShipmentStatus.DELIVERED;
  const hasSubmitted = isSender
    ? Boolean(shipment.feedback?.senderToCarrierSubmittedAt)
    : isCarrier
      ? Boolean(shipment.feedback?.carrierToSenderSubmittedAt)
      : false;

  return {
    pendingForCurrentUser: isDelivered && hasCarrier && (isSender || isCarrier) && !hasSubmitted,
    hasSubmitted,
    canSubmit: isDelivered && hasCarrier && (isSender || isCarrier),
    targetRole: isSender ? 'carrier' : isCarrier ? 'sender' : null,
  };
};

const recalculateCarrierRating = async (carrierId: string) => {
  const stats = await prisma.shipmentFeedback.aggregate({
    where: {
      carrierId,
      senderToCarrierRating: { not: null },
    },
    _avg: {
      senderToCarrierRating: true,
    },
    _count: {
      senderToCarrierRating: true,
    },
  });

  await prisma.carrier.update({
    where: { id: carrierId },
    data: {
      averageRating: stats._avg.senderToCarrierRating ?? 0,
      totalReviews: stats._count.senderToCarrierRating,
    },
  });
};

const recalculateSenderRating = async (senderId: string) => {
  const stats = await prisma.shipmentFeedback.aggregate({
    where: {
      senderId,
      carrierToSenderRating: { not: null },
    },
    _avg: {
      carrierToSenderRating: true,
    },
    _count: {
      carrierToSenderRating: true,
    },
  });

  await prisma.sender.update({
    where: { id: senderId },
    data: {
      averageRating: stats._avg.carrierToSenderRating ?? 0,
      totalReviews: stats._count.carrierToSenderRating,
    },
  });
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
      itemName,
      cargo,
      price,
      description,
      pickupDate,
      weight,
      format,
      packageFormat,
      pickupCity,
      deliveryCity,
      dimensions,
      declaredValue,
      insurance,
      specialInstructions,
      // Sender / recipient info
      senderName,
      senderPhone,
      pickupInstructions,
      recipientName,
      recipientPhone,
      deliveryInstructions,
      // Helper (porteur)
      helperCount,
      deliveryHelperCount,
      // Meeting points
      pickupMeetingPoint,
      deliveryMeetingPoint,
      // Package photos
      packagePhotos,
    } = req.body;

    // Validate required fields
    if (!from || !to) {
      return res.status(400).json({
        success: false,
        error: 'Les champs "from" et "to" sont obligatoires',
      });
    }

    // Create shipment
    const shipment = await prisma.shipment.create({
      data: {
        refNumber: generateRefNumber(),
        from,
        to,
        ...(itemName && { itemName }),
        ...(pickupDate && { pickupDate }),
        ...((packageFormat || format) && { packageFormat: packageFormat || format }),
        ...(pickupCity && { pickupCity }),
        ...(deliveryCity && { deliveryCity }),
        cargo: cargo || '',
        // Price is now set when a carrier application is accepted (TC-106)
        description: description || '',
        senderId: req.user.id,
        status: ShipmentStatus.PENDING,
        // Contact info
        ...(senderName && { senderName }),
        ...(senderPhone && { senderPhone }),
        ...(pickupInstructions && { pickupInstructions }),
        ...(recipientName && { recipientName }),
        ...(recipientPhone && { recipientPhone }),
        ...(deliveryInstructions && { deliveryInstructions }),
        // Helper
        helperCount: helperCount !== undefined ? parseInt(helperCount) : 0,
        deliveryHelperCount: deliveryHelperCount !== undefined ? parseInt(deliveryHelperCount) : 0,
        // Meeting points
        pickupMeetingPoint: pickupMeetingPoint || 'vehicle',
        deliveryMeetingPoint: deliveryMeetingPoint || 'vehicle',
        // Package photos
        packagePhotos: Array.isArray(packagePhotos) ? packagePhotos : [],
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
      // For carriers: return shipments where they are assigned OR have a pending application (TC-106)
      where = {
        OR: [
          { carrierId: req.user.id }, // Shipments assigned to this carrier (CONFIRMED, IN_TRANSIT, DELIVERED)
          { applications: { some: { carrierId: req.user.id, status: 'PENDING' } } }, // Active applications
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
      // packagePhotos is fetched but stripped before the response.
      // Only lightweight preview data is returned for list cards.
      select: {
        id: true,
        refNumber: true,
        from: true,
        to: true,
        itemName: true,
        pickupDate: true,
        packageFormat: true,
        pickupCity: true,
        deliveryCity: true,
        cargo: true,
        price: true,
        status: true,
        description: true,
        senderId: true,
        carrierId: true,
        requestedCarrierId: true,
        senderName: true,
        senderPhone: true,
        pickupInstructions: true,
        recipientName: true,
        recipientPhone: true,
        deliveryInstructions: true,
        helperCount: true,
        deliveryHelperCount: true,
        pickupMeetingPoint: true,
        deliveryMeetingPoint: true,
        deliveryCode: true,
        createdAt: true,
        updatedAt: true,
        packagePhotos: true,
        carrier: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            gouvernerat: true,
            averageRating: true,
            totalReviews: true,
            vehicleType: true,
          },
        },
        requestedCarrier: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            gouvernerat: true,
            averageRating: true,
            totalReviews: true,
            vehicleType: true,
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

    const shipmentsWithCount = shipments.map(({ packagePhotos, ...s }) => ({
      ...s,
      photoPreviews: packagePhotos.slice(0, 3),
      photosCount: packagePhotos.length,
    }));

    res.status(200).json({
      success: true,
      data: shipmentsWithCount,
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
    const { status, gouvernerat } = req.query;

    // Build where clause — show PENDING and REQUESTED shipments
    // (TC-106: multiple carriers can apply simultaneously)
    const where: any = {
      status: { in: [ShipmentStatus.PENDING, ShipmentStatus.REQUESTED] },
      carrierId: null, // Not yet assigned to a carrier
      // Exclude shipments where the current carrier already applied
      NOT: {
        applications: {
          some: { carrierId: req.user.id },
        },
      },
    };

    // Optional: filter by pickup city (gouvernerat)
    if (gouvernerat && typeof gouvernerat === 'string' && gouvernerat.trim()) {
      where.from = {
        contains: gouvernerat.trim(),
        mode: 'insensitive',
      };
    }

    const shipments = await prisma.shipment.findMany({
      where,
      // packagePhotos is fetched but stripped before the response.
      // Only lightweight preview data is returned for list cards.
      select: {
        id: true,
        refNumber: true,
        from: true,
        to: true,
        itemName: true,
        pickupDate: true,
        packageFormat: true,
        pickupCity: true,
        deliveryCity: true,
        cargo: true,
        price: true,
        status: true,
        description: true,
        senderId: true,
        carrierId: true,
        requestedCarrierId: true,
        senderName: true,
        senderPhone: true,
        pickupInstructions: true,
        recipientName: true,
        recipientPhone: true,
        deliveryInstructions: true,
        helperCount: true,
        deliveryHelperCount: true,
        pickupMeetingPoint: true,
        deliveryMeetingPoint: true,
        deliveryCode: true,
        createdAt: true,
        updatedAt: true,
        packagePhotos: true,
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

    const shipmentsWithCount = shipments.map(({ packagePhotos, ...s }) => ({
      ...s,
      photoPreviews: packagePhotos.slice(0, 3),
      photosCount: packagePhotos.length,
    }));

    res.status(200).json({
      success: true,
      data: shipmentsWithCount,
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
    const isCarrierUser = req.user.role?.toUpperCase() === 'CARRIER';

    const shipment = await prisma.shipment.findUnique({
      where: { id },
      select: {
        // Single-shipment details include packagePhotos so detail screens can render the full gallery.
        id: true,
        refNumber: true,
        from: true,
        to: true,
        itemName: true,
        pickupDate: true,
        packageFormat: true,
        pickupCity: true,
        deliveryCity: true,
        cargo: true,
        price: true,
        status: true,
        description: true,
        senderId: true,
        carrierId: true,
        requestedCarrierId: true,
        senderName: true,
        senderPhone: true,
        pickupInstructions: true,
        recipientName: true,
        recipientPhone: true,
        deliveryInstructions: true,
        packagePhotos: true,
        helperCount: true,
        deliveryHelperCount: true,
        pickupMeetingPoint: true,
        deliveryMeetingPoint: true,
        deliveryCode: true,
        createdAt: true,
        updatedAt: true,
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
            averageRating: true,
            totalReviews: true,
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
            gouvernerat: true,
            averageRating: true,
            totalReviews: true,
            vehicleType: true,
          },
        },
        requestedCarrier: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            gouvernerat: true,
            averageRating: true,
            totalReviews: true,
            vehicleType: true,
          },
        },
        feedback: {
          select: {
            id: true,
            senderToCarrierRating: true,
            senderToCarrierComment: true,
            senderToCarrierSubmittedAt: true,
            carrierToSenderRating: true,
            carrierToSenderComment: true,
            carrierToSenderSubmittedAt: true,
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

    const myApplication = isCarrierUser
      ? await prisma.shipmentApplication.findUnique({
          where: {
            shipmentId_carrierId: {
              shipmentId: shipment.id,
              carrierId: req.user.id,
            },
          },
          select: {
            id: true,
            proposedPrice: true,
            status: true,
            carrierId: true,
            shipmentId: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      : null;

    res.status(200).json({
      success: true,
      data: {
        ...shipment,
        myApplication,
        feedbackSummary: getFeedbackSummary(shipment, req.user),
      },
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
 * Submit shipment feedback for the authenticated sender or carrier
 * POST /api/shipments/:id/feedback
 */
export const submitShipmentFeedback = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;
    const numericRating = Number(rating);

    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({
        success: false,
        error: 'La note doit être un entier entre 1 et 5',
      });
    }

    const shipment = await prisma.shipment.findUnique({
      where: { id },
      select: {
        id: true,
        refNumber: true,
        status: true,
        senderId: true,
        carrierId: true,
        feedback: {
          select: {
            id: true,
            senderToCarrierSubmittedAt: true,
            carrierToSenderSubmittedAt: true,
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

    if (shipment.status !== ShipmentStatus.DELIVERED) {
      return res.status(400).json({
        success: false,
        error: 'Vous pouvez laisser une évaluation uniquement après la livraison',
      });
    }

    if (!shipment.carrierId) {
      return res.status(400).json({
        success: false,
        error: 'Aucun transporteur n\'est associé à cette expédition',
      });
    }

    const isSender = shipment.senderId === req.user.id;
    const isCarrier = shipment.carrierId === req.user.id;

    if (!isSender && !isCarrier) {
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé',
      });
    }

    const sanitizedComment = typeof comment === 'string' && comment.trim().length > 0
      ? comment.trim().slice(0, 500)
      : null;
    const now = new Date();

    const feedback = await prisma.shipmentFeedback.upsert({
      where: { shipmentId: shipment.id },
      create: {
        shipmentId: shipment.id,
        senderId: shipment.senderId,
        carrierId: shipment.carrierId,
        ...(isSender
          ? {
              senderToCarrierRating: numericRating,
              senderToCarrierComment: sanitizedComment,
              senderToCarrierSubmittedAt: now,
            }
          : {
              carrierToSenderRating: numericRating,
              carrierToSenderComment: sanitizedComment,
              carrierToSenderSubmittedAt: now,
            }),
      },
      update: isSender
        ? {
            senderToCarrierRating: numericRating,
            senderToCarrierComment: sanitizedComment,
            senderToCarrierSubmittedAt: now,
          }
        : {
            carrierToSenderRating: numericRating,
            carrierToSenderComment: sanitizedComment,
            carrierToSenderSubmittedAt: now,
          },
      select: {
        id: true,
        senderToCarrierRating: true,
        senderToCarrierComment: true,
        senderToCarrierSubmittedAt: true,
        carrierToSenderRating: true,
        carrierToSenderComment: true,
        carrierToSenderSubmittedAt: true,
      },
    });

    if (isSender) {
      await recalculateCarrierRating(shipment.carrierId);
    } else {
      await recalculateSenderRating(shipment.senderId);
    }

    res.status(200).json({
      success: true,
      message: isSender
        ? 'Votre évaluation du transporteur a été enregistrée'
        : 'Votre évaluation de l\'expéditeur a été enregistrée',
      data: {
        feedback,
        feedbackSummary: getFeedbackSummary({ ...shipment, feedback }, req.user),
      },
    });
  } catch (error) {
    console.error('Submit shipment feedback error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'enregistrement de l\'évaluation',
    });
  }
};

/**
 * Request a shipment (carrier applies with a proposed price)
 * POST /api/shipments/:id/request
 * TC-106: Multiple carriers can apply simultaneously with different proposed prices
 */
export const requestShipment = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { proposedPrice } = req.body;

    // Check if user is a carrier
    if (req.user.role?.toUpperCase() !== 'CARRIER') {
      return res.status(403).json({
        success: false,
        error: 'Seuls les transporteurs peuvent demander des expéditions',
      });
    }

    // Validate proposedPrice
    const price = parseFloat(proposedPrice);
    if (!proposedPrice || isNaN(price) || price <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Un prix proposé valide est obligatoire',
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

    // Only PENDING and REQUESTED shipments accept new applications
    if (shipment.status !== ShipmentStatus.PENDING && shipment.status !== ShipmentStatus.REQUESTED) {
      return res.status(400).json({
        success: false,
        error: 'Cette expédition n\'est plus disponible',
      });
    }

    // Check if this carrier has already applied
    const existingApplication = await prisma.shipmentApplication.findUnique({
      where: { shipmentId_carrierId: { shipmentId: id, carrierId: req.user.id } },
    });
    if (existingApplication) {
      return res.status(400).json({
        success: false,
        error: 'Vous avez déjà postulé pour cette expédition',
      });
    }

    // Create the application record
    const application = await prisma.shipmentApplication.create({
      data: {
        shipmentId: id,
        carrierId: req.user.id,
        proposedPrice: price,
        status: 'PENDING',
      },
    });

    // If first application: transition shipment to REQUESTED and set requestedCarrierId
    if (shipment.status === ShipmentStatus.PENDING) {
      await prisma.shipment.update({
        where: { id },
        data: {
          status: ShipmentStatus.REQUESTED,
          requestedCarrierId: req.user.id,
        },
      });
    }

    // Create notification for sender
    await prisma.notification.create({
      data: {
        type: 'CARRIER_REQUEST',
        title: 'Nouvelle candidature',
        message: `Un transporteur a proposé ${price} DT pour votre expédition ${shipment.refNumber}`,
        senderId: shipment.senderId,
        shipmentId: shipment.id,
        data: {
          shipmentRefNumber: shipment.refNumber,
          carrierId: req.user.id,
          proposedPrice: price,
        },
      },
    });

    // Send push notification to sender
    const senderRecord = await prisma.sender.findUnique({ where: { id: shipment.senderId }, select: { pushToken: true } });
    await sendPushNotification(
      [senderRecord?.pushToken],
      'Nouvelle candidature',
      `Un transporteur a proposé ${price} DT pour votre expédition ${shipment.refNumber}`,
      { shipmentId: shipment.id }
    );

    res.status(200).json({
      success: true,
      message: 'Candidature envoyée à l\'expéditeur avec succès',
      data: application,
    });
  } catch (error) {
    console.error('Request shipment error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la candidature',
    });
  }
};

/**
 * Get all applications for a shipment (sender view)
 * GET /api/shipments/:id/applications
 * TC-106: Returns all carrier applications with proposed prices
 */
export const getShipmentApplications = async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    // Find shipment
    const shipment = await prisma.shipment.findUnique({
      where: { id },
      select: { id: true, senderId: true, refNumber: true },
    });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        error: 'Expédition introuvable',
      });
    }

    // Only sender can view applications
    if (shipment.senderId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé',
      });
    }

    const applications = await prisma.shipmentApplication.findMany({
      where: { shipmentId: id },
      include: {
        carrier: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            gouvernerat: true,
            averageRating: true,
            totalReviews: true,
            vehicleType: true,
            vehicleSize: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.status(200).json({
      success: true,
      data: applications,
    });
  } catch (error) {
    console.error('Get shipment applications error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des candidatures',
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

    // Send push notification to carrier
    const carrierRecord = await prisma.carrier.findUnique({ where: { id: carrierId }, select: { pushToken: true } });
    await sendPushNotification(
      [carrierRecord?.pushToken],
      'Nouvelle invitation',
      `${shipment.sender.firstName} ${shipment.sender.lastName} vous invite à prendre en charge l'expédition ${shipment.refNumber}`,
      { shipmentId: shipment.id }
    );

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
 * Accept invitation (carrier accepts sender's invitation with a proposed price)
 * POST /api/shipments/:id/accept-invitation
 * TC-106: Carrier provides a proposedPrice when accepting an invitation
 */
export const acceptInvitation = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { proposedPrice } = req.body;

    // Check if user is a carrier
    if (req.user.role?.toUpperCase() !== 'CARRIER') {
      return res.status(403).json({
        success: false,
        error: 'Seuls les transporteurs peuvent accepter des invitations',
      });
    }

    // Validate proposedPrice
    const price = parseFloat(proposedPrice);
    if (!proposedPrice || isNaN(price) || price <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Un prix proposé valide est obligatoire',
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

    const invitation = await prisma.notification.findFirst({
      where: {
        shipmentId: id,
        carrierId: req.user.id,
        type: 'SHIPMENT_INVITATION',
      },
      select: { id: true },
    });

    if (!invitation) {
      return res.status(403).json({
        success: false,
        error: 'Invitation introuvable ou expirée',
      });
    }

    // Check if shipment is still available for the invited carrier
    if (shipment.status !== ShipmentStatus.PENDING && shipment.status !== ShipmentStatus.REQUESTED) {
      return res.status(400).json({
        success: false,
        error: 'Cette expédition n\'est plus disponible',
      });
    }

    const pendingApplications = await prisma.shipmentApplication.findMany({
      where: {
        shipmentId: id,
        status: 'PENDING',
      },
      select: {
        id: true,
        carrierId: true,
      },
    });

    const invitedCarrierApplication = pendingApplications.find(
      (application) => application.carrierId === req.user.id
    );
    const rejectedApplications = pendingApplications.filter(
      (application) => application.carrierId !== req.user.id
    );

    if (invitedCarrierApplication) {
      await prisma.shipmentApplication.update({
        where: { id: invitedCarrierApplication.id },
        data: {
          status: 'ACCEPTED',
          proposedPrice: price,
        },
      });
    }

    if (rejectedApplications.length > 0) {
      await prisma.shipmentApplication.updateMany({
        where: {
          id: { in: rejectedApplications.map((application) => application.id) },
        },
        data: { status: 'REJECTED' },
      });
    }

    // Directly confirm the shipment with the proposed price (sender invited this carrier)
    const updatedShipment = await prisma.shipment.update({
      where: { id },
      data: {
        status: ShipmentStatus.CONFIRMED,
        carrierId: req.user.id,
        requestedCarrierId: null,
        price: price,
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

    // Send push notification to sender
    const senderForInvite = await prisma.sender.findUnique({ where: { id: shipment.senderId }, select: { pushToken: true } });
    await sendPushNotification(
      [senderForInvite?.pushToken],
      'Invitation acceptée',
      `Le transporteur a accepté votre invitation pour l'expédition ${shipment.refNumber}`,
      { shipmentId: shipment.id }
    );

    for (const rejectedApplication of rejectedApplications) {
      await prisma.notification.create({
        data: {
          type: 'REQUEST_REJECTED',
          title: 'Candidature refusée',
          message: `Votre candidature pour l'expédition ${shipment.refNumber} n'a pas été retenue`,
          carrierId: rejectedApplication.carrierId,
          shipmentId: shipment.id,
          data: { shipmentRefNumber: shipment.refNumber },
        },
      });

      const rejectedCarrier = await prisma.carrier.findUnique({
        where: { id: rejectedApplication.carrierId },
        select: { pushToken: true },
      });
      await sendPushNotification(
        [rejectedCarrier?.pushToken],
        'Candidature refusée',
        `Votre candidature pour l'expédition ${shipment.refNumber} n'a pas été retenue`,
        { shipmentId: shipment.id }
      );
    }

    // Delete all invitation notifications for this shipment to avoid stale invites
    await prisma.notification.deleteMany({
      where: {
        shipmentId: id,
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
 * Accept carrier request (sender accepts a specific carrier application)
 * POST /api/shipments/:id/accept-carrier
 * TC-106: applicationId in body identifies which carrier's proposal to accept
 */
export const acceptCarrier = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { applicationId } = req.body;

    if (!applicationId) {
      return res.status(400).json({
        success: false,
        error: 'L\'ID de la candidature est obligatoire',
      });
    }

    // Find shipment
    const shipment = await prisma.shipment.findUnique({
      where: { id },
      include: { sender: true },
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
        error: 'Aucune candidature de transporteur pour cette expédition',
      });
    }

    // Find the specific application
    const application = await prisma.shipmentApplication.findUnique({
      where: { id: applicationId },
    });

    if (!application || application.shipmentId !== id) {
      return res.status(404).json({
        success: false,
        error: 'Candidature introuvable',
      });
    }

    if (application.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        error: 'Cette candidature n\'est plus en attente',
      });
    }

    // Mark accepted application
    await prisma.shipmentApplication.update({
      where: { id: applicationId },
      data: { status: 'ACCEPTED' },
    });

    // Reject all other PENDING applications for this shipment
    const rejectedApplications = await prisma.shipmentApplication.findMany({
      where: { shipmentId: id, status: 'PENDING', id: { not: applicationId } },
      select: { id: true, carrierId: true },
    });
    if (rejectedApplications.length > 0) {
      await prisma.shipmentApplication.updateMany({
        where: { shipmentId: id, status: 'PENDING', id: { not: applicationId } },
        data: { status: 'REJECTED' },
      });
    }

    // Accept the carrier — set price from accepted application
    const updatedShipment = await prisma.shipment.update({
      where: { id },
      data: {
        carrierId: application.carrierId,
        price: application.proposedPrice,
        status: ShipmentStatus.CONFIRMED,
        requestedCarrierId: null,
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

    // Notify the accepted carrier
    await prisma.notification.create({
      data: {
        type: 'REQUEST_ACCEPTED',
        title: 'Candidature acceptée',
        message: `Votre candidature pour l'expédition ${shipment.refNumber} a été acceptée`,
        carrierId: application.carrierId,
        shipmentId: shipment.id,
        data: {
          shipmentRefNumber: shipment.refNumber,
          senderId: req.user.id,
          acceptedPrice: application.proposedPrice,
        },
      },
    });

    const carrierForAccept = await prisma.carrier.findUnique({ where: { id: application.carrierId }, select: { pushToken: true } });
    await sendPushNotification(
      [carrierForAccept?.pushToken],
      'Candidature acceptée',
      `Votre candidature pour l'expédition ${shipment.refNumber} a été acceptée`,
      { shipmentId: shipment.id }
    );

    // Notify rejected carriers
    for (const rejected of rejectedApplications) {
      await prisma.notification.create({
        data: {
          type: 'REQUEST_REJECTED',
          title: 'Candidature refusée',
          message: `Votre candidature pour l'expédition ${shipment.refNumber} n'a pas été retenue`,
          carrierId: rejected.carrierId,
          shipmentId: shipment.id,
          data: { shipmentRefNumber: shipment.refNumber },
        },
      });
      const rejectedCarrier = await prisma.carrier.findUnique({ where: { id: rejected.carrierId }, select: { pushToken: true } });
      await sendPushNotification(
        [rejectedCarrier?.pushToken],
        'Candidature refusée',
        `Votre candidature pour l'expédition ${shipment.refNumber} n'a pas été retenue`,
        { shipmentId: shipment.id }
      );
    }

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
 * Reject a specific carrier application (sender rejects one applicant)
 * POST /api/shipments/:id/reject-carrier
 * TC-106: applicationId in body identifies which carrier to reject
 */
export const rejectCarrier = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { applicationId } = req.body;

    if (!applicationId) {
      return res.status(400).json({
        success: false,
        error: 'L\'ID de la candidature est obligatoire',
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

    // Only sender can reject carrier
    if (shipment.senderId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé',
      });
    }

    // Find the specific application
    const application = await prisma.shipmentApplication.findUnique({
      where: { id: applicationId },
    });

    if (!application || application.shipmentId !== id) {
      return res.status(404).json({
        success: false,
        error: 'Candidature introuvable',
      });
    }

    if (application.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        error: 'Cette candidature n\'est plus en attente',
      });
    }

    // Mark application as REJECTED
    await prisma.shipmentApplication.update({
      where: { id: applicationId },
      data: { status: 'REJECTED' },
    });

    // Notify the rejected carrier
    await prisma.notification.create({
      data: {
        type: 'REQUEST_REJECTED',
        title: 'Candidature refusée',
        message: `Votre candidature pour l'expédition ${shipment.refNumber} a été refusée`,
        carrierId: application.carrierId,
        shipmentId: id,
        data: {
          shipmentRefNumber: shipment.refNumber,
          senderId: req.user.id,
        },
      },
    });

    const carrierForReject = await prisma.carrier.findUnique({ where: { id: application.carrierId }, select: { pushToken: true } });
    await sendPushNotification(
      [carrierForReject?.pushToken],
      'Candidature refusée',
      `Votre candidature pour l'expédition ${shipment.refNumber} a été refusée`,
      { shipmentId: id }
    );

    // Check if any PENDING applications remain
    const remainingPending = await prisma.shipmentApplication.count({
      where: { shipmentId: id, status: 'PENDING' },
    });

    // If no more pending applications, reset shipment to PENDING
    let updatedShipment = shipment;
    if (remainingPending === 0) {
      updatedShipment = await prisma.shipment.update({
        where: { id },
        data: {
          status: ShipmentStatus.PENDING,
          requestedCarrierId: null,
        },
      });
    }

    res.status(200).json({
      success: true,
      message: remainingPending > 0
        ? 'Candidature refusée. D\'autres candidatures sont en attente.'
        : 'Candidature refusée. L\'expédition est à nouveau disponible.',
      data: updatedShipment,
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

    // Cannot cancel once a carrier is confirmed
    const cancellableStatuses: string[] = ['PENDING', 'REQUESTED'];
    if (!cancellableStatuses.includes(shipment.status)) {
      return res.status(400).json({
        success: false,
        error: 'Impossible d\'annuler : un transporteur a déjà été confirmé pour cette expédition.',
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

    // Send push notification to sender
    const senderForStatus = await prisma.sender.findUnique({ where: { id: shipment.senderId }, select: { pushToken: true } });
    await sendPushNotification(
      [senderForStatus?.pushToken],
      newStatus === 'IN_TRANSIT' ? 'Expédition en transit' : 'Expédition livrée',
      newStatus === 'IN_TRANSIT'
        ? `L'expédition ${shipment.refNumber} est maintenant en transit`
        : `L'expédition ${shipment.refNumber} a été livrée`,
      { shipmentId: shipment.id }
    );

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
        assigned,   // Assignées: CONFIRMED + IN_TRANSIT
        applied: pending,  // applied: REQUESTED (carrier applied, awaiting confirmation)
        inProgress, // Only IN_TRANSIT (kept for backwards compat)
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

    // Generate a one-time delivery confirmation code
    const deliveryCode = Math.floor(100000 + Math.random() * 900000).toString();

    const updatedShipment = await prisma.shipment.update({
      where: { id },
      data: { status: 'IN_TRANSIT', deliveryCode },
      include: {
        carrier: { select: { id: true, firstName: true, lastName: true, phone: true } },
        sender: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Notify carrier with the delivery code
    if (shipment.carrierId) {
      await prisma.notification.create({
        data: {
          carrierId: shipment.carrierId,
          shipmentId: shipment.id,
          type: 'HANDOVER_CONFIRMED',
          title: '✅ Remise confirmée',
          message: `L'expéditeur a confirmé la remise du colis (${shipment.refNumber}). Votre code de livraison est : ${deliveryCode}. Bonne route !`,
          data: { shipmentId: shipment.id, shipmentRefNumber: shipment.refNumber, deliveryCode },
        },
      });

      // Send push notification to carrier
      const carrierForHandover = await prisma.carrier.findUnique({ where: { id: shipment.carrierId }, select: { pushToken: true } });
      await sendPushNotification(
        [carrierForHandover?.pushToken],
        '✅ Remise confirmée',
        `Code de livraison : ${deliveryCode} — Bonne route !`,
        { shipmentId: shipment.id, deliveryCode }
      );

      console.log(`🔔 HANDOVER_CONFIRMED notification sent to carrier ${shipment.carrierId} for shipment ${shipment.refNumber}`);
    }

    // Notify sender with the delivery code to hand to the carrier at destination
    await prisma.notification.create({
      data: {
        senderId: shipment.senderId,
        shipmentId: shipment.id,
        type: 'SHIPMENT_IN_TRANSIT',
        title: '🚚 En route — Code de livraison',
        message: `Votre colis (${shipment.refNumber}) est en route. Code de livraison à donner au transporteur à la réception : ${deliveryCode}`,
        data: { shipmentId: shipment.id, shipmentRefNumber: shipment.refNumber, deliveryCode },
      },
    });

    // Send push notification to sender
    const senderForTransit = await prisma.sender.findUnique({ where: { id: shipment.senderId }, select: { pushToken: true } });
    await sendPushNotification(
      [senderForTransit?.pushToken],
      '🚚 En route — Code de livraison',
      `Votre colis (${shipment.refNumber}) est en route. Code : ${deliveryCode}`,
      { shipmentId: shipment.id, deliveryCode }
    );

    console.log(`✅ Handover confirmed — shipment ${shipment.refNumber} is now IN_TRANSIT, code: ${deliveryCode}`);
    res.status(200).json({ success: true, data: updatedShipment });
  } catch (error) {
    console.error('Confirm handover error:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la confirmation de la remise' });
  }
};

/**
 * POST /shipments/:id/photos
 * Upload / replace package photos for a shipment (sender only).
 * Accepts { packagePhotos: string[] } where each item is a base64 image.
 */
export const uploadShipmentPhotos = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { packagePhotos } = req.body;

    if (!Array.isArray(packagePhotos)) {
      return res.status(400).json({ success: false, error: 'packagePhotos must be an array' });
    }

    const shipment = await prisma.shipment.findUnique({ where: { id } });
    if (!shipment) {
      return res.status(404).json({ success: false, error: 'Expédition introuvable' });
    }
    if (shipment.senderId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Non autorisé' });
    }

    await prisma.shipment.update({
      where: { id },
      data: { packagePhotos },
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Upload shipment photos error:', error);
    res.status(500).json({ success: false, error: 'Erreur lors du téléchargement des photos' });
  }
};