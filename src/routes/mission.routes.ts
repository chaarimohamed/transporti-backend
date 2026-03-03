import express from 'express';
import * as missionController from '../controllers/mission.controller';
import { auth } from '../middleware/auth';

const router = express.Router();

// All routes require authentication
router.use(auth);

// Get available missions (browse)
router.get('/available', missionController.getAvailableMissions);

// Get my missions (assigned to me)
router.get('/my-missions', missionController.getMyMissions);

// Get mission stats
router.get('/stats', missionController.getMissionStats);

// Get mission by ID
router.get('/:id', missionController.getMissionById);

// Accept a mission
router.post('/:id/accept', missionController.acceptMission);

// Update mission status
router.put('/:id/status', missionController.updateMissionStatus);

// Confirm delivery with code
router.post('/:id/confirm-delivery', missionController.confirmDelivery);

// Cancel mission
router.delete('/:id', missionController.cancelMission);

export default router;
