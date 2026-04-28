import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { Expo } from 'expo-server-sdk';

const prisma = new PrismaClient();

/**
 * Get user notifications
 * GET /api/notifications
 */
export const getNotifications = async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const { unreadOnly } = req.query;

    const where: any = userRole === 'sender' 
      ? { senderId: userId }
      : { carrierId: userId };
    
    if (unreadOnly === 'true') {
      where.read = false;
    }

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      take: 50, // Limit to last 50 notifications
    });

    res.status(200).json({
      success: true,
      data: notifications,
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des notifications',
    });
  }
};

/**
 * Get unread notification count
 * GET /api/notifications/unread-count
 */
export const getUnreadCount = async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    const where: any = userRole === 'sender'
      ? { senderId: userId, read: false }
      : { carrierId: userId, read: false };

    const count = await prisma.notification.count({ where });

    res.status(200).json({
      success: true,
      data: { count },
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération du compteur',
    });
  }
};

/**
 * Mark notification as read
 * PUT /api/notifications/:id/read
 */
export const markAsRead = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Find notification
    const notification = await prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification introuvable',
      });
    }

    // Check ownership
    const isOwner = userRole === 'sender'
      ? notification.senderId === userId
      : notification.carrierId === userId;

    if (!isOwner) {
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé',
      });
    }

    // Mark as read
    const updatedNotification = await prisma.notification.update({
      where: { id },
      data: { read: true },
    });

    res.status(200).json({
      success: true,
      data: updatedNotification,
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour',
    });
  }
};

/**
 * Mark all notifications as read
 * PUT /api/notifications/read-all
 */
export const markAllAsRead = async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    const where: any = userRole === 'sender'
      ? { senderId: userId, read: false }
      : { carrierId: userId, read: false };

    await prisma.notification.updateMany({
      where,
      data: { read: true },
    });

    res.status(200).json({
      success: true,
      message: 'Toutes les notifications ont été marquées comme lues',
    });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour',
    });
  }
};

/**
 * Delete notification
 * DELETE /api/notifications/:id
 */
export const deleteNotification = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Find notification
    const notification = await prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification introuvable',
      });
    }

    // Check ownership
    const isOwner = userRole === 'sender'
      ? notification.senderId === userId
      : notification.carrierId === userId;

    if (!isOwner) {
      return res.status(403).json({
        success: false,
        error: 'Accès non autorisé',
      });
    }

    // Delete notification
    await prisma.notification.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      message: 'Notification supprimée',
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la suppression',
    });
  }
};

/**
 * Register or update Expo push token for the authenticated user
 * POST /api/notifications/register-token
 */
export const registerPushToken = async (req: any, res: Response) => {
  try {
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Token invalide',
      });
    }

    if (!Expo.isExpoPushToken(token)) {
      return res.status(400).json({
        success: false,
        error: 'Le token fourni n\'est pas un token Expo valide',
      });
    }

    const userId = req.user.id;
    const userRole = req.user.role;

    if (userRole === 'sender') {
      await prisma.sender.update({
        where: { id: userId },
        data: { pushToken: token },
      });
    } else {
      await prisma.carrier.update({
        where: { id: userId },
        data: { pushToken: token },
      });
    }

    res.status(200).json({
      success: true,
      message: 'Token enregistré avec succès',
    });
  } catch (error) {
    console.error('Register push token error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'enregistrement du token',
    });
  }
};
