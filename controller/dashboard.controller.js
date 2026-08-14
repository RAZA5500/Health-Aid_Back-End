import User from "../models/user.models.js";
import Assignment from "../models/assignment.model.js";

export const getDashboard = async (req, res) => {
  try {
    const user = req.user;

    res.json({
      profile: {
        _id: user._id,
        id: user._id,
        role: user.role,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        phone: user.phone,
        dob: user.dob,
        bio: user.bio,
        gender: user.gender,
        location: user.location,
        website: user.website,
        dueDate: user.dueDate,
        lmpDate: user.lmpDate,
        emergencyContact: user.emergencyContact,
        bloodType: user.bloodType,
        specialization: user.specialization,
        licenseNumber: user.licenseNumber,
        hospital: user.hospital,
        yearsOfExperience: user.yearsOfExperience,
        department: user.department,
        nurseLicense: user.nurseLicense,
        specialty: user.specialty,
        online: user.online,
        availability: user.availability,
        clockedIn: user.clockedIn,
        clockedInAt: user.clockedInAt,
        shiftStart: user.shiftStart,
        shiftEnd: user.shiftEnd,
        preferredDoctor: user.preferredDoctor,
        isActive: user.isActive,
        createdAt: user.createdAt,
      },
      stats: {
        id: user._id,
        memberSince: user.createdAt,
        accountStatus: user.isActive ? "active" : "inactive",
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const {
      name,
      email,
      avatar,
      phone,
      dob,
      bio,
      gender,
      location,
      website,
      dueDate,
      lmpDate,
      emergencyContact,
      bloodType,
      specialization,
      hospital,
      department,
    } = req.body;
    const updates = {};

    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ message: "Name cannot be empty" });
      updates.name = name.trim();
    }

    if (email !== undefined) {
      const normalizedEmail = email.toLowerCase().trim();
      if (!normalizedEmail) return res.status(400).json({ message: "Email cannot be empty" });
      const existingUser = await User.findOne({ email: normalizedEmail, _id: { $ne: req.user._id } });
      if (existingUser) return res.status(400).json({ message: "Email already in use" });
      updates.email = normalizedEmail;
    }

    const fields = {
      avatar,
      phone,
      dob,
      bio,
      gender,
      location,
      website,
      dueDate,
      lmpDate,
      emergencyContact,
      bloodType,
      specialization,
      hospital,
      department,
    };
    for (const [key, val] of Object.entries(fields)) {
      if (val !== undefined) {
        if ((key === "dueDate" || key === "lmpDate") && val === "") {
          updates[key] = null;
        } else {
          updates[key] = val;
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    }).select("-password");

    res.json({ message: "Profile updated successfully", user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: "New password must be at least 8 characters" });
    }

    const user = await User.findById(req.user._id);
    const bcrypt = await import("bcryptjs");
    const isMatch = await bcrypt.default.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: "Current password is incorrect" });

    user.password = await bcrypt.default.hash(newPassword, 10);
    await user.save();
    res.json({ message: "Password changed successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getSettings = async (req, res) => {
  try {
    res.json({
      settings: { email: req.user.email, notifications: true, theme: "light" },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const logout = async (_req, res) => {
  res.json({ message: "Logged out successfully" });
};

export const getCareTeam = async (req, res) => {
  try {
    if (req.user.role !== "patient") {
      return res.status(403).json({ message: "Only patients have a care team" });
    }

    const assignments = await Assignment.find({ patient: req.user._id, isActive: true })
      .populate("provider", "name email avatar specialization department role")
      .sort({ createdAt: -1 });

    const providers = assignments.map((a) => ({
      ...a.provider.toObject(),
      providerRole: a.providerRole,
      assignmentId: a._id,
    }));

    res.json({ providers });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteAccount = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user._id);
    res.json({ message: "Account deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
