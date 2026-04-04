import { Router } from 'express';
import { register, login, getMe, forgotPassword, resetPassword, updateProfile } from '../controllers/auth.controller';
import { uploadDocuments, getDocuments, uploadProfilePhoto, getProfilePhoto } from '../controllers/documents.controller';
import { auth } from '../middleware/auth';

const router = Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Protected routes
router.get('/me', auth, getMe);
router.put('/profile', auth, updateProfile);

// Document upload/retrieval (carrier only)
router.post('/documents', auth, uploadDocuments);
router.get('/documents', auth, getDocuments);

// Profile photo upload/retrieval (sender + carrier)
router.post('/profile-photo', auth, uploadProfilePhoto);
router.get('/profile-photo', auth, getProfilePhoto);

export default router;
