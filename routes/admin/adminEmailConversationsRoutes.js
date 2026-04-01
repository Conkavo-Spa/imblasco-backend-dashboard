import express from 'express';
import AdminEmailConversationsController from '../../controllers/admin/adminEmailConversationsController.js';

const router = express.Router();
const adminEmailConversationsController = new AdminEmailConversationsController();

// Emails (conversationmaildash)
router.get('/emails', adminEmailConversationsController.getAllEmailConversations);
router.put('/emails/:id/messages/:messageId/feedback', adminEmailConversationsController.setEmailMessageFeedback);
router.delete('/emails/:id', adminEmailConversationsController.deleteEmailConversation);
router.put('/emails/:id/good-answer', adminEmailConversationsController.setEmailConversationGoodAnswer);

export default router;

