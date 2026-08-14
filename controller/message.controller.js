import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";
import MessageRequest from "../models/messageRequest.model.js";
import Notification from "../models/notification.model.js";
import User from "../models/user.models.js";
import SupportTicket from "../models/supportTicket.model.js";
import { createNotification, deleteMessageNotifications, deleteConversationNotifications } from "../utils/notificationService.js";
import { canAccessPatient } from "../utils/accessControl.js";
import { findAvailableStaff, getOrCreateConversation } from "../utils/seedMessagingStaff.js";

function emitToConversation(req, conversationId, event, data) {
  const io = req.app.get("io");
  if (io) io.to(`conversation:${conversationId}`).emit(event, data);
}

function emitToUser(req, userId, event, data) {
  const io = req.app.get("io");
  if (io) io.to(`user:${userId}`).emit(event, data);
}

function emitNotificationsUpdated(req, userId) {
  const io = req.app.get("io");
  if (!io) return;
  Notification.countDocuments({ user: userId, read: false }).then((unreadCount) => {
    io.to(`user:${userId}`).emit("notifications_updated", { unreadCount });
  });
}

const DELETE_FOR_EVERYONE_MS = 60 * 60 * 1000;

function isSystemType(type) {
  return ["system", "consultation", "request_accepted", "request_declined", "quick_action"].includes(type);
}

function normalizeSender(sender) {
  if (!sender) return { _id: "unknown", name: "Unknown User" };
  if (typeof sender === "object" && sender._id) return sender;
  return { _id: String(sender), name: "Unknown User" };
}

function maskReplyTo(replyTo) {
  if (!replyTo) return null;
  const obj = replyTo.toObject ? replyTo.toObject() : { ...replyTo };
  if (obj.deletedForEveryone) {
    return {
      ...obj,
      content: "Message deleted",
      sender: normalizeSender(obj.sender),
    };
  }
  if (obj.sender) {
    obj.sender = normalizeSender(obj.sender);
  }
  return obj;
}

function formatMessageForUser(msg, userId) {
  const obj = msg.toObject ? msg.toObject() : { ...msg };
  if (obj.deletedFor?.some((id) => id.toString() === userId.toString())) {
    return null;
  }
  obj.sender = normalizeSender(obj.sender);
  if (obj.replyTo) {
    obj.replyTo = maskReplyTo(obj.replyTo);
  }
  if (obj.deletedForEveryone) {
    return { ...obj, content: "Message deleted" };
  }
  return obj;
}

async function assertConversationAccess(conversation, user) {
  const isParticipant = conversation.participants.some(
    (p) => p.toString() === user._id.toString(),
  );
  if (!isParticipant && user.role !== "admin") {
    return false;
  }
  return true;
}

async function createSystemMessage(conversationId, senderId, content, type = "system") {
  return Message.create({
    conversation: conversationId,
    sender: senderId,
    content,
    type,
    readBy: [senderId],
  });
}

async function enrichConversation(conv, userId) {
  const unread = await Message.countDocuments({
    conversation: conv._id,
    sender: { $ne: userId },
    readBy: { $ne: userId },
    deletedFor: { $ne: userId },
    deletedForEveryone: { $ne: true },
  });
  const obj = conv.toObject ? conv.toObject() : { ...conv };
  return { ...obj, unreadCount: unread };
}

function buildConversationFilter(user) {
  if (user.role === "patient") return { patient: user._id };
  if (user.role === "doctor" || user.role === "nurse" || user.role === "receptionist") {
    return { provider: user._id };
  }
  if (user.role === "admin") return {};
  return null;
}

function formatDoctorName(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return "Doctor";
  if (/^dr\.?\s/i.test(trimmed)) return trimmed;
  return `Dr. ${trimmed}`;
}

function matchesSearch(item, query) {
  const q = query.toLowerCase();
  const fields = [
    item.name,
    item.specialization,
    item.specialty,
    item.department,
    item.role,
    item.title,
    item.lastMessage,
    item.provider?.name,
    item.patient?.name,
    item.provider?.specialization,
    item.provider?.specialty,
    item.provider?.department,
    item.provider?.role,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (q === "nurse" && item.role === "nurse") return true;
  if (q === "reception" && (item.role === "receptionist" || fields.includes("reception"))) return true;
  if (q === "cardio" && (fields.includes("cardio") || fields.includes("cardiology"))) return true;
  return fields.includes(q);
}

export const getConversations = async (req, res) => {
  try {
    const filter = buildConversationFilter(req.user);
    if (!filter) return res.status(403).json({ message: "Access denied" });

    const { search } = req.query;
    const conversations = await Conversation.find({
      ...filter,
      deletedFor: { $ne: req.user._id },
    })
      .populate("patient", "name avatar role")
      .populate("provider", "name avatar role specialization specialty department availability online")
      .populate("messageRequest")
      .sort({ lastMessageAt: -1 });

    let enriched = await Promise.all(conversations.map((c) => enrichConversation(c, req.user._id)));

    if (search?.trim()) {
      enriched = enriched.filter((c) => matchesSearch(c, search.trim()));
    }

    const totalUnread = enriched.reduce((sum, c) => sum + c.unreadCount, 0);
    res.json({ conversations: enriched, totalUnread });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const searchStaff = async (req, res) => {
  try {
    const { search = "", category } = req.query;
    const filter = { isActive: true, role: { $in: ["doctor", "nurse", "receptionist"] } };

    if (category === "doctors") filter.role = "doctor";
    else if (category === "nurses") filter.role = "nurse";
    else if (category === "reception") filter.role = "receptionist";

    let staff = await User.find(filter)
      .select("name avatar role specialization specialty department availability online")
      .sort({ name: 1 });

    if (search.trim()) {
      staff = staff.filter((s) => matchesSearch(s, search.trim()));
    }

    res.json({ staff });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getMessages = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id)
      .populate("patient", "name avatar role")
      .populate("provider", "name avatar role specialization specialty department availability online")
      .populate("messageRequest");

    if (!conversation) return res.status(404).json({ message: "Conversation not found" });

    if (!(await assertConversationAccess(conversation, req.user))) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (conversation.deletedFor?.some((id) => id.toString() === req.user._id.toString())) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const rawMessages = await Message.find({
      conversation: conversation._id,
      deletedFor: { $ne: req.user._id },
    })
      .populate("sender", "name avatar role")
      .populate({
        path: "replyTo",
        select: "content sender deletedForEveryone type createdAt",
        populate: { path: "sender", select: "name avatar role" },
      })
      .sort({ createdAt: 1 });

    const messages = rawMessages
      .map((m) => formatMessageForUser(m, req.user._id))
      .filter(Boolean);

    await Message.updateMany(
      {
        conversation: conversation._id,
        sender: { $ne: req.user._id },
        readBy: { $ne: req.user._id },
      },
      { $addToSet: { readBy: req.user._id } },
    );

    const canSend =
      conversation.status === "active" ||
      (req.user.role !== "patient" && conversation.status !== "declined");

    res.json({ conversation, messages, canSend });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { content, conversationId, recipientId, type = "text", replyTo } = req.body;
    if (!content?.trim()) {
      return res.status(400).json({ message: "Message content is required" });
    }

    let conversation;

    if (conversationId) {
      conversation = await Conversation.findById(conversationId);
      if (!conversation) return res.status(404).json({ message: "Conversation not found" });

      const isParticipant = conversation.participants.some(
        (p) => p.toString() === req.user._id.toString(),
      );
      if (!isParticipant && req.user.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      if (req.user.role === "patient" && ["pending", "locked", "declined"].includes(conversation.status)) {
        return res.status(403).json({
          message:
            conversation.status === "declined"
              ? "Your message request was declined"
              : "Waiting for doctor approval",
        });
      }
    } else if (recipientId) {
      const recipient = await User.findById(recipientId);
      if (!recipient) return res.status(404).json({ message: "Recipient not found" });

      if (req.user.role === "patient" && recipient.role === "doctor") {
        return res.status(403).json({
          message: "Please request messaging approval from this doctor first",
        });
      }

      if (req.user.role === "patient" && ["nurse", "receptionist"].includes(recipient.role)) {
        conversation = await getOrCreateConversation({
          patientId: req.user._id,
          providerId: recipient._id,
          providerRole: recipient.role,
          status: "active",
        });
      } else if (["doctor", "nurse", "receptionist"].includes(req.user.role) && recipient.role === "patient") {
        const allowed = await canAccessPatient(req.user, recipient._id);
        if (!allowed && req.user.role !== "receptionist") {
          return res.status(403).json({ message: "You can only message assigned patients" });
        }
        conversation = await getOrCreateConversation({
          patientId: recipient._id,
          providerId: req.user._id,
          providerRole: req.user.role,
          status: "active",
        });
      } else {
        return res.status(403).json({ message: "Invalid messaging pair for your role" });
      }
    } else {
      return res.status(400).json({ message: "conversationId or recipientId required" });
    }

    let replyToId = null;
    if (replyTo) {
      const replyMsg = await Message.findById(replyTo);
      if (!replyMsg || replyMsg.conversation.toString() !== conversation._id.toString()) {
        return res.status(400).json({ message: "Invalid reply target" });
      }
      if (replyMsg.deletedForEveryone) {
        return res.status(400).json({ message: "Cannot reply to a deleted message" });
      }
      replyToId = replyMsg._id;
    }

    if (conversation.deletedFor?.length) {
      conversation.deletedFor = [];
    }

    const message = await Message.create({
      conversation: conversation._id,
      sender: req.user._id,
      content: content.trim(),
      type,
      readBy: [req.user._id],
      replyTo: replyToId,
    });

    conversation.lastMessage = content.trim().slice(0, 200);
    conversation.lastMessageAt = new Date();
    await conversation.save();

    const populated = await Message.findById(message._id)
      .populate("sender", "name avatar role")
      .populate({
        path: "replyTo",
        select: "content sender deletedForEveryone type createdAt",
        populate: { path: "sender", select: "name avatar role" },
      });

    const recipientIds = conversation.participants.filter(
      (p) => p.toString() !== req.user._id.toString(),
    );

    for (const rid of recipientIds) {
      await createNotification({
        userId: rid,
        type: "message",
        title: `New message from ${req.user.name}`,
        body: content.trim().slice(0, 100),
        link: `/messages?c=${conversation._id}`,
        metadata: { conversationId: conversation._id, senderId: req.user._id, messageId: message._id },
      });
      emitToUser(req, rid, "notification", { type: "message" });
    }

    emitToConversation(req, conversation._id, "new_message", formatMessageForUser(populated, req.user._id));

    res.status(201).json({ message: formatMessageForUser(populated, req.user._id), conversation });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createMessageRequest = async (req, res) => {
  try {
    if (req.user.role !== "patient") {
      return res.status(403).json({ message: "Only patients can request doctor messaging" });
    }

    const { receiverId, note } = req.body;
    const doctor = await User.findById(receiverId);
    if (!doctor || doctor.role !== "doctor") {
      return res.status(400).json({ message: "Invalid doctor" });
    }

    const existing = await MessageRequest.findOne({
      sender: req.user._id,
      receiver: doctor._id,
      status: { $in: ["pending", "accepted"] },
    });

    if (existing?.status === "accepted") {
      const conv = await Conversation.findById(existing.conversation);
      return res.json({ messageRequest: existing, conversation: conv, alreadyAccepted: true });
    }

    if (existing?.status === "pending") {
      const conv = await Conversation.findById(existing.conversation);
      return res.json({ messageRequest: existing, conversation: conv, alreadyPending: true });
    }

    const conversation = await getOrCreateConversation({
      patientId: req.user._id,
      providerId: doctor._id,
      providerRole: "doctor",
      type: "doctor",
      status: "pending",
      title: formatDoctorName(doctor.name),
    });

    const messageRequest = await MessageRequest.create({
      sender: req.user._id,
      receiver: doctor._id,
      status: "pending",
      conversation: conversation._id,
      note: note || "",
    });

    conversation.messageRequest = messageRequest._id;
    conversation.status = "pending";
    await conversation.save();

    await createSystemMessage(
      conversation._id,
      req.user._id,
      `${req.user.name} requested to start a conversation.`,
      "system",
    );

    await createNotification({
      userId: doctor._id,
      type: "message_request",
      title: "New message request",
      body: `${req.user.name} wants to message you`,
      link: "/doctor/dashboard",
      metadata: { messageRequestId: messageRequest._id, conversationId: conversation._id },
    });

    emitToUser(req, doctor._id, "message_request", { messageRequest });

    res.status(201).json({ messageRequest, conversation });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getMessageRequests = async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === "patient") {
      filter = { sender: req.user._id };
    } else if (req.user.role === "doctor") {
      filter = { receiver: req.user._id };
    } else {
      return res.status(403).json({ message: "Access denied" });
    }

    const { status } = req.query;
    if (status) filter.status = status;

    const requests = await MessageRequest.find(filter)
      .populate("sender", "name avatar email")
      .populate("receiver", "name avatar specialization specialty")
      .populate("conversation")
      .sort({ createdAt: -1 });

    res.json({ requests });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateMessageRequest = async (req, res) => {
  try {
    const { action } = req.body;
    const messageRequest = await MessageRequest.findById(req.params.id)
      .populate("sender", "name")
      .populate("receiver", "name");

    if (!messageRequest) return res.status(404).json({ message: "Request not found" });

    const conversation = await Conversation.findById(messageRequest.conversation);
    if (!conversation) return res.status(404).json({ message: "Conversation not found" });

    if (action === "accept" && req.user.role === "doctor" && messageRequest.receiver.equals(req.user._id)) {
      if (messageRequest.status === "accepted") {
        return res.json({ messageRequest, conversation, alreadyAccepted: true });
      }
      if (messageRequest.status !== "pending") {
        return res.status(400).json({ message: `Cannot accept request with status ${messageRequest.status}` });
      }

      messageRequest.status = "accepted";
      conversation.status = "active";
      await messageRequest.save();
      await conversation.save();

      const sysMsg = await createSystemMessage(
        conversation._id,
        req.user._id,
        "Your message request was accepted. You can now chat with your doctor.",
        "request_accepted",
      );

      await createNotification({
        userId: messageRequest.sender._id,
        type: "message_request_accepted",
        title: "Message request accepted",
        body: `${req.user.name} accepted your message request`,
        link: `/messages?c=${conversation._id}`,
        metadata: { conversationId: conversation._id },
      });

      emitToConversation(req, conversation._id, "new_message", sysMsg);
      emitToUser(req, messageRequest.sender._id, "message_request_updated", { messageRequest, conversation });

      return res.json({ messageRequest, conversation });
    }

    if (action === "decline" && req.user.role === "doctor" && messageRequest.receiver.equals(req.user._id)) {
      if (messageRequest.status === "declined") {
        return res.json({ messageRequest, conversation, alreadyDeclined: true });
      }
      if (messageRequest.status !== "pending") {
        return res.status(400).json({ message: `Cannot decline request with status ${messageRequest.status}` });
      }

      messageRequest.status = "declined";
      conversation.status = "declined";
      await messageRequest.save();
      await conversation.save();

      const sysMsg = await createSystemMessage(
        conversation._id,
        req.user._id,
        "Your message request was declined.",
        "request_declined",
      );

      await createNotification({
        userId: messageRequest.sender._id,
        type: "message_request_declined",
        title: "Message request declined",
        body: `${req.user.name} declined your message request`,
        link: `/messages?c=${conversation._id}`,
        metadata: { conversationId: conversation._id },
      });

      emitToConversation(req, conversation._id, "new_message", sysMsg);
      emitToUser(req, messageRequest.sender._id, "message_request_updated", { messageRequest, conversation });

      return res.json({ messageRequest, conversation });
    }

    if (action === "cancel" && messageRequest.sender.equals(req.user._id) && messageRequest.status === "pending") {
      messageRequest.status = "cancelled";
      conversation.status = "closed";
      await messageRequest.save();
      await conversation.save();
      return res.json({ messageRequest, conversation });
    }

    return res.status(403).json({ message: "Invalid action" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const startGeneralHelp = async (req, res) => {
  try {
    if (req.user.role !== "patient") {
      return res.status(403).json({ message: "Only patients can request general help" });
    }

    const match = await findAvailableStaff();

    if (!match) {
      const ticket = await SupportTicket.create({
        patient: req.user._id,
        subject: "24/7 General Help - No staff available",
        description: req.body.message || "Patient requested help but all specialists are busy.",
        status: "open",
      });

      return res.status(503).json({
        message: "All specialists currently assisting other patients. A support ticket has been created.",
        supportTicket: ticket,
        noStaffAvailable: true,
      });
    }

    const { staff, role } = match;
    const conversation = await getOrCreateConversation({
      patientId: req.user._id,
      providerId: staff._id,
      providerRole: role,
      type: role === "receptionist" ? "receptionist" : role === "nurse" ? "nurse" : "doctor",
      status: "active",
      title: "24/7 General Help",
    });

    const welcome = await createSystemMessage(
      conversation._id,
      staff._id,
      `You've been connected with ${staff.name} for 24/7 support.`,
      "system",
    );

    emitToConversation(req, conversation._id, "new_message", welcome);
    emitToUser(req, staff._id, "notification", { type: "message" });

    res.json({ conversation, provider: staff, connectedRole: role });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const startConversation = async (req, res) => {
  try {
    const { patientId, providerId } = req.body;

    if (req.user.role === "patient") {
      const provider = await User.findById(providerId);
      if (!provider) return res.status(400).json({ message: "Invalid provider" });

      if (provider.role === "doctor") {
        return res.status(403).json({
          message: "Please use Request Message for doctors",
          requiresRequest: true,
        });
      }

      if (!["nurse", "receptionist"].includes(provider.role)) {
        return res.status(400).json({ message: "Invalid provider" });
      }

      const conversation = await getOrCreateConversation({
        patientId: req.user._id,
        providerId,
        providerRole: provider.role,
        status: "active",
      });
      return res.json({ conversation });
    }

    if (["doctor", "nurse", "receptionist"].includes(req.user.role)) {
      const allowed = await canAccessPatient(req.user, patientId);
      if (!allowed && req.user.role !== "receptionist") {
        return res.status(403).json({ message: "Patient not assigned to you" });
      }
      const conversation = await getOrCreateConversation({
        patientId,
        providerId: req.user._id,
        providerRole: req.user.role,
        status: "active",
      });
      return res.json({ conversation });
    }

    res.status(403).json({ message: "Access denied" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateAvailability = async (req, res) => {
  try {
    const staffRoles = ["doctor", "nurse", "receptionist"];
    if (!staffRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "Only staff can update availability" });
    }

    const { availability, online } = req.body;
    const updates = {};
    if (availability) updates.availability = availability;
    if (online !== undefined) updates.online = online;

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true }).select("-password");
    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const sendQuickAction = async (req, res) => {
  try {
    if (req.user.role !== "receptionist") {
      return res.status(403).json({ message: "Only receptionists can send quick actions" });
    }

    const { conversationId, action } = req.body;
    const labels = {
      book_appointment: "📅 Book Appointment — I can help schedule your next visit.",
      reschedule: "🔄 Reschedule Appointment — Let me find a new time for you.",
      find_doctor: "🩺 Find Doctor — I'll help you find the right specialist.",
      telemedicine_help: "📹 Telemedicine Help — I can guide you through video consultations.",
      technical_help: "🔧 Technical Help — Let me assist with app or device issues.",
      general_question: "💬 General Question — How can I help you today?",
    };

    const content = labels[action];
    if (!content) return res.status(400).json({ message: "Invalid quick action" });

    req.body = { content, conversationId, type: "quick_action" };
    return sendMessage(req, res);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteMessage = async (req, res) => {
  try {
    const { mode = "me" } = req.body;
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ message: "Message not found" });

    const conversation = await Conversation.findById(message.conversation);
    if (!conversation) return res.status(404).json({ message: "Conversation not found" });

    if (!(await assertConversationAccess(conversation, req.user))) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (mode === "me") {
      if (!message.deletedFor.some((id) => id.toString() === req.user._id.toString())) {
        message.deletedFor.push(req.user._id);
        await message.save();
      }

      await deleteMessageNotifications({
        userId: req.user._id,
        messageId: message._id,
        conversationId: conversation._id,
        messageBody: message.content,
        forEveryone: false,
      });
      emitNotificationsUpdated(req, req.user._id);

      emitToConversation(req, conversation._id, "message_deleted", {
        messageId: message._id,
        mode: "me",
        userId: req.user._id,
        conversationId: conversation._id,
      });

      return res.json({ success: true, mode: "me" });
    }

    if (mode === "everyone") {
      if (!message.sender.equals(req.user._id)) {
        return res.status(403).json({ message: "Only the sender can delete for everyone" });
      }
      if (isSystemType(message.type)) {
        return res.status(403).json({ message: "System messages cannot be deleted for everyone" });
      }
      if (message.deletedForEveryone) {
        return res.json({ success: true, mode: "everyone", alreadyDeleted: true });
      }

      const age = Date.now() - new Date(message.createdAt).getTime();
      if (age > DELETE_FOR_EVERYONE_MS) {
        return res.status(403).json({ message: "Delete for everyone is only available within 1 hour" });
      }

      message.deletedForEveryone = true;
      message.deletedAt = new Date();
      await message.save();

      const populated = await Message.findById(message._id)
        .populate("sender", "name avatar role")
        .populate({
          path: "replyTo",
          select: "content sender deletedForEveryone type createdAt",
          populate: { path: "sender", select: "name avatar role" },
        });

      const formatted = formatMessageForUser(populated, req.user._id);

      await deleteMessageNotifications({
        messageId: message._id,
        conversationId: conversation._id,
        messageBody: message.content,
        forEveryone: true,
      });

      const participantIds = conversation.participants.map((p) => p.toString());
      participantIds.forEach((uid) => emitNotificationsUpdated(req, uid));

      emitToConversation(req, conversation._id, "message_deleted", {
        messageId: message._id,
        mode: "everyone",
        conversationId: conversation._id,
        message: formatted,
      });

      return res.json({ success: true, mode: "everyone", message: formatted });
    }

    return res.status(400).json({ message: 'Invalid mode. Use "me" or "everyone"' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteConversation = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) return res.status(404).json({ message: "Conversation not found" });

    if (!(await assertConversationAccess(conversation, req.user))) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!conversation.deletedFor.some((id) => id.toString() === req.user._id.toString())) {
      conversation.deletedFor.push(req.user._id);
      await conversation.save();
    }

    await deleteConversationNotifications(req.user._id, conversation._id);
    emitNotificationsUpdated(req, req.user._id);

    emitToUser(req, req.user._id, "conversation_deleted", {
      conversationId: conversation._id,
      userId: req.user._id,
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
