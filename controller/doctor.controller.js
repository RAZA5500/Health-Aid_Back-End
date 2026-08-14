import User from "../models/user.models.js";
import Assignment from "../models/assignment.model.js";
import Appointment from "../models/appointment.model.js";
import ConsultationNote from "../models/consultationNote.model.js";
import Notification from "../models/notification.model.js";
import MessageRequest from "../models/messageRequest.model.js";
import Consultation from "../models/consultation.model.js";
import Message from "../models/message.model.js";
import { getAssignedPatientIds, canAccessPatient } from "../utils/accessControl.js";
import { sanitizeUser } from "../utils/validation.js";

export const getDoctorDashboard = async (req, res) => {
  try {
    const patientIds = await getAssignedPatientIds(req.user._id, "doctor");

    const [patients, appointments, unreadMessages, notifications, pendingRequests, upcomingConsultations] =
      await Promise.all([
      User.find({ _id: { $in: patientIds }, role: "patient" }).select("-password"),
      Appointment.find({
        $or: [{ doctor: req.user._id }, { doctorName: req.user.name }],
        status: "upcoming",
      })
        .populate("patient", "name email phone")
        .sort({ date: 1 })
        .limit(10),
      Message.countDocuments({
        sender: { $in: patientIds },
        readBy: { $ne: req.user._id },
      }),
      Notification.countDocuments({ user: req.user._id, read: false }),
      MessageRequest.find({ receiver: req.user._id, status: "pending" })
        .populate("sender", "name avatar email")
        .sort({ createdAt: -1 })
        .limit(10),
      Consultation.find({
        doctor: req.user._id,
        status: { $in: ["requested", "pending", "accepted", "scheduled", "waiting", "active"] },
      })
        .populate("patient", "name avatar")
        .sort({ scheduledAt: 1, createdAt: -1 })
        .limit(5),
    ]);

    res.json({
      stats: {
        assignedPatients: patients.length,
        upcomingAppointments: appointments.length,
        unreadMessages,
        unreadNotifications: notifications,
        pendingMessageRequests: pendingRequests.length,
      },
      patients: patients.map(sanitizeUser),
      appointments,
      messageRequests: pendingRequests,
      consultations: upcomingConsultations,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getDoctorPatients = async (req, res) => {
  try {
    const patientIds = await getAssignedPatientIds(req.user._id, "doctor");
    const patients = await User.find({ _id: { $in: patientIds }, role: "patient" }).select("-password");
    res.json({ patients: patients.map(sanitizeUser) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getPatientDetail = async (req, res) => {
  try {
    const patientId = req.params.patientId;
    const allowed = await canAccessPatient(req.user, patientId);
    if (!allowed) return res.status(403).json({ message: "Access denied" });

    const patient = await User.findById(patientId).select("-password");
    if (!patient || patient.role !== "patient") {
      return res.status(404).json({ message: "Patient not found" });
    }

    const [appointments, consultationNotes] = await Promise.all([
      Appointment.find({ patient: patient._id }).sort({ date: -1 }).limit(20),
      ConsultationNote.find({ patient: patient._id, doctor: req.user._id }).sort({ createdAt: -1 }),
    ]);

    res.json({ patient: sanitizeUser(patient), appointments, consultationNotes });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const addConsultationNote = async (req, res) => {
  try {
    const { patientId, notes, diagnosis, prescription, followUpDate, appointmentId } = req.body;
    if (!patientId || !notes?.trim()) {
      return res.status(400).json({ message: "Patient and notes are required" });
    }

    const allowed = await canAccessPatient(req.user, patientId);
    if (!allowed || req.user.role !== "doctor") {
      return res.status(403).json({ message: "Access denied" });
    }

    const note = await ConsultationNote.create({
      patient: patientId,
      doctor: req.user._id,
      appointment: appointmentId,
      notes: notes.trim(),
      diagnosis: diagnosis || "",
      prescription: prescription || "",
      followUpDate,
    });

    res.status(201).json({ note });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updatePatientInfo = async (req, res) => {
  try {
    const allowed = await canAccessPatient(req.user, req.params.patientId);
    if (!allowed || req.user.role !== "doctor") {
      return res.status(403).json({ message: "Access denied" });
    }

    const allowedFields = ["phone", "emergencyContact", "bloodType", "bio", "dueDate", "lmpDate"];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    const patient = await User.findOneAndUpdate(
      { _id: req.params.patientId, role: "patient" },
      updates,
      { new: true, runValidators: true },
    ).select("-password");

    if (!patient) return res.status(404).json({ message: "Patient not found" });
    res.json({ patient: sanitizeUser(patient) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
