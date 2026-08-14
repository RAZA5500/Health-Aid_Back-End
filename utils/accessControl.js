import Assignment from "../models/assignment.model.js";
import Appointment from "../models/appointment.model.js";
import Notification from "../models/notification.model.js";
import Conversation from "../models/conversation.model.js";
import { doctorEmergencyFilter, patientIdMetadataFilter } from "./emergencyHelpers.js";

export async function isProviderAssignedToPatient(providerId, patientId, providerRole) {
  const assignment = await Assignment.findOne({
    provider: providerId,
    patient: patientId,
    providerRole,
    isActive: true,
  });
  return !!assignment;
}

export async function getAssignedPatientIds(providerId, providerRole) {
  const assignments = await Assignment.find({
    provider: providerId,
    providerRole,
    isActive: true,
  }).select("patient");
  return assignments.map((a) => a.patient.toString());
}

async function doctorCanAccessPatient(doctorId, patientId) {
  const pid = patientId.toString();
  const did = doctorId.toString();

  const assigned = await isProviderAssignedToPatient(did, pid, "doctor");
  if (assigned) return { allowed: true, reason: "assignment" };

  const [hasAppointment, hasEmergencyAlert, hasConversation] = await Promise.all([
    Appointment.exists({
      $or: [{ patient: pid }, { user: pid }],
      doctor: did,
    }),
    Notification.exists({
      user: did,
      ...doctorEmergencyFilter(),
      ...patientIdMetadataFilter(pid),
    }),
    Conversation.exists({
      patient: pid,
      provider: did,
      providerRole: "doctor",
      status: { $in: ["active", "pending"] },
    }),
  ]);

  if (hasAppointment) return { allowed: true, reason: "appointment" };
  if (hasEmergencyAlert) return { allowed: true, reason: "emergency_alert" };
  if (hasConversation) return { allowed: true, reason: "conversation" };
  return { allowed: false, reason: "none" };
}

export async function canAccessPatient(requester, patientId) {
  const pid = patientId.toString();
  if (requester.role === "admin") return true;
  if (requester.role === "patient" && requester._id.toString() === pid) return true;
  if (requester.role === "doctor") {
    const result = await doctorCanAccessPatient(requester._id, pid);
    return result.allowed;
  }
  if (requester.role === "nurse") {
    return isProviderAssignedToPatient(requester._id, pid, "nurse");
  }
  if (requester.role === "receptionist") {
    return true;
  }
  return false;
}
