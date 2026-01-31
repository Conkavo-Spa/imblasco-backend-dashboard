import express from 'express';
import AdminConversationsController from '../../controllers/admin/adminConversationsController.js';

const router = express.Router();
const adminConversationsController = new AdminConversationsController();

router.get('/conversations', adminConversationsController.getAllConversations);
router.put('/conversations/:id/feedback', adminConversationsController.setConversationFeedback);
router.put('/conversations/:id/messages/:messageId/feedback', adminConversationsController.setMessageFeedback);

export default router;
