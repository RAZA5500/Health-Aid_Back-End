import Notification from "../models/notification.model.js";

const MESSAGE_NOTIFICATION_TYPES = [
  "message",
  "message_reply",
  "message_request",
  "message_request_accepted",
  "message_request_declined",
];

export async function createNotification({ userId, type, title, body, link = "", metadata = {} }) {
  return Notification.create({
    user: userId,
    type,
    title,
    body,
    link,
    metadata,
  });
}

export async function deleteMessageNotifications({
  userId,
  messageId,
  conversationId,
  messageBody,
  forEveryone = false,
}) {
  const orConditions = [{ "metadata.messageId": messageId }];

  if (conversationId && messageBody) {
    orConditions.push({
      type: { $in: ["message", "message_reply"] },
      "metadata.conversationId": conversationId,
      body: messageBody.slice(0, 100),
    });
  }

  const query = { $or: orConditions };
  if (!forEveryone) {
    query.user = userId;
  }

  return Notification.deleteMany(query);
}

export async function deleteConversationNotifications(userId, conversationId) {
  const conversationIdStr = String(conversationId);
  return Notification.deleteMany({
    user: userId,
    $or: [
      { "metadata.conversationId": conversationId },
      { link: `/messages?c=${conversationIdStr}` },
      { link: { $regex: `${conversationIdStr}` } },
      {
        type: { $in: MESSAGE_NOTIFICATION_TYPES },
        link: { $regex: conversationIdStr },
      },
    ],
  });
}

export async function notifyUsers(userIds, payload) {
  const unique = [...new Set(userIds.map(String))];
  await Promise.all(unique.map((userId) => createNotification({ userId, ...payload })));
}

export function getRoleDashboardPath(role) {
  switch (role) {
    case "doctor":
      return "/doctor/dashboard";
    case "nurse":
      return "/nurse/dashboard";
    case "receptionist":
      return "/nurse/messages";
    case "admin":
      return "/admin/dashboard";
    default:
      return "/dashboard";
  }
}

export function patientNeedsOnboarding(user) {
  return user.role === "patient" && !user.lmpDate && !user.dueDate;
}

export function getAuthRedirectPath(user) {
  if (patientNeedsOnboarding(user)) {
    return "/onboarding/pregnancy";
  }
  return getRoleDashboardPath(user.role);
}
