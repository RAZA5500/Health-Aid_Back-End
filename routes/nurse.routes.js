import express from "express";
import { protect, authorize } from "../middleware/auth.middleware.js";
import { requireClockIn } from "../middleware/requireClockIn.js";
import {
  getNurseDashboard,
  getNursePatients,
  getPatientMonitoring,
  addHealthRecord,
  addNurseNote,
} from "../controller/nurse.controller.js";

const router = express.Router();

router.use(protect, authorize("nurse", "receptionist"), requireClockIn);

router.get("/dashboard", getNurseDashboard);
router.get("/patients", getNursePatients);
router.get("/patients/:patientId/monitoring", getPatientMonitoring);
router.post("/health-records", addHealthRecord);
router.post("/nurse-notes", addNurseNote);

export default router;
