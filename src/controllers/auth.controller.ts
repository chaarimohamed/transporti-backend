import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../config/database';
import { sendOtpSms } from '../utils/sms';
import { sendOtpEmail, sendPasswordResetEmail } from '../utils/email';

// --- OTP helpers ---

/** Generate a cryptographically random 6-digit OTP string */
const generateOtp = (): string =>
  String(Math.floor(100000 + (parseInt(crypto.randomBytes(3).toString('hex'), 16) % 900000))).padStart(6, '0');

/** OTP validity window */
const OTP_TTL_MINUTES = 10;

// Register new user
export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, phone, role, gouvernerat, license, matricule, vehicleType, dateOfBirth } = req.body;

    // Validate required fields
    if (!email || !password || !firstName || !lastName || !phone || !role) {
      return res.status(400).json({
        success: false,
        error: 'Tous les champs sont obligatoires',
      });
    }

    const userRole = role.toLowerCase();

    // --- Format validations ---
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ success: false, error: 'Adresse email invalide' });
    }

    // Tunisian phone: 8 digits, optional +216 prefix
    const phoneRegex = /^(\+216[\s-]?)?\d{8}$/;
    if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
      return res.status(400).json({ success: false, error: 'Numéro de téléphone invalide — 8 chiffres requis' });
    }

    // Password strength: min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special char
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+\[\]{};':"\\|,.<>/?]).{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        success: false,
        error: 'Mot de passe trop faible — min. 8 caractères avec majuscule, chiffre et caractère spécial',
      });
    }

    if (userRole === 'carrier') {
      // Immatriculation tunisienne: 1-3 digits, optional space, TN, optional space, 1-4 digits
      if (license) {
        const licenseRegex = /^\d{1,3}\s?TN\s?\d{1,4}$/;
        if (!licenseRegex.test(license.trim())) {
          return res.status(400).json({ success: false, error: "Format d'immatriculation invalide — ex: 123 TN 4567" });
        }
      }

      // Matricule fiscale: exactly 7 digits + 1 letter
      if (matricule) {
        const matriculeRegex = /^\d{7}[A-Za-z]$/;
        if (!matriculeRegex.test(matricule.trim())) {
          return res.status(400).json({ success: false, error: 'Matricule fiscale invalide — 7 chiffres + 1 lettre (ex: 1234567A)' });
        }
      }
    }
    // --- End format validations ---

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

    // Generate OTP for phone verification
    const otp = generateOtp();
    const hashedOtp = await bcrypt.hash(otp, 10);
    const otpExpiry = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    let createdUser: any;

    if (userRole === 'sender') {
      createdUser = await prisma.sender.create({
        data: {
          email: email.toLowerCase(),
          password: hashedPassword,
          firstName,
          lastName,
          phone,
          phoneVerified: false,
          otpCode: hashedOtp,
          otpExpiry,
        },
      });
    } else {
      createdUser = await prisma.carrier.create({
        data: {
          email: email.toLowerCase(),
          password: hashedPassword,
          firstName,
          lastName,
          phone,
          gouvernerat,
          license,
          matricule,
          vehicleType,
          dateOfBirth,
          phoneVerified: false,
          otpCode: hashedOtp,
          otpExpiry,
        },
      });
    }

    // Send OTP via SMS
    await sendOtpSms(phone, otp);

    // Return userId + role so the client can navigate to the OTP screen
    // No JWT token yet — only issued after phone verification
    res.status(201).json({
      success: true,
      data: {
        userId: createdUser.id,
        phone: createdUser.phone,
        role: userRole,
        requiresVerification: true,
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
      { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any }
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
          dateOfBirth: true,
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
          dateOfBirth: true,
          gouvernerat: true,
          license: true,
          matricule: true,
          vehicleType: true,
          vehicleSize: true,
          verified: true,
          phoneVerified: true,
          emailVerified: true,
          cinDoc: true,
          permisDoc: true,
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

    // Build verification status for carriers
    const verificationStatus = userRole === 'carrier' ? {
      phoneVerified: (user as any).phoneVerified ?? false,
      emailVerified: (user as any).emailVerified ?? false,
      docsUploaded: !!((user as any).cinDoc && (user as any).permisDoc),
    } : undefined;

    // Remove sensitive doc fields from response
    const { cinDoc, permisDoc, ...safeUser } = user as any;

    res.status(200).json({
      success: true,
      data: { ...safeUser, role: userRole, verificationStatus },
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
        data: {
          message: 'Si un compte existe avec cet email, un code de réinitialisation a été envoyé',
        },
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

    // Send password reset email
    await sendPasswordResetEmail(user.email, resetToken);
    console.log(`Password reset token for ${email}: ${resetToken}`);

    res.status(200).json({
      success: true,
      data: {
        message: 'Si un compte existe avec cet email, un code de réinitialisation a été envoyé',
        // Return token whenever not in production so dev/ngrok testing works without SMTP
        ...(process.env.NODE_ENV !== 'production' && { resetToken }),
      },
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
    const { firstName, lastName, phone, gouvernorat, vehicleType, vehicleSize, dateOfBirth } = req.body;

    let updatedUser;

    if (userRole === 'sender') {
      updatedUser = await prisma.sender.update({
        where: { id: userId },
        data: {
          ...(firstName && { firstName }),
          ...(lastName && { lastName }),
          ...(phone && { phone }),
          ...(dateOfBirth !== undefined && { dateOfBirth }),
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          dateOfBirth: true,
          createdAt: true,
        },
      });
    } else if (userRole === 'carrier') {
      updatedUser = await prisma.carrier.update({
        where: { id: userId },
        data: {
          ...(firstName && { firstName }),
          ...(lastName && { lastName }),
          ...(phone && { phone }),
          // gouvernorat from the form maps to the gouvernerat DB column
          ...(gouvernorat !== undefined && { gouvernerat: gouvernorat }),
          ...(vehicleType !== undefined && { vehicleType }),
          ...(vehicleSize !== undefined && { vehicleSize }),
          ...(dateOfBirth !== undefined && { dateOfBirth }),
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          dateOfBirth: true,
          gouvernerat: true,
          license: true,
          matricule: true,
          vehicleType: true,
          vehicleSize: true,
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

// Verify phone OTP
export const verifyPhone = async (req: Request, res: Response) => {
  try {
    const { userId, role, otp } = req.body;

    if (!userId || !role || !otp) {
      return res.status(400).json({ success: false, error: 'userId, role et otp requis' });
    }

    const userRole = role.toLowerCase();
    const table = userRole === 'sender' ? prisma.sender : prisma.carrier;

    const user = await (table as any).findUnique({
      where: { id: userId },
      select: { id: true, email: true, otpCode: true, otpExpiry: true, phoneVerified: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });
    }

    if (user.phoneVerified) {
      return res.status(400).json({ success: false, error: 'Numéro déjà vérifié' });
    }

    if (!user.otpCode || !user.otpExpiry) {
      return res.status(400).json({ success: false, error: 'Aucun code en attente — demandez un nouveau code' });
    }

    if (new Date() > new Date(user.otpExpiry)) {
      return res.status(400).json({ success: false, error: 'Code expiré — demandez un nouveau code' });
    }

    const isValid = await bcrypt.compare(String(otp), user.otpCode);
    if (!isValid) {
      return res.status(400).json({ success: false, error: 'Code incorrect' });
    }

    // Mark as verified and clear OTP
    const updatedUser = await (table as any).update({
      where: { id: userId },
      data: { phoneVerified: true, otpCode: null, otpExpiry: null },
    });

    // Generate JWT now that phone is verified
    const token = jwt.sign(
      { id: updatedUser.id, email: updatedUser.email, role: userRole },
      process.env.JWT_SECRET!,
      { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any }
    );

    const { password: _, otpCode: __, otpExpiry: ___, ...userWithoutSecrets } = updatedUser;

    res.status(200).json({
      success: true,
      data: {
        user: { ...userWithoutSecrets, role: userRole },
        token,
      },
    });
  } catch (error) {
    console.error('Verify phone error:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la vérification' });
  }
};

// Resend OTP
export const resendOtp = async (req: Request, res: Response) => {
  try {
    const { userId, role } = req.body;

    if (!userId || !role) {
      return res.status(400).json({ success: false, error: 'userId et role requis' });
    }

    const userRole = role.toLowerCase();
    const table = userRole === 'sender' ? prisma.sender : prisma.carrier;

    const user = await (table as any).findUnique({
      where: { id: userId },
      select: { id: true, phone: true, phoneVerified: true, otpExpiry: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });
    }

    if (user.phoneVerified) {
      return res.status(400).json({ success: false, error: 'Numéro déjà vérifié' });
    }

    // Rate-limit: don't resend if a valid OTP was issued less than 60 seconds ago
    if (user.otpExpiry) {
      const secondsRemaining = (new Date(user.otpExpiry).getTime() - Date.now()) / 1000;
      const cooldownSeconds = OTP_TTL_MINUTES * 60 - 60;
      if (secondsRemaining > cooldownSeconds) {
        return res.status(429).json({
          success: false,
          error: 'Veuillez attendre avant de demander un nouveau code',
        });
      }
    }

    const otp = generateOtp();
    const hashedOtp = await bcrypt.hash(otp, 10);
    const otpExpiry = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await (table as any).update({
      where: { id: userId },
      data: { otpCode: hashedOtp, otpExpiry },
    });

    await sendOtpSms(user.phone, otp);

    res.status(200).json({ success: true, message: 'Nouveau code envoyé' });
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de l\'envoi du code' });
  }
};

// Send email OTP
export const sendEmailOtp = async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const table = userRole === 'sender' ? prisma.sender : prisma.carrier;

    const user = await (table as any).findUnique({
      where: { id: userId },
      select: { id: true, email: true, emailVerified: true, otpExpiry: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ success: false, error: 'Email déjà vérifié' });
    }

    // Rate-limit: 60s cooldown
    if (user.otpExpiry) {
      const secondsRemaining = (new Date(user.otpExpiry).getTime() - Date.now()) / 1000;
      const cooldownSeconds = OTP_TTL_MINUTES * 60 - 60;
      if (secondsRemaining > cooldownSeconds) {
        return res.status(429).json({
          success: false,
          error: 'Veuillez attendre avant de demander un nouveau code',
        });
      }
    }

    const otp = generateOtp();
    const hashedOtp = await bcrypt.hash(otp, 10);
    const otpExpiry = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await (table as any).update({
      where: { id: userId },
      data: { otpCode: hashedOtp, otpExpiry },
    });

    await sendOtpEmail(user.email, otp);

    res.status(200).json({ success: true, message: 'Code envoyé par email' });
  } catch (error) {
    console.error('Send email OTP error:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de l\'envoi du code' });
  }
};

// Verify email OTP
export const verifyEmail = async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({ success: false, error: 'Code requis' });
    }

    const table = userRole === 'sender' ? prisma.sender : prisma.carrier;

    const user = await (table as any).findUnique({
      where: { id: userId },
      select: { id: true, otpCode: true, otpExpiry: true, emailVerified: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ success: false, error: 'Email déjà vérifié' });
    }

    if (!user.otpCode || !user.otpExpiry) {
      return res.status(400).json({ success: false, error: 'Aucun code en attente — demandez un nouveau code' });
    }

    if (new Date() > new Date(user.otpExpiry)) {
      return res.status(400).json({ success: false, error: 'Code expiré — demandez un nouveau code' });
    }

    const isValid = await bcrypt.compare(String(otp), user.otpCode);
    if (!isValid) {
      return res.status(400).json({ success: false, error: 'Code incorrect' });
    }

    await (table as any).update({
      where: { id: userId },
      data: { emailVerified: true, otpCode: null, otpExpiry: null },
    });

    res.status(200).json({ success: true, message: 'Email vérifié avec succès' });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la vérification' });
  }
};
