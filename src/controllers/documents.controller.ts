import { Response } from 'express';
import crypto from 'crypto';
import prisma from '../config/database';

/** 
 * AES-256-CBC encryption helpers.
 * Key: 32-byte hex string stored in DOCUMENTS_ENCRYPTION_KEY env var.
 * Output format: `<iv_hex>:<ciphertext_hex>` — stored directly in the DB.
 */
const ALGO = 'aes-256-cbc';

const getKey = (): Buffer => {
  const hex = process.env.DOCUMENTS_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('DOCUMENTS_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
};

export const encrypt = (plaintext: string): string => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
};

export const decrypt = (stored: string): string => {
  const [ivHex, ctHex] = stored.split(':');
  if (!ivHex || !ctHex) throw new Error('Invalid encrypted document format');
  const iv = Buffer.from(ivHex, 'hex');
  const ct = Buffer.from(ctHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
};

/**
 * POST /api/auth/documents
 * Body: { cinBase64?: string, permisBase64?: string }
 * Both values are base64-encoded image strings (data URI or raw base64).
 * At least one field must be provided.
 */
export const uploadDocuments = async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'carrier') {
      return res.status(403).json({ success: false, error: 'Réservé aux transporteurs' });
    }

    const { cinBase64, permisBase64 } = req.body;

    if (!cinBase64 && !permisBase64) {
      return res.status(400).json({
        success: false,
        error: 'Au moins un document (CIN ou Permis) est requis',
      });
    }

    // Validate that provided values are non-empty strings
    if (cinBase64 !== undefined && typeof cinBase64 !== 'string') {
      return res.status(400).json({ success: false, error: 'cinBase64 must be a string' });
    }
    if (permisBase64 !== undefined && typeof permisBase64 !== 'string') {
      return res.status(400).json({ success: false, error: 'permisBase64 must be a string' });
    }

    // Basic size guard: base64-encoded 10MB ≈ 13.3 MB string
    const MAX_B64_LEN = 14_000_000;
    if (cinBase64 && cinBase64.length > MAX_B64_LEN) {
      return res.status(400).json({ success: false, error: 'CIN image trop volumineux (max ~10 Mo)' });
    }
    if (permisBase64 && permisBase64.length > MAX_B64_LEN) {
      return res.status(400).json({ success: false, error: 'Permis image trop volumineux (max ~10 Mo)' });
    }

    // Encrypt each provided document
    const data: Record<string, any> = { docsUploadedAt: new Date() };
    if (cinBase64) data.cinDoc = encrypt(cinBase64);
    if (permisBase64) data.permisDoc = encrypt(permisBase64);

    await prisma.carrier.update({
      where: { id: req.user.id },
      data,
    });

    res.status(200).json({
      success: true,
      data: {
        cinUploaded: !!cinBase64,
        permisUploaded: !!permisBase64,
        uploadedAt: data.docsUploadedAt,
      },
    });
  } catch (error: any) {
    console.error('Upload documents error:', error);
    if (error.message?.includes('DOCUMENTS_ENCRYPTION_KEY')) {
      return res.status(500).json({
        success: false,
        error: 'Configuration serveur manquante (clé de chiffrement)',
      });
    }
    res.status(500).json({ success: false, error: 'Erreur lors du téléchargement des documents' });
  }
};

/**
 * GET /api/auth/documents
 * Returns decrypted base64 strings for the authenticated carrier.
 */
export const getDocuments = async (req: any, res: Response) => {
  try {
    if (req.user.role !== 'carrier') {
      return res.status(403).json({ success: false, error: 'Réservé aux transporteurs' });
    }

    const carrier = await prisma.carrier.findUnique({
      where: { id: req.user.id },
      select: { cinDoc: true, permisDoc: true, docsUploadedAt: true },
    });

    if (!carrier) {
      return res.status(404).json({ success: false, error: 'Transporteur introuvable' });
    }

    res.status(200).json({
      success: true,
      data: {
        cinBase64: carrier.cinDoc ? decrypt(carrier.cinDoc) : null,
        permisBase64: carrier.permisDoc ? decrypt(carrier.permisDoc) : null,
        uploadedAt: carrier.docsUploadedAt,
      },
    });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la récupération des documents' });
  }
};

/**
 * POST /api/auth/profile-photo
 * Body: { photoBase64: string }
 * Works for both senders and carriers.
 */
export const uploadProfilePhoto = async (req: any, res: Response) => {
  try {
    const { photoBase64 } = req.body;

    if (!photoBase64 || typeof photoBase64 !== 'string') {
      return res.status(400).json({ success: false, error: 'photoBase64 requis' });
    }

    const MAX_B64_LEN = 14_000_000;
    if (photoBase64.length > MAX_B64_LEN) {
      return res.status(400).json({ success: false, error: 'Photo trop volumineuse (max ~10 Mo)' });
    }

    const encrypted = encrypt(photoBase64);
    const table = req.user.role === 'sender' ? 'sender' : 'carrier';

    if (table === 'sender') {
      await prisma.sender.update({
        where: { id: req.user.id },
        data: { profilePhoto: encrypted },
      });
    } else {
      await prisma.carrier.update({
        where: { id: req.user.id },
        data: { profilePhoto: encrypted },
      });
    }

    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Upload profile photo error:', error);
    if (error.message?.includes('DOCUMENTS_ENCRYPTION_KEY')) {
      return res.status(500).json({ success: false, error: 'Configuration serveur manquante (clé de chiffrement)' });
    }
    res.status(500).json({ success: false, error: 'Erreur lors du téléchargement de la photo' });
  }
};

/**
 * GET /api/auth/profile-photo
 * Returns decrypted base64 for the authenticated user (sender or carrier).
 */
export const getProfilePhoto = async (req: any, res: Response) => {
  try {
    let encrypted: string | null = null;

    if (req.user.role === 'sender') {
      const sender = await prisma.sender.findUnique({
        where: { id: req.user.id },
        select: { profilePhoto: true },
      });
      encrypted = sender?.profilePhoto ?? null;
    } else {
      const carrier = await prisma.carrier.findUnique({
        where: { id: req.user.id },
        select: { profilePhoto: true },
      });
      encrypted = carrier?.profilePhoto ?? null;
    }

    res.status(200).json({
      success: true,
      data: { photoBase64: encrypted ? decrypt(encrypted) : null },
    });
  } catch (error) {
    console.error('Get profile photo error:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la récupération de la photo' });
  }
};
