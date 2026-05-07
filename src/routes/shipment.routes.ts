import { Router } from 'express';
import {
  createShipment,
  getMyShipments,
  getAvailableShipments,
  getShipmentById,
  requestShipment,
  getShipmentApplications,
  inviteCarrier,
  acceptInvitation,
  acceptCarrier,
  rejectCarrier,
  updateShipment,
  updateShipmentStatus,
  cancelShipment,
  getShipmentStats,
  getCarrierShipmentStats,
  getAvailableCarriers,
  getInvitedCarriers,
  confirmHandover,
  submitShipmentFeedback,
  uploadShipmentPhotos,
} from '../controllers/shipment.controller';
import { auth } from '../middleware/auth';

const router = Router();

// All routes are protected - require authentication
router.use(auth);

// Shipment routes
router.post('/', createShipment);
router.get('/available', getAvailableShipments); // Must be before /:id
router.get('/stats', getShipmentStats);
router.get('/carrier-stats', getCarrierShipmentStats); // Carrier stats
router.get('/', getMyShipments);
router.get('/:id/applications', getShipmentApplications); // TC-106: Sender views carrier applications (must be before /:id)
router.get('/:id', getShipmentById);
router.get('/:id/available-carriers', getAvailableCarriers); // Get available carriers for shipment
router.get('/:id/invited-carriers', getInvitedCarriers);   // Get invited carrier IDs for shipment
router.post('/:id/request', requestShipment); // Carrier requests shipment with proposed price
router.post('/:id/invite-carrier', inviteCarrier); // Sender invites carrier
router.post('/:id/accept-invitation', acceptInvitation); // Carrier accepts invitation with proposed price
router.post('/:id/accept-carrier', acceptCarrier); // Sender accepts a specific carrier application
router.post('/:id/reject-carrier', rejectCarrier); // Sender rejects a specific carrier application
router.post('/:id/confirm-handover', confirmHandover); // Sender confirms handover to carrier
router.post('/:id/feedback', submitShipmentFeedback); // Sender/carrier submit delivery feedback
router.post('/:id/photos', uploadShipmentPhotos);       // Sender uploads package photos
router.put('/:id/status', updateShipmentStatus); // Carrier updates status
router.put('/:id', updateShipment);
router.delete('/:id', cancelShipment);

export default router;
