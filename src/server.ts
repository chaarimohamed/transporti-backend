import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import shipmentRoutes from './routes/shipment.routes';
import missionRoutes from './routes/mission.routes';
import notificationRoutes from './routes/notification.routes';
import { errorHandler, notFound } from './middleware/errorHandler';
import prisma from './config/database';

// Load environment variables
dotenv.config();

// Initialize Express app
const app: Application = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true,
}));
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

// Privacy Policy (required by Google Play)
app.get('/privacy', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Politique de Confidentialité - Transporti</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #333; line-height: 1.6; }
    h1 { color: #FF6B00; } h2 { color: #444; margin-top: 30px; }
    .updated { color: #888; font-size: 14px; }
  </style>
</head>
<body>
  <h1>Politique de Confidentialité</h1>
  <p class="updated">Dernière mise à jour : 17 mai 2026</p>

  <h2>1. Introduction</h2>
  <p>Transporti (« nous », « notre ») est une application de mise en relation entre expéditeurs et transporteurs en Tunisie. Cette politique décrit comment nous collectons, utilisons et protégeons vos données personnelles.</p>

  <h2>2. Données collectées</h2>
  <p>Nous collectons les données suivantes :</p>
  <ul>
    <li><strong>Informations d'identité :</strong> nom, prénom, adresse e-mail, numéro de téléphone, date de naissance.</li>
    <li><strong>Informations de profil transporteur :</strong> gouvernorat, type et taille du véhicule, documents professionnels (permis, carte grise, assurance).</li>
    <li><strong>Données de localisation :</strong> adresses de collecte et de livraison saisies pour les expéditions.</li>
    <li><strong>Photos :</strong> photo de profil, photos des colis.</li>
    <li><strong>Données d'utilisation :</strong> historique des expéditions, évaluations, notifications.</li>
  </ul>

  <h2>3. Utilisation des données</h2>
  <p>Vos données sont utilisées pour :</p>
  <ul>
    <li>Créer et gérer votre compte utilisateur.</li>
    <li>Permettre la mise en relation entre expéditeurs et transporteurs.</li>
    <li>Envoyer des notifications relatives à vos expéditions (SMS, notifications push, e-mail).</li>
    <li>Améliorer nos services et assurer la sécurité de la plateforme.</li>
  </ul>

  <h2>4. Partage des données</h2>
  <p>Nous ne vendons pas vos données. Elles peuvent être partagées avec :</p>
  <ul>
    <li>L'autre partie d'une expédition (expéditeur ou transporteur) dans le cadre d'une mission acceptée.</li>
    <li>Nos fournisseurs de services techniques (hébergement AWS, envoi de SMS).</li>
  </ul>

  <h2>5. Sécurité</h2>
  <p>Nous mettons en œuvre des mesures de sécurité appropriées : chiffrement des mots de passe, connexions sécurisées (HTTPS), stockage sécurisé sur AWS.</p>

  <h2>6. Conservation</h2>
  <p>Vos données sont conservées tant que votre compte est actif. Vous pouvez demander la suppression de votre compte et de vos données en nous contactant.</p>

  <h2>7. Vos droits</h2>
  <p>Conformément à la législation tunisienne sur la protection des données, vous disposez d'un droit d'accès, de rectification et de suppression de vos données personnelles.</p>

  <h2>8. Contact</h2>
  <p>Pour toute question relative à cette politique :<br>
  <strong>E-mail :</strong> mohamed.chaari@transporti.tn</p>
</body>
</html>`);
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/shipments', shipmentRoutes);
app.use('/api/missions', missionRoutes);
app.use('/api/notifications', notificationRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

// Export app for Lambda handler (lambda.ts)
export { app };

// Only start the HTTP server when running locally (not on Lambda)
let server: ReturnType<typeof app.listen> | undefined;
if (process.env.AWS_LAMBDA_FUNCTION_NAME === undefined) {
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
    console.log(`📱 Mobile access: http://172.18.158.204:${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('⚠️  SIGTERM received, shutting down gracefully...');
    if (server) {
      server.close(async () => {
        await prisma.$disconnect();
        console.log('👋 Server closed');
        process.exit(0);
      });
    } else {
      await prisma.$disconnect();
      process.exit(0);
    }
  });
}

process.on('SIGINT', async () => {
  console.log('⚠️  SIGINT received, shutting down gracefully...');
  if (server) {
    server.close(async () => {
      await prisma.$disconnect();
      console.log('👋 Server closed');
      process.exit(0);
    });
  } else {
    await prisma.$disconnect();
    process.exit(0);
  }
});

export default app;
