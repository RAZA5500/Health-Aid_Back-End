import User from "../models/user.models.js";
import Appointment from "../models/appointment.model.js";
import HealthRecord from "../models/healthRecord.model.js";
import Notification from "../models/notification.model.js";
import Message from "../models/message.model.js";
import { getAssignedPatientIds, canAccessPatient } from "../utils/accessControl.js";
import { sanitizeUser } from "../utils/validation.js";
import { createNotification } from "../utils/notificationService.js";

export const getNurseDashboard = async (req, res) => {
  try {
    const patientIds = await getAssignedPatientIds(req.user._id, "nurse");

    const [patients, appointments, unreadMessages, notifications] = await Promise.all([
      User.find({ _id: { $in: patientIds }, role: "patient" }).select("-password"),
      Appointment.find({ patient: { $in: patientIds }, status: "upcoming" })
        .populate("patient", "name")
        .sort({ date: 1 })
        .limit(10),
      Message.countDocuments({
        sender: { $in: patientIds },
        readBy: { $ne: req.user._id },
      }),
      Notification.countDocuments({ user: req.user._id, read: false }),
    ]);

    res.json({
      stats: {
        assignedPatients: patients.length,
        upcomingAppointments: appointments.length,
        unreadMessages,
        unreadNotifications: notifications,
      },
      patients: patients.map(sanitizeUser),
      appointments,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getNursePatients = async (req, res) => {
  try {
    const patientIds = await getAssignedPatientIds(req.user._id, "nurse");
    const patients = await User.find({ _id: { $in: patientIds }, role: "patient" }).select("-password");
    res.json({ patients: patients.map(sanitizeUser) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getPatientMonitoring = async (req, res) => {
  try {
    const allowed = await canAccessPatient(req.user, req.params.patientId);
    if (!allowed) return res.status(403).json({ message: "Access denied" });

    const patient = await User.findById(req.params.patientId).select("-password");
    if (!patient) return res.status(404).json({ message: "Patient not found" });

    const healthRecords = await HealthRecord.find({ patient: patient._id })
      .populate("recordedBy", "name role")
      .sort({ createdAt: -1 });

    res.json({ patient: sanitizeUser(patient), healthRecords });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const addHealthRecord = async (req, res) => {
  try {
    const { patientId, recordType, title, description, value, unit } = req.body;
    if (!patientId || !recordType || !title) {
      return res.status(400).json({ message: "Patient, record type, and title are required" });
    }

    const allowed = await canAccessPatient(req.user, patientId);
    if (!allowed || req.user.role !== "nurse") {
      return res.status(403).json({ message: "Access denied" });
    }

    const record = await HealthRecord.create({
      patient: patientId,
      recordType,
      title,
      description: description || "",
      value: value || "",
      unit: unit || "",
      recordedBy: req.user._id,
    });

    await createNotification({
      userId: patientId,
      type: "health_alert",
      title: "Health record updated",
      body: `${title} was recorded by ${req.user.name}`,
      link: "/records",
      metadata: { recordId: record._id },
    });

    res.status(201).json({ record });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const addNurseNote = async (req, res) => {
  try {
    const { patientId, notes } = req.body;
    if (!patientId || !notes?.trim()) {
      return res.status(400).json({ message: "Patient and notes are required" });
    }

    const allowed = await canAccessPatient(req.user, patientId);
    if (!allowed || req.user.role !== "nurse") {
      return res.status(403).json({ message: "Access denied" });
    }

    const record = await HealthRecord.create({
      patient: patientId,
      recordType: "nurse_note",
      title: "Nursing Note",
      description: notes.trim(),
      recordedBy: req.user._id,
    });

    res.status(201).json({ record });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
