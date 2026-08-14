import User from "../models/user.models.js";
import bcrypt from "bcryptjs";
import Assignment from "../models/assignment.model.js";
import Appointment from "../models/appointment.model.js";
import Notification from "../models/notification.model.js";
import Conversation from "../models/conversation.model.js";
import { sanitizeUser, validateStaffCreation } from "../utils/validation.js";

export const getAdminStats = async (req, res) => {
  try {
    const [totalUsers, patients, doctors, nurses, admins, activeUsers, appointments, notifications] =
      await Promise.all([
        User.countDocuments(),
        User.countDocuments({ role: "patient" }),
        User.countDocuments({ role: "doctor" }),
        User.countDocuments({ role: "nurse" }),
        User.countDocuments({ role: "admin" }),
        User.countDocuments({ isActive: true }),
        Appointment.countDocuments(),
        Notification.countDocuments(),
      ]);

    res.json({
      stats: {
        totalUsers,
        patients,
        doctors,
        nurses,
        admins,
        activeUsers,
        inactiveUsers: totalUsers - activeUsers,
        appointments,
        notifications,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const { role, search, isActive } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === "true";
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const users = await User.find(filter).select("-password").sort({ createdAt: -1 });
    res.json({ users: users.map(sanitizeUser) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const toggleUserStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: "Cannot deactivate your own account" });
    }

    user.isActive = !user.isActive;
    await user.save();
    res.json({ user: sanitizeUser(user), message: `User ${user.isActive ? "activated" : "deactivated"}` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createStaffUser = async (req, res) => {
  try {
    const errors = validateStaffCreation(req.body);
    if (errors.length) {
      return res.status(400).json({ message: errors.join(". ") });
    }

    const {
      name,
      email,
      password,
      phone,
      role,
      specialization,
      licenseNumber,
      hospital,
      yearsOfExperience,
      department,
      nurseLicense,
    } = req.body;

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({ message: "An account with this email already exists" });
    }

    const hashPwd = await bcrypt.hash(password, 10);
    const userData = {
      name: name.trim(),
      email: normalizedEmail,
      password: hashPwd,
      phone: phone.trim(),
      role,
      authProvider: "local",
    };

    if (role === "doctor") {
      userData.specialization = specialization.trim();
      userData.specialty = specialization.trim();
      userData.licenseNumber = licenseNumber.trim();
      userData.hospital = hospital.trim();
      userData.yearsOfExperience = yearsOfExperience ? Number(yearsOfExperience) : undefined;
      userData.availability = "Available";
      userData.online = true;
    }
    if (role === "nurse") {
      userData.department = department.trim();
      userData.specialty = department.trim();
      userData.nurseLicense = nurseLicense.trim();
      userData.hospital = hospital.trim();
      userData.availability = "Available";
      userData.online = true;
    }
    if (role === "receptionist") {
      userData.department = department?.trim() || "Front Desk";
      userData.specialty = "Reception";
      userData.hospital = hospital.trim();
      userData.availability = "Available";
      userData.online = true;
    }

    const user = await User.create(userData);
    res.status(201).json({ user: sanitizeUser(user), message: `${role} account created successfully` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createAssignment = async (req, res) => {
  try {
    const { providerId, patientId, providerRole } = req.body;
    if (!providerId || !patientId || !providerRole) {
      return res.status(400).json({ message: "Provider, patient, and provider role are required" });
    }

    const [provider, patient] = await Promise.all([
      User.findById(providerId),
      User.findById(patientId),
    ]);

    if (!provider || provider.role !== providerRole) {
      return res.status(400).json({ message: "Invalid provider for role" });
    }
    if (!patient || patient.role !== "patient") {
      return res.status(400).json({ message: "Invalid patient" });
    }

    const existing = await Assignment.findOne({ provider: providerId, patient: patientId, providerRole });
    if (existing) {
      existing.isActive = true;
      existing.assignedBy = req.user._id;
      await existing.save();
      return res.json({ assignment: existing, message: "Assignment reactivated" });
    }

    const assignment = await Assignment.create({
      provider: providerId,
      patient: patientId,
      providerRole,
      assignedBy: req.user._id,
    });

    res.status(201).json({ assignment, message: "Assignment created" });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Assignment already exists" });
    }
    res.status(500).json({ message: error.message });
  }
};

export const getAssignments = async (req, res) => {
  try {
    const assignments = await Assignment.find()
      .populate("provider", "name email role specialization department")
      .populate("patient", "name email phone")
      .populate("assignedBy", "name")
      .sort({ createdAt: -1 });
    res.json({ assignments });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const removeAssignment = async (req, res) => {
  try {
    const assignment = await Assignment.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true },
    );
    if (!assignment) return res.status(404).json({ message: "Assignment not found" });
    res.json({ assignment, message: "Assignment removed" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getAllAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.find()
      .populate("patient", "name email")
      .populate("doctor", "name specialization")
      .sort({ date: -1 });
    res.json({ appointments });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const adminCreateAppointment = async (req, res) => {
  try {
    const { patientId, doctorId, doctorName, specialization, date, time, notes } = req.body;
    if (!patientId || !date || !time) {
      return res.status(400).json({ message: "Patient, date, and time are required" });
    }

    const duplicate = await Appointment.findOne({ patient: patientId, date, time, status: { $ne: "cancelled" } });
    if (duplicate) {
      return res.status(400).json({ message: "Duplicate appointment at this date and time" });
    }

    let resolvedDoctorName = doctorName;
    if (doctorId) {
      const doctor = await User.findById(doctorId);
      if (doctor) resolvedDoctorName = doctor.name;
    }

    const appointment = await Appointment.create({
      user: patientId,
      patient: patientId,
      doctor: doctorId,
      doctorName: resolvedDoctorName || "TBD",
      specialization: specialization || "General",
      date,
      time,
      notes: notes || "",
    });

    res.status(201).json({ appointment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getAdminNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find()
      .populate("user", "name email role")
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ notifications });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getAdminConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find()
      .populate("patient", "name")
      .populate("provider", "name role")
      .sort({ lastMessageAt: -1 })
      .limit(50);
    res.json({ conversations });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
