import express from 'express';
import AdminEmailConversationsController from '../../controllers/admin/adminEmailConversationsController.js';

const router = express.Router();
const adminEmailConversationsController = new AdminEmailConversationsController();

// Emails (conversationmaildash)
router.get('/emails', adminEmailConversationsController.getAllEmailConversations);
router.put('/emails/:id/messages/:messageId/feedback', adminEmailConversationsController.setEmailMessageFeedback);

export default router;

