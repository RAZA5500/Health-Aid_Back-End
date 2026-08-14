import User from "../models/user.models.js";
import Appointment from "../models/appointment.model.js";

const STAFF_ROLES = ["doctor", "nurse", "receptionist"];

function parseTimeToMinutes(timeStr) {
  const trimmed = timeStr.trim();
  const match12 = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = parseInt(match12[2], 10);
    const meridiem = match12[3].toUpperCase();
    if (meridiem === "PM" && hours < 12) hours += 12;
    if (meridiem === "AM" && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }
  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    return parseInt(match24[1], 10) * 60 + parseInt(match24[2], 10);
  }
  return null;
}

function formatMinutesToLabel(totalMinutes) {
  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const meridiem = hours24 >= 12 ? "PM" : "AM";
  let hours12 = hours24 % 12;
  if (hours12 === 0) hours12 = 12;
  return `${hours12}:${minutes.toString().padStart(2, "0")} ${meridiem}`;
}

function generateShiftSlots(shiftStart, shiftEnd, intervalMinutes = 30) {
  const start = parseTimeToMinutes(shiftStart);
  const end = parseTimeToMinutes(shiftEnd);
  if (start == null || end == null || end <= start) return [];

  const slots = [];
  for (let m = start; m < end; m += intervalMinutes) {
    slots.push(formatMinutesToLabel(m));
  }
  return slots;
}

export const getDutyStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "clockedIn clockedInAt online availability role shiftStart shiftEnd name",
    );
    res.json({
      clockedIn: user.clockedIn,
      clockedInAt: user.clockedInAt,
      online: user.online,
      availability: user.availability,
      shiftStart: user.shiftStart,
      shiftEnd: user.shiftEnd,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const clockIn = async (req, res) => {
  try {
    if (!STAFF_ROLES.includes(req.user.role)) {
      return res.status(403).json({ message: "Only staff can clock in" });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        clockedIn: true,
        clockedInAt: new Date(),
        online: true,
        availability: "Available",
      },
      { new: true },
    ).select("-password");

    res.json({ message: "Clocked in successfully", user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const clockOut = async (req, res) => {
  try {
    if (!STAFF_ROLES.includes(req.user.role)) {
      return res.status(403).json({ message: "Only staff can clock out" });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        clockedIn: false,
        clockedInAt: null,
        online: false,
        availability: "Offline",
      },
      { new: true },
    ).select("-password");

    res.json({ message: "Clocked out successfully", user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getOnDutyDoctors = async (req, res) => {
  try {
    const doctors = await User.find({
      role: "doctor",
      isActive: true,
      clockedIn: true,
    })
      .select("name specialization specialty online availability clockedIn clockedInAt shiftStart shiftEnd avatar")
      .sort({ name: 1 });

    res.json({ doctors });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getDoctorAvailableSlots = async (req, res) => {
  try {
    const { doctorId, date } = req.query;
    if (!doctorId || !date) {
      return res.status(400).json({ message: "doctorId and date are required" });
    }

    const doctor = await User.findOne({ _id: doctorId, role: "doctor", isActive: true });
    if (!doctor) return res.status(404).json({ message: "Doctor not found" });
    if (!doctor.clockedIn) {
      return res.status(400).json({ message: "Doctor is not on duty" });
    }

    const allSlots = generateShiftSlots(doctor.shiftStart || "09:00", doctor.shiftEnd || "17:00");
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const booked = await Appointment.find({
      doctor: doctorId,
      date: { $gte: dayStart, $lte: dayEnd },
      status: { $ne: "cancelled" },
    }).select("time");

    const bookedTimes = new Set(booked.map((a) => a.time));
    const availableSlots = allSlots.filter((slot) => !bookedTimes.has(slot));

    res.json({
      doctorId,
      date,
      shiftStart: doctor.shiftStart,
      shiftEnd: doctor.shiftEnd,
      slots: availableSlots,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
