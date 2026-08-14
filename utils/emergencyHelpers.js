import mongoose from "mongoose";

export const EMERGENCY_STATUSES = [
  "sent",
  "delivered",
  "seen",
  "accepted",
  "in_progress",
  "resolved",
  "cancelled",
];

export const DOCTOR_EMERGENCY_TITLE_PREFIX = "EMERGENCY:";

export function patientIdMetadataFilter(patientId) {
  const pid = String(patientId);
  const conditions = [{ "metadata.patientId": pid }];
  if (mongoose.Types.ObjectId.isValid(pid)) {
    conditions.push({ "metadata.patientId": new mongoose.Types.ObjectId(pid) });
  }
  return { $or: conditions };
}

export function doctorEmergencyFilter(extra = {}) {
  return {
    type: "health_alert",
    title: { $regex: /^EMERGENCY:/ },
    ...extra,
  };
}

export function userRoomId(userId) {
  return `user:${String(userId)}`;
}

export function metadataToAlertPayload(notification) {
  const meta = notification.metadata || {};
  return {
    ...meta,
    patientId: String(meta.patientId || ""),
    notificationId: String(notification._id),
    emergencyStatus: meta.emergencyStatus || "sent",
  };
}
