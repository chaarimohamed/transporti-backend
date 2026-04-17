import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

// Extend Express Request to include user
export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

// Verify JWT token
export const auth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Accès refusé. Token manquant.',
      });
    }

    // Verify token
    const decoded = jwt.verify(token, env.jwtSecret) as {
      id: string;
      email: string;
      role: string;
    };

    // Attach user to request
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Token invalide ou expiré',
    });
  }
};

// Check if user is a sender
export const isSender = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'sender') {
    return res.status(403).json({
      success: false,
      error: 'Accès réservé aux expéditeurs',
    });
  }
  next();
};

// Check if user is a carrier
export const isCarrier = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'carrier') {
    return res.status(403).json({
      success: false,
      error: 'Accès réservé aux transporteurs',
    });
  }
  next();
};
