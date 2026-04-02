import express from 'express';
import AdminConversationsController from '../../controllers/admin/adminConversationsController.js';

const router = express.Router();
const adminConversationsController = new AdminConversationsController();

router.get('/conversations/export', adminConversationsController.exportConversations);
router.get('/conversations', adminConversationsController.getAllConversations);
router.put('/conversations/:id/feedback', adminConversationsController.setConversationFeedback);
router.put('/conversations/:id/messages/:messageId/feedback', adminConversationsController.setMessageFeedback);
router.put('/conversations/:id/good-answer', adminConversationsController.setConversationGoodAnswer);
router.put('/conversations/:id/corrected', adminConversationsController.setConversationCorrected);
router.delete('/conversations/:id', adminConversationsController.deleteConversation);

export default router;
