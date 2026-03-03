import { Request, Response, NextFunction } from 'express';

// Error handler middleware
export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('Error:', err);

  // Prisma errors
  if (err.code === 'P2002') {
    return res.status(400).json({
      success: false,
      error: 'Cette valeur existe déjà dans la base de données',
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      error: 'Ressource introuvable',
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Token invalide',
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'Token expiré',
    });
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: err.message || 'Erreur de validation',
    });
  }

  // Default error
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Erreur serveur interne',
  });
};

// Not found handler
export const notFound = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Route introuvable',
  });
};
