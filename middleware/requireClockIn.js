const STAFF_ROLES = ["doctor", "nurse", "receptionist"];

export const requireClockIn = (req, res, next) => {
  if (!STAFF_ROLES.includes(req.user.role)) return next();
  if (!req.user.clockedIn) {
    return res.status(403).json({ message: "You must clock in before performing this action" });
  }
  next();
};
