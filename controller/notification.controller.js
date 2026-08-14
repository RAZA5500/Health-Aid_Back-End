import Notification from "../models/notification.model.js";

export const getNotifications = async (req, res) => {
  try {
    const { limit = 20, page = 1 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [notifications, unreadCount, total] = await Promise.all([
      Notification.find({ user: req.user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Notification.countDocuments({ user: req.user._id, read: false }),
      Notification.countDocuments({ user: req.user._id }),
    ]);

    res.json({ notifications, unreadCount, total });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { read: true },
      { new: true },
    );
    if (!notification) return res.status(404).json({ message: "Notification not found" });
    const unreadCount = await Notification.countDocuments({ user: req.user._id, read: false });
    res.json({ notification, unreadCount });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
    res.json({ message: "All notifications marked as read", unreadCount: 0 });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getUnreadCount = async (req, res) => {
  try {
    const unreadCount = await Notification.countDocuments({ user: req.user._id, read: false });
    res.json({ unreadCount });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

function emitNotificationsUpdated(req, userId) {
  const io = req.app.get("io");
  if (!io) return;
  Notification.countDocuments({ user: userId, read: false }).then((unreadCount) => {
    io.to(`user:${userId}`).emit("notifications_updated", { unreadCount });
  });
}

export const deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!notification) return res.status(404).json({ message: "Notification not found" });

    const unreadCount = await Notification.countDocuments({ user: req.user._id, read: false });
    emitNotificationsUpdated(req, req.user._id);
    res.json({ message: "Notification deleted", unreadCount });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteAllNotifications = async (req, res) => {
  try {
    const result = await Notification.deleteMany({ user: req.user._id });
    emitNotificationsUpdated(req, req.user._id);
    res.json({
      message: "All notifications deleted",
      deletedCount: result.deletedCount,
      unreadCount: 0,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
