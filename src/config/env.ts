import dotenv from 'dotenv';
import type { SignOptions } from 'jsonwebtoken';

dotenv.config();

const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET'] as const;

const missingEnvVars = requiredEnvVars.filter((name) => {
  const value = process.env[name];
  return !value || value.trim().length === 0;
});

if (missingEnvVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingEnvVars.join(', ')}. Copy .env.example to .env and fill in the values before starting the backend.`
  );
}

const parsePort = () => {
  const rawPort = process.env.PORT?.trim() || '3000';
  const port = Number.parseInt(rawPort, 10);

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value "${rawPort}". Expected a positive integer.`);
  }

  return port;
};

const parseAllowedOrigins = () => {
  const rawOrigins = process.env.ALLOWED_ORIGINS?.trim();

  if (!rawOrigins || rawOrigins === '*') {
    return [];
  }

  return rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const parseJwtExpiresIn = (): SignOptions['expiresIn'] => {
  return (process.env.JWT_EXPIRES_IN?.trim() || '7d') as SignOptions['expiresIn'];
};

export const env = {
  port: parsePort(),
  nodeEnv: process.env.NODE_ENV?.trim() || 'development',
  jwtSecret: process.env.JWT_SECRET!,
  jwtExpiresIn: parseJwtExpiresIn(),
  allowedOrigins: parseAllowedOrigins(),
  documentsEncryptionKey: process.env.DOCUMENTS_ENCRYPTION_KEY?.trim(),
  easySendSmsApiKey: process.env.EASYSENDSMS_API_KEY?.trim(),
};
