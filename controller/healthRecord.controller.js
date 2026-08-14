import HealthRecord from "../models/healthRecord.model.js";
import { canAccessPatient } from "../utils/accessControl.js";

export const getHealthRecords = async (req, res) => {
  try {
    let patientId = req.user._id;
    if (req.query.patientId && req.user.role !== "patient") {
      const allowed = await canAccessPatient(req.user, req.query.patientId);
      if (!allowed) return res.status(403).json({ message: "Access denied" });
      patientId = req.query.patientId;
    }

    const records = await HealthRecord.find({ patient: patientId })
      .populate("recordedBy", "name role")
      .sort({ createdAt: -1 });

    res.json(records);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createHealthRecord = async (req, res) => {
  try {
    const { recordType, title, description, value, unit } = req.body;
    if (!recordType || !title) {
      return res.status(400).json({ message: "Record type and title are required" });
    }

    const record = await HealthRecord.create({
      patient: req.user._id,
      recordType,
      title,
      description: description || "",
      value: value || "",
      unit: unit || "",
      recordedBy: req.user._id,
    });

    res.status(201).json(record);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
