import express, { Application } from 'express';
import cors, { CorsOptions } from 'cors';
import os from 'os';
import { env } from './config/env';
import authRoutes from './routes/auth.routes';
import shipmentRoutes from './routes/shipment.routes';
import missionRoutes from './routes/mission.routes';
import notificationRoutes from './routes/notification.routes';
import { errorHandler, notFound } from './middleware/errorHandler';
import prisma from './config/database';

// Initialize Express app
const app: Application = express();

const getLanUrls = (port: number) => {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((details): details is os.NetworkInterfaceInfo => details !== undefined)
    .filter((details) => details.family === 'IPv4' && !details.internal)
    .map((details) => `http://${details.address}:${port}`);
};

const corsOptions: CorsOptions = {
  credentials: true,
  origin(origin, callback) {
    if (!origin || env.allowedOrigins.length === 0 || env.allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '20mb' }));     // large enough for two base64 images
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Transporti API is running! 🚚',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/shipments', shipmentRoutes);
app.use('/api/missions', missionRoutes);
app.use('/api/notifications', notificationRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

const gracefulShutdown = async (signal: string) => {
  console.log(`⚠️  ${signal} received, shutting down gracefully...`);
  server.close(async () => {
    await prisma.$disconnect();
    console.log('👋 Server closed');
    process.exit(0);
  });
};

// Start server
const server = app.listen(env.port, '0.0.0.0', () => {
  console.log(`🚀 Server is running on http://localhost:${env.port}`);

  const lanUrls = getLanUrls(env.port);
  if (lanUrls.length > 0) {
    lanUrls.forEach((url) => {
      console.log(`📱 Mobile access: ${url}`);
    });
  } else {
    console.log('📱 Mobile access: no LAN interface detected');
  }

  console.log(`📊 Environment: ${env.nodeEnv}`);
});

server.on('error', async (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${env.port} is already in use. Stop the existing process and retry.`);
  } else {
    console.error('❌ Server error:', err.message);
  }
  await prisma.$disconnect();
  process.exit(1);
});

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

export default app;
