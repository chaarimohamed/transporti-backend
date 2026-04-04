/**
 * decrypt-docs.js
 * Usage: node decrypt-docs.js <carrierId>
 * Fetches the carrier's encrypted documents from the DB and decrypts them,
 * then saves them as image files in the current directory.
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGO = 'aes-256-cbc';

function getKey() {
  const hex = process.env.DOCUMENTS_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('DOCUMENTS_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

function decrypt(stored) {
  const colonIdx = stored.indexOf(':');
  if (colonIdx === -1) throw new Error('Invalid format: missing colon separator');
  const ivHex = stored.slice(0, colonIdx);
  const ctHex = stored.slice(colonIdx + 1);
  const iv = Buffer.from(ivHex, 'hex');
  const ct = Buffer.from(ctHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

async function main() {
  const carrierId = process.argv[2];
  if (!carrierId) {
    console.error('Usage: node decrypt-docs.js <carrierId>');
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    const carrier = await prisma.carrier.findUnique({
      where: { id: carrierId },
      select: { cinDoc: true, permisDoc: true, docsUploadedAt: true },
    });

    if (!carrier) {
      console.error(`No carrier found with id: ${carrierId}`);
      process.exit(1);
    }

    console.log('uploadedAt:', carrier.docsUploadedAt);

    function saveImage(fieldName, b64) {
      // Strip data URI prefix if present (e.g. "data:image/jpeg;base64,")
      const raw = b64.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(raw, 'base64');

      // Detect format by magic bytes
      let ext = 'jpg';
      if (buffer[0] === 0x89 && buffer[1] === 0x50) ext = 'png';
      else if (buffer[0] === 0x47 && buffer[1] === 0x49) ext = 'gif';
      else if (buffer[0] === 0x25 && buffer[1] === 0x50) ext = 'pdf';

      const outPath = path.resolve(__dirname, `${fieldName}.${ext}`);
      fs.writeFileSync(outPath, buffer);
      console.log(`✓ Saved ${fieldName} → ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
    }

    if (carrier.cinDoc) {
      saveImage('cinDoc', decrypt(carrier.cinDoc));
    } else {
      console.log('cinDoc: null');
    }

    if (carrier.permisDoc) {
      saveImage('permisDoc', decrypt(carrier.permisDoc));
    } else {
      console.log('permisDoc: null');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
