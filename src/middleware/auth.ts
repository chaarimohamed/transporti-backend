import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

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
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
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
  if (req.user?.role !== 'SENDER') {
    return res.status(403).json({
      success: false,
      error: 'Accès réservé aux expéditeurs',
    });
  }
  next();
};

// Check if user is a carrier
export const isCarrier = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'CARRIER') {
    return res.status(403).json({
      success: false,
      error: 'Accès réservé aux transporteurs',
    });
  }
  next();
};
