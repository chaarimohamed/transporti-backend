import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../config/database';

// Register new user
export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, phone, role, gouvernerat, license, matricule } = req.body;

    // Validate required fields
    if (!email || !password || !firstName || !lastName || !phone || !role) {
      return res.status(400).json({
        success: false,
        error: 'Tous les champs sont obligatoires',
      });
    }

    const userRole = role.toLowerCase();

    // Check if user already exists in both tables
    const [existingSender, existingCarrier] = await Promise.all([
      prisma.sender.findUnique({ where: { email: email.toLowerCase() } }),
      prisma.carrier.findUnique({ where: { email: email.toLowerCase() } }),
    ]);

    if (existingSender || existingCarrier) {
      return res.status(400).json({
        success: false,
        error: 'Un compte avec cet email existe déjà',
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    let user;
    let token;

    if (userRole === 'sender') {
      // Create sender
      user = await prisma.sender.create({
        data: {
          email: email.toLowerCase(),
          password: hashedPassword,
          firstName,
          lastName,
          phone,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          createdAt: true,
        },
      });

      // Generate JWT token
      token = jwt.sign(
        { id: user.id, email: user.email, role: 'sender' },
        process.env.JWT_SECRET!,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );
    } else {
      // Create carrier
      user = await prisma.carrier.create({
        data: {
          email: email.toLowerCase(),
          password: hashedPassword,
          firstName,
          lastName,
          phone,
          gouvernerat,
          license,
          matricule,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          gouvernerat: true,
          license: true,
          matricule: true,
          verified: true,
          createdAt: true,
        },
      });

      // Generate JWT token
      token = jwt.sign(
        { id: user.id, email: user.email, role: 'carrier' },
        process.env.JWT_SECRET!,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );
    }

    res.status(201).json({
      success: true,
      data: {
        user: { ...user, role: userRole },
        token,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'inscription',
    });
  }
};

// Login user
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email et mot de passe requis',
      });
    }

    // Try to find user in both sender and carrier tables
    const [sender, carrier] = await Promise.all([
      prisma.sender.findUnique({ where: { email: email.toLowerCase() } }),
      prisma.carrier.findUnique({ where: { email: email.toLowerCase() } }),
    ]);

    const user = sender || carrier;
    const userRole = sender ? 'sender' : carrier ? 'carrier' : null;

    if (!user || !userRole) {
      return res.status(401).json({
        success: false,
        error: 'Email ou mot de passe incorrect',
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Email ou mot de passe incorrect',
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: userRole },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.status(200).json({
      success: true,
      data: {
        user: { ...userWithoutPassword, role: userRole },
        token,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la connexion',
    });
  }
};

// Get current user
export const getMe = async (req: any, res: Response) => {
  try {
    const userRole = req.user.role;
    let user;

    if (userRole === 'sender') {
      user = await prisma.sender.findUnique({
        where: { id: req.user.id },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          createdAt: true,
        },
      });
    } else {
      user = await prisma.carrier.findUnique({
        where: { id: req.user.id },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          gouvernerat: true,
          license: true,
          matricule: true,
          verified: true,
          createdAt: true,
        },
      });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur introuvable',
      });
    }

    res.status(200).json({
      success: true,
      data: { ...user, role: userRole },
    });
  } catch (error) {
    console.error('GetMe error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération du profil',
    });
  }
};

// Forgot password - Request reset token
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email requis',
      });
    }

    // Try to find user in both sender and carrier tables
    const [sender, carrier] = await Promise.all([
      prisma.sender.findUnique({ where: { email: email.toLowerCase() } }),
      prisma.carrier.findUnique({ where: { email: email.toLowerCase() } }),
    ]);

    const user = sender || carrier;
    const userRole = sender ? 'sender' : carrier ? 'carrier' : null;

    // Always return success even if user not found (security best practice)
    if (!user || !userRole) {
      return res.status(200).json({
        success: true,
        message: 'Si un compte existe avec cet email, un code de réinitialisation a été envoyé',
      });
    }

    // Generate reset token (6-digit code)
    const resetToken = crypto.randomInt(100000, 999999).toString();
    const resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Update user with reset token
    if (userRole === 'sender') {
      await prisma.sender.update({
        where: { id: user.id },
        data: {
          resetToken,
          resetTokenExpiry,
        },
      });
    } else {
      await prisma.carrier.update({
        where: { id: user.id },
        data: {
          resetToken,
          resetTokenExpiry,
        },
      });
    }

    // TODO: Send email with reset token
    // For now, log it to console (in production, use a proper email service)
    console.log(`Password reset token for ${email}: ${resetToken}`);
    console.log(`Token expires at: ${resetTokenExpiry}`);

    res.status(200).json({
      success: true,
      message: 'Si un compte existe avec cet email, un code de réinitialisation a été envoyé',
      // In development, include the token (remove this in production)
      ...(process.env.NODE_ENV === 'development' && { resetToken }),
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la demande de réinitialisation',
    });
  }
};

// Update user profile
export const updateProfile = async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const { firstName, lastName, email, phone, gouvernorat } = req.body;

    let updatedUser;

    if (userRole === 'sender') {
      updatedUser = await prisma.sender.update({
        where: { id: userId },
        data: {
          ...(firstName && { firstName }),
          ...(lastName && { lastName }),
          ...(email && { email: email.toLowerCase() }),
          ...(phone && { phone }),
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          createdAt: true,
        },
      });
    } else if (userRole === 'carrier') {
      updatedUser = await prisma.carrier.update({
        where: { id: userId },
        data: {
          ...(firstName && { firstName }),
          ...(lastName && { lastName }),
          ...(email && { email: email.toLowerCase() }),
          ...(phone && { phone }),
          // gouvernorat from the form maps to the gouvernerat DB column
          ...(gouvernorat !== undefined && { gouvernerat: gouvernorat }),
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          gouvernerat: true,
          license: true,
          matricule: true,
          verified: true,
          createdAt: true,
        },
      });
    } else {
      return res.status(400).json({ success: false, error: 'Invalid user role' });
    }

    res.json({
      success: true,
      data: { ...updatedUser, role: userRole },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la mise à jour du profil' });
  }
};

// Reset password with token
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, resetToken, newPassword } = req.body;

    if (!email || !resetToken || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Email, code de réinitialisation et nouveau mot de passe requis',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Le mot de passe doit contenir au moins 6 caractères',
      });
    }

    // Try to find user in both tables with valid reset token
    const [sender, carrier] = await Promise.all([
      prisma.sender.findFirst({
        where: {
          email: email.toLowerCase(),
          resetToken,
          resetTokenExpiry: { gte: new Date() },
        },
      }),
      prisma.carrier.findFirst({
        where: {
          email: email.toLowerCase(),
          resetToken,
          resetTokenExpiry: { gte: new Date() },
        },
      }),
    ]);

    const user = sender || carrier;
    const userRole = sender ? 'sender' : carrier ? 'carrier' : null;

    if (!user || !userRole) {
      return res.status(400).json({
        success: false,
        error: 'Code invalide ou expiré',
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear reset token
    if (userRole === 'sender') {
      await prisma.sender.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          resetToken: null,
          resetTokenExpiry: null,
        },
      });
    } else {
      await prisma.carrier.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          resetToken: null,
          resetTokenExpiry: null,
        },
      });
    }

    res.status(200).json({
      success: true,
      message: 'Mot de passe réinitialisé avec succès',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la réinitialisation du mot de passe',
    });
  }
};
