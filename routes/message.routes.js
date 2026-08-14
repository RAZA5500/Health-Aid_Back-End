import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  getConversations,
  getMessages,
  sendMessage,
  startConversation,
  searchStaff,
  createMessageRequest,
  getMessageRequests,
  updateMessageRequest,
  startGeneralHelp,
  updateAvailability,
  sendQuickAction,
  deleteMessage,
  deleteConversation,
} from "../controller/message.controller.js";

const router = express.Router();

router.use(protect);

router.get("/conversations", getConversations);
router.post("/conversations", startConversation);
router.get("/conversations/:id", getMessages);
router.delete("/conversations/:id", deleteConversation);
router.post("/", sendMessage);
router.delete("/:messageId", deleteMessage);

router.get("/staff", searchStaff);
router.post("/requests", createMessageRequest);
router.get("/requests", getMessageRequests);
router.patch("/requests/:id", updateMessageRequest);
router.post("/general-help", startGeneralHelp);
router.patch("/availability", updateAvailability);
router.post("/quick-action", sendQuickAction);

export default router;
