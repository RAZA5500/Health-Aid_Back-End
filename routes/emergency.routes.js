import express from "express";
import { protect, authorize } from "../middleware/auth.middleware.js";
import { requireClockIn } from "../middleware/requireClockIn.js";
import {
  triggerEmergency,
  acceptEmergency,
  getPendingEmergencies,
  markEmergencySeen,
} from "../controller/emergency.controller.js";

const router = express.Router();

router.use(protect);
router.post("/trigger", triggerEmergency);
router.get("/pending", authorize("doctor"), requireClockIn, getPendingEmergencies);
router.post("/seen", authorize("doctor"), requireClockIn, markEmergencySeen);
router.post("/accept", authorize("doctor"), requireClockIn, acceptEmergency);

export default router;
