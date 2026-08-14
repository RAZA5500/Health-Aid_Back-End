import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { requireClockIn } from "../middleware/requireClockIn.js";
import {
  getAppointments,
  createAppointment,
  deleteAppointment,
  updateAppointmentStatus,
} from "../controller/appointment.controller.js";

const router = express.Router();
router.use(protect);
router.use((req, res, next) => {
  if (["doctor", "nurse", "receptionist"].includes(req.user.role)) {
    return requireClockIn(req, res, next);
  }
  next();
});

router.get("/", getAppointments);
router.post("/", createAppointment);
router.patch("/:id/status", updateAppointmentStatus);
router.delete("/:id", deleteAppointment);

export default router;
