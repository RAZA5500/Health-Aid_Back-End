import mongoose from "mongoose";
import User from "../models/user.models.js";
import Appointment from "../models/appointment.model.js";
import Assignment from "../models/assignment.model.js";
import Notification from "../models/notification.model.js";
import { createNotification } from "../utils/notificationService.js";
import {
  doctorEmergencyFilter,
  metadataToAlertPayload,
  patientIdMetadataFilter,
  userRoomId,
} from "../utils/emergencyHelpers.js";

const ACTIVE_EMERGENCY_STATUSES = ["sent", "delivered", "seen"];

async function updatePatientEmergencyStatus(patientId, status, extra = {}) {
  await Notification.updateMany(
    {
      user: patientId,
      type: "health_alert",
      "metadata.emergencyKind": "patient_trigger",
      "metadata.emergencyStatus": { $nin: ["accepted", "resolved", "cancelled"] },
    },
    {
      $set: {
        "metadata.emergencyStatus": status,
        ...Object.fromEntries(
          Object.entries(extra).map(([key, value]) => [`metadata.${key}`, value]),
        ),
      },
    },
  );
}

export const triggerEmergency = async (req, res) => {
  try {
    if (req.user.role !== "patient") {
      return res.status(403).json({ message: "Only patients can trigger emergency alerts" });
    }

    const patient = await User.findById(req.user._id).select("-password");
    if (!patient) return res.status(404).json({ message: "Patient not found" });

    const appointments = await Appointment.find({
      $or: [{ patient: req.user._id }, { user: req.user._id }],
      status: "upcoming",
    })
      .populate("doctor", "name specialization phone")
      .sort({ date: 1 })
      .limit(10);

    const onDutyDoctors = await User.find({
      role: "doctor",
      clockedIn: true,
      isActive: true,
    }).select("_id name");

    const triggeredAt = new Date().toISOString();
    const alertPayload = {
      patientId: String(patient._id),
      patientName: patient.name,
      patientPhone: patient.phone || "",
      patientEmail: patient.email,
      emergencyContact: patient.emergencyContact || "",
      bloodType: patient.bloodType || "",
      dueDate: patient.dueDate || null,
      lmpDate: patient.lmpDate || null,
      appointments: appointments.map((a) => ({
        _id: String(a._id),
        doctorName: a.doctorName,
        specialization: a.specialization,
        date: a.date,
        time: a.time,
        doctor: a.doctor,
      })),
      triggeredAt,
      emergencyStatus: "sent",
    };

    const io = req.app.get("io");

    await createNotification({
      userId: patient._id,
      type: "health_alert",
      title: "Emergency alert sent",
      body:
        onDutyDoctors.length > 0
          ? `Your emergency alert was sent to ${onDutyDoctors.length} on-duty doctor(s). Status: Sent`
          : "Your emergency alert was logged. No doctors are on duty — please call emergency services. Status: Sent",
      link: "/notifications",
      metadata: {
        ...alertPayload,
        emergencyKind: "patient_trigger",
        emergencyStatus: "sent",
      },
    });

    for (const doc of onDutyDoctors) {
      const notification = await createNotification({
        userId: doc._id,
        type: "health_alert",
        title: "EMERGENCY: Patient needs help",
        body: `${patient.name} triggered an emergency alert. Phone: ${patient.phone || "Not set"}`,
        link: `/doctor/patients/${patient._id}`,
        metadata: {
          ...alertPayload,
          emergencyKind: "doctor_incoming",
          emergencyStatus: "sent",
        },
      });

      const payload = {
        ...metadataToAlertPayload(notification),
      };

      await Notification.findByIdAndUpdate(notification._id, {
        $set: { "metadata.emergencyStatus": "delivered" },
      });
      payload.emergencyStatus = "delivered";

      if (io) {
        io.to(userRoomId(doc._id)).emit("emergency_alert", payload);
      }
    }

    if (onDutyDoctors.length > 0) {
      await updatePatientEmergencyStatus(patient._id, "delivered");
    }

    res.json({
      message:
        onDutyDoctors.length > 0
          ? `Emergency alert sent to ${onDutyDoctors.length} on-duty doctor(s)`
          : "No doctors are currently on duty. Alert logged — please call emergency services.",
      doctorsNotified: onDutyDoctors.length,
      alert: { ...alertPayload, emergencyStatus: onDutyDoctors.length > 0 ? "delivered" : "sent" },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getPendingEmergencies = async (req, res) => {
  try {
    if (req.user.role !== "doctor") {
      return res.status(403).json({ message: "Only doctors can view pending emergency alerts" });
    }
    if (!req.user.clockedIn) {
      return res.json({ alerts: [] });
    }

    const notifications = await Notification.find({
      user: req.user._id,
      read: false,
      ...doctorEmergencyFilter(),
      "metadata.emergencyStatus": { $in: ACTIVE_EMERGENCY_STATUSES },
    })
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      alerts: notifications.map((n) => metadataToAlertPayload(n)),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const markEmergencySeen = async (req, res) => {
  try {
    const { notificationId } = req.body;
    if (!notificationId) {
      return res.status(400).json({ message: "Notification ID is required" });
    }

    const notification = await Notification.findOneAndUpdate(
      {
        _id: notificationId,
        user: req.user._id,
        ...doctorEmergencyFilter(),
        "metadata.emergencyStatus": { $in: ["sent", "delivered"] },
      },
      { $set: { "metadata.emergencyStatus": "seen" } },
      { new: true },
    );

    if (!notification) {
      return res.status(404).json({ message: "Emergency alert not found" });
    }

    res.json({ alert: metadataToAlertPayload(notification) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const acceptEmergency = async (req, res) => {
  try {
    const { patientId, notificationId } = req.body;
    if (!patientId) {
      return res.status(400).json({ message: "Patient ID is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(String(patientId))) {
      return res.status(400).json({ message: "Invalid patient ID" });
    }

    const patient = await User.findById(patientId);
    if (!patient || patient.role !== "patient") {
      return res.status(404).json({ message: "Patient not found" });
    }

    let alertNotification = null;

    if (notificationId) {
      alertNotification = await Notification.findOne({
        _id: notificationId,
        user: req.user._id,
        ...doctorEmergencyFilter(),
        ...patientIdMetadataFilter(patientId),
      });
    }

    if (!alertNotification) {
      alertNotification = await Notification.findOne({
        user: req.user._id,
        ...doctorEmergencyFilter(),
        ...patientIdMetadataFilter(patientId),
        "metadata.emergencyStatus": { $nin: ["accepted", "resolved", "cancelled"] },
      }).sort({ createdAt: -1 });
    }

    if (!alertNotification) {
      return res.status(403).json({ message: "No emergency alert found for this patient" });
    }

    let assignment = await Assignment.findOne({
      provider: req.user._id,
      patient: patientId,
      providerRole: "doctor",
    });

    if (assignment) {
      assignment.isActive = true;
      assignment.assignedBy = req.user._id;
      await assignment.save();
    } else {
      assignment = await Assignment.create({
        provider: req.user._id,
        patient: patientId,
        providerRole: "doctor",
        assignedBy: req.user._id,
      });
    }

    await Notification.updateMany(
      {
        user: req.user._id,
        ...doctorEmergencyFilter(),
        ...patientIdMetadataFilter(patientId),
        read: false,
      },
      {
        $set: {
          read: true,
          "metadata.emergencyStatus": "accepted",
        },
      },
    );

    await updatePatientEmergencyStatus(patientId, "accepted", {
      doctorId: String(req.user._id),
      doctorName: req.user.name,
    });

    await createNotification({
      userId: patientId,
      type: "health_alert",
      title: "Doctor responding to your emergency",
      body: `Dr. ${req.user.name} has accepted your emergency alert and is now assigned to your care. Status: Accepted`,
      link: "/messages",
      metadata: {
        emergencyKind: "patient_status",
        emergencyStatus: "accepted",
        patientId: String(patientId),
        doctorId: String(req.user._id),
        doctorName: req.user.name,
      },
    });

    const io = req.app.get("io");
    if (io) {
      io.to(userRoomId(patientId)).emit("notifications_updated", {});
    }

    res.json({
      assignment,
      message: "Emergency alert accepted. Patient assigned to you.",
    });
  } catch (error) {
    if (error.code === 11000) {
      const assignment = await Assignment.findOne({
        provider: req.user._id,
        patient: req.body.patientId,
        providerRole: "doctor",
      });
      if (assignment) {
        assignment.isActive = true;
        assignment.assignedBy = req.user._id;
        await assignment.save();
        return res.json({
          assignment,
          message: "Emergency alert accepted. Patient assigned to you.",
        });
      }
    }
    res.status(500).json({ message: error.message });
  }
};
