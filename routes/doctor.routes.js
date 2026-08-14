import express from "express";
import { protect, authorize } from "../middleware/auth.middleware.js";
import { requireClockIn } from "../middleware/requireClockIn.js";
import {
  getDoctorDashboard,
  getDoctorPatients,
  getPatientDetail,
  addConsultationNote,
  updatePatientInfo,
} from "../controller/doctor.controller.js";

const router = express.Router();

router.use(protect, authorize("doctor"), requireClockIn);

router.get("/dashboard", getDoctorDashboard);
router.get("/patients", getDoctorPatients);
router.get("/patients/:patientId", getPatientDetail);
router.patch("/patients/:patientId", updatePatientInfo);
router.post("/consultation-notes", addConsultationNote);

export default router;
