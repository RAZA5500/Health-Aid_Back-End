import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  clockIn,
  clockOut,
  getDutyStatus,
  getOnDutyDoctors,
  getDoctorAvailableSlots,
} from "../controller/staff.controller.js";

const router = express.Router();

router.use(protect);

router.get("/duty-status", getDutyStatus);
router.post("/clock-in", clockIn);
router.post("/clock-out", clockOut);
router.get("/on-duty-doctors", getOnDutyDoctors);
router.get("/doctor-slots", getDoctorAvailableSlots);

export default router;
