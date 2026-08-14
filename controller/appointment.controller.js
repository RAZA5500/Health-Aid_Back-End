import Appointment from "../models/appointment.model.js";
import { createNotification } from "../utils/notificationService.js";
import { canAccessPatient, getAssignedPatientIds } from "../utils/accessControl.js";

export const getAppointments = async (req, res) => {
  try {
    const { status } = req.query;
    let filter = {};

    if (req.user.role === "patient") {
      filter = { $or: [{ user: req.user._id }, { patient: req.user._id }] };
    } else if (req.user.role === "doctor") {
      const patientIds = await getAssignedPatientIds(req.user._id, "doctor");
      filter = {
        $or: [
          { doctor: req.user._id },
          { patient: { $in: patientIds } },
          { doctorName: req.user.name },
        ],
      };
    } else if (req.user.role === "nurse") {
      const patientIds = await getAssignedPatientIds(req.user._id, "nurse");
      filter = { patient: { $in: patientIds } };
    } else if (req.user.role === "admin") {
      filter = {};
    } else {
      filter = { user: req.user._id };
    }

    if (status) filter.status = status;

    const appointments = await Appointment.find(filter)
      .populate("patient", "name email phone")
      .populate("doctor", "name specialization")
      .sort({ date: 1 });

    res.json(appointments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createAppointment = async (req, res) => {
  try {
    const { doctorName, specialization, date, time, notes, patientId, doctorId } = req.body;

    if (!doctorName || !date || !time) {
      return res.status(400).json({ message: "Doctor name, date, and time are required" });
    }

    if (req.user.role === "patient" && !doctorId) {
      return res.status(400).json({ message: "Please select an on-duty doctor" });
    }

    const targetPatient = patientId || req.user._id;

    if (req.user.role !== "patient" && req.user.role !== "admin") {
      const allowed = await canAccessPatient(req.user, targetPatient);
      if (!allowed) return res.status(403).json({ message: "Access denied" });
    }

    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const duplicate = await Appointment.findOne({
      ...(doctorId ? { doctor: doctorId } : {}),
      date: { $gte: dayStart, $lte: dayEnd },
      time,
      status: { $ne: "cancelled" },
    });
    if (duplicate) {
      return res.status(400).json({ message: "This time slot is already booked" });
    }

    const appointment = await Appointment.create({
      user: targetPatient,
      patient: targetPatient,
      doctor: doctorId || undefined,
      doctorName,
      specialization,
      date,
      time,
      notes,
    });

    await createNotification({
      userId: targetPatient,
      type: "appointment",
      title: "Appointment scheduled",
      body: `${doctorName} on ${new Date(date).toLocaleDateString()} at ${time}`,
      link: "/appointments",
      metadata: { appointmentId: appointment._id },
    });

    if (doctorId) {
      await createNotification({
        userId: doctorId,
        type: "appointment",
        title: "New appointment assigned",
        body: `Patient appointment on ${new Date(date).toLocaleDateString()} at ${time}`,
        link: "/doctor/appointments",
        metadata: { appointmentId: appointment._id },
      });
    }

    res.status(201).json(appointment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) return res.status(404).json({ message: "Appointment not found" });

    const isOwner =
      appointment.user?.toString() === req.user._id.toString() ||
      appointment.patient?.toString() === req.user._id.toString();
    const isDoctor = appointment.doctor?.toString() === req.user._id.toString();

    if (!isOwner && !isDoctor && req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    await Appointment.findByIdAndDelete(req.params.id);
    res.json({ message: "Appointment deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateAppointmentStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!["upcoming", "past", "cancelled"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) return res.status(404).json({ message: "Appointment not found" });

    appointment.status = status;
    await appointment.save();
    res.json({ appointment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
