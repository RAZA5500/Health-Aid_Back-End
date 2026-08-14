import Medication from "../models/medication.model.js";

export const getMedications = async (req, res) => {
  try {
    const medications = await Medication.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(medications);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createMedication = async (req, res) => {
  try {
    const { name, dosage, timing, reminder } = req.body;
    if (!name || !dosage || !timing) {
      return res.status(400).json({ message: "Name, dosage, and timing are required" });
    }

    const medication = await Medication.create({
      user: req.user._id,
      name,
      dosage,
      timing,
      reminder,
    });

    res.status(201).json(medication);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const toggleMedication = async (req, res) => {
  try {
    const medication = await Medication.findOne({ _id: req.params.id, user: req.user._id });
    if (!medication) return res.status(404).json({ message: "Medication not found" });

    medication.taken = !medication.taken;
    await medication.save();
    res.json(medication);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteMedication = async (req, res) => {
  try {
    const medication = await Medication.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!medication) return res.status(404).json({ message: "Medication not found" });
    res.json({ message: "Medication deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
