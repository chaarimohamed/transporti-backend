import { Router } from 'express';
import { register, login, getMe, forgotPassword, resetPassword, updateProfile } from '../controllers/auth.controller';
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

export default router;
