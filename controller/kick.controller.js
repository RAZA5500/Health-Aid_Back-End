import KickSession from "../models/kickSession.model.js";

export const getKickSessions = async (req, res) => {
  try {
    const sessions = await KickSession.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(20);
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createKickSession = async (req, res) => {
  try {
    const { kickCount, durationSeconds, notes } = req.body;
    if (kickCount == null || durationSeconds == null) {
      return res.status(400).json({ message: "Kick count and duration are required" });
    }

    const session = await KickSession.create({
      user: req.user._id,
      kickCount,
      durationSeconds,
      notes,
    });

    res.status(201).json(session);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
