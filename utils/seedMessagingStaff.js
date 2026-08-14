import User from "../models/user.models.js";

export async function findAvailableStaff() {
  const availableFilter = {
    isActive: true,
    availability: { $in: ["Available", "Available for Video"] },
    online: true,
  };

  const doctor = await User.findOne({ role: "doctor", ...availableFilter }).sort({ updatedAt: -1 });
  if (doctor) return { staff: doctor, role: "doctor" };

  const nurse = await User.findOne({ role: "nurse", ...availableFilter }).sort({ updatedAt: -1 });
  if (nurse) return { staff: nurse, role: "nurse" };

  const receptionist = await User.findOne({ role: "receptionist", ...availableFilter }).sort({
    updatedAt: -1,
  });
  if (receptionist) return { staff: receptionist, role: "receptionist" };

  return null;
}

export function mapProviderRole(role) {
  if (role === "receptionist") return "receptionist";
  if (role === "nurse") return "nurse";
  if (role === "doctor") return "doctor";
  return "support";
}

export function mapConversationType(role) {
  if (role === "receptionist") return "receptionist";
  if (role === "nurse") return "nurse";
  if (role === "doctor") return "doctor";
  return "general-support";
}

export async function getOrCreateConversation({
  patientId,
  providerId,
  providerRole,
  type,
  status = "active",
  messageRequestId,
  title = "",
}) {
  const Conversation = (await import("../models/conversation.model.js")).default;
  const convType = type || mapConversationType(providerRole);
  let conversation = await Conversation.findOne({
    patient: patientId,
    provider: providerId,
    type: convType,
  });

  if (!conversation) {
    conversation = await Conversation.create({
      participants: [patientId, providerId],
      patient: patientId,
      provider: providerId,
      providerRole: mapProviderRole(providerRole),
      type: convType,
      status,
      messageRequest: messageRequestId,
      title,
    });
  }

  return conversation;
}
