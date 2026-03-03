import { Router } from 'express';
import { register, login, getMe, forgotPassword, resetPassword } from '../controllers/auth.controller';
import { auth } from '../middleware/auth';

const router = Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Protected routes
router.get('/me', auth, getMe);
router.put('/profile', auth, async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const userRole = (req as any).user.role;
    const { firstName, lastName, email, phone } = req.body;
    
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    
    let updatedUser;
    
    // Update based on user role
    if (userRole === 'sender') {
      updatedUser = await prisma.sender.update({
        where: { id: userId },
        data: {
          firstName,
          lastName,
          email,
          phone,
        },
      });
    } else if (userRole === 'carrier') {
      updatedUser = await prisma.carrier.update({
        where: { id: userId },
        data: {
          firstName,
          lastName,
          email,
          phone,
        },
      });
    } else {
      await prisma.$disconnect();
      return res.status(400).json({ success: false, error: 'Invalid user role' });
    }
    
    await prisma.$disconnect();
    
    // Return user data in the same format as login/register
    const userData = {
      ...updatedUser,
      role: userRole,
    };
    
    res.json({ success: true, data: userData, user: userData });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
});

export default router;
