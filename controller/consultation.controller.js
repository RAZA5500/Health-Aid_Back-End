import Consultation from "../models/consultation.model.js";
import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";
import User from "../models/user.models.js";
import { createNotification } from "../utils/notificationService.js";
import { getOrCreateConversation } from "../utils/seedMessagingStaff.js";

function emitToUser(req, userId, event, data) {
  const io = req.app.get("io");
  if (io) io.to(`user:${userId}`).emit(event, data);
}

export const getConsultations = async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === "patient") filter.patient = req.user._id;
    else if (req.user.role === "doctor") filter.doctor = req.user._id;
    else return res.status(403).json({ message: "Access denied" });

    const consultations = await Consultation.find(filter)
      .populate("patient", "name avatar email")
      .populate("doctor", "name avatar specialization specialty availability online")
      .sort({ updatedAt: -1 });

    res.json({ consultations });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getConsultation = async (req, res) => {
  try {
    const consultation = await Consultation.findById(req.params.id)
      .populate("patient", "name avatar")
      .populate("doctor", "name avatar specialization specialty availability online");

    if (!consultation) return res.status(404).json({ message: "Consultation not found" });

    const isPatient = consultation.patient._id.equals(req.user._id);
    const isDoctor = consultation.doctor._id.equals(req.user._id);
    if (!isPatient && !isDoctor && req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    res.json({ consultation });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const requestConsultation = async (req, res) => {
  try {
    if (req.user.role !== "patient") {
      return res.status(403).json({ message: "Only patients can request consultations" });
    }

    const { doctorId, reason, scheduledAt } = req.body;
    let doctor;

    if (doctorId) {
      doctor = await User.findById(doctorId);
    } else if (req.user.preferredDoctor) {
      doctor = await User.findById(req.user.preferredDoctor);
    } else {
      doctor = await User.findOne({ role: "doctor", isActive: true }).sort({ name: 1 });
    }

    if (!doctor || doctor.role !== "doctor") {
      return res.status(400).json({ message: "No doctor available" });
    }

    const existing = await Consultation.findOne({
      patient: req.user._id,
      doctor: doctor._id,
      status: { $in: ["requested", "pending", "accepted", "scheduled", "waiting", "active"] },
    })
      .populate("doctor", "name avatar specialization specialty availability online")
      .populate("patient", "name avatar");

    if (existing) {
      return res.status(200).json({ consultation: existing, existing: true });
    }

    const consultation = await Consultation.create({
      patient: req.user._id,
      doctor: doctor._id,
      status: scheduledAt ? "scheduled" : "requested",
      reason: reason || "",
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
    });

    const conversation = await getOrCreateConversation({
      patientId: req.user._id,
      providerId: doctor._id,
      providerRole: "doctor",
      type: "doctor",
      status: "active",
      title: "Video Consultation",
    });

    consultation.conversation = conversation._id;
    await consultation.save();

    await Message.create({
      conversation: conversation._id,
      sender: req.user._id,
      content: `Video consultation requested${reason ? `: ${reason}` : "."}`,
      type: "consultation",
      readBy: [req.user._id],
    });

    await createNotification({
      userId: doctor._id,
      type: "consultation",
      title: "New video consultation request",
      body: `${req.user.name} requested a video consultation`,
      link: "/doctor/dashboard",
      metadata: { consultationId: consultation._id },
    });

    emitToUser(req, doctor._id, "consultation_update", { consultation });

    const populated = await Consultation.findById(consultation._id)
      .populate("doctor", "name avatar specialization specialty availability online");

    res.status(201).json({ consultation: populated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateConsultation = async (req, res) => {
  try {
    const { action, scheduledAt, notes } = req.body;
    const consultation = await Consultation.findById(req.params.id);
    if (!consultation) return res.status(404).json({ message: "Consultation not found" });

    const isPatient = consultation.patient.equals(req.user._id);
    const isDoctor = consultation.doctor.equals(req.user._id);

    const transitions = {
      accept: { from: ["requested", "pending"], to: "accepted", role: "doctor" },
      schedule: { from: ["accepted", "requested"], to: "scheduled", role: "doctor" },
      join_waiting: { from: ["scheduled", "accepted"], to: "waiting", role: "patient" },
      start: { from: ["waiting", "scheduled"], to: "active", role: "doctor" },
      complete: { from: ["active", "waiting"], to: "completed", role: "doctor" },
      cancel: { from: ["requested", "pending", "accepted", "scheduled", "waiting"], to: "cancelled", role: "both" },
    };

    const rule = transitions[action];
    if (!rule) return res.status(400).json({ message: "Invalid action" });

    if (rule.role === "doctor" && !isDoctor) return res.status(403).json({ message: "Access denied" });
    if (rule.role === "patient" && !isPatient) return res.status(403).json({ message: "Access denied" });
    if (rule.role === "both" && !isPatient && !isDoctor) return res.status(403).json({ message: "Access denied" });

    if (!rule.from.includes(consultation.status)) {
      return res.status(400).json({ message: `Cannot ${action} from status ${consultation.status}` });
    }

    consultation.status = rule.to;
    if (scheduledAt) consultation.scheduledAt = new Date(scheduledAt);
    if (notes) consultation.notes = notes;
    if (action === "start") consultation.startedAt = new Date();
    if (action === "complete") consultation.endedAt = new Date();
    await consultation.save();

    if (consultation.conversation) {
      const statusMessages = {
        accepted: "Video consultation accepted by doctor.",
        scheduled: "Video consultation scheduled.",
        waiting: "Patient entered the waiting room.",
        active: "Video consultation is now active.",
        completed: "Video consultation completed.",
        cancelled: "Video consultation cancelled.",
      };
      await Message.create({
        conversation: consultation.conversation,
        sender: req.user._id,
        content: statusMessages[rule.to] || `Consultation status: ${rule.to}`,
        type: "consultation",
        readBy: [req.user._id],
      });
    }

    const otherId = isPatient ? consultation.doctor : consultation.patient;
    emitToUser(req, otherId, "consultation_update", { consultation });

    const populated = await Consultation.findById(consultation._id)
      .populate("patient", "name avatar")
      .populate("doctor", "name avatar specialization specialty availability online");

    res.json({ consultation: populated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const setPreferredDoctor = async (req, res) => {
  try {
    if (req.user.role !== "patient") {
      return res.status(403).json({ message: "Only patients can set preferred doctor" });
    }

    const { doctorId } = req.body;
    const doctor = await User.findById(doctorId);
    if (!doctor || doctor.role !== "doctor") {
      return res.status(400).json({ message: "Invalid doctor" });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { preferredDoctor: doctor._id },
      { new: true },
    ).select("-password");

    res.json({ user, doctor, note: "Message request approval still required to chat" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const listDoctors = async (req, res) => {
  try {
    const doctors = await User.find({ role: "doctor", isActive: true })
      .select("name avatar specialization specialty availability online hospital")
      .sort({ name: 1 });
    res.json({ doctors });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getUpcomingConsultation = async (req, res) => {
  try {
    let filter = { status: { $in: ["requested", "pending", "accepted", "scheduled", "waiting", "active"] } };

    if (req.user.role === "patient") filter.patient = req.user._id;
    else if (req.user.role === "doctor") filter.doctor = req.user._id;
    else return res.status(403).json({ message: "Access denied" });

    const consultation = await Consultation.findOne(filter)
      .populate("patient", "name avatar")
      .populate("doctor", "name avatar specialization specialty availability online hospital")
      .sort({ scheduledAt: 1, createdAt: -1 });

    res.json({ consultation });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
