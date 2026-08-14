import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  getConsultations,
  getConsultation,
  requestConsultation,
  updateConsultation,
  setPreferredDoctor,
  listDoctors,
  getUpcomingConsultation,
} from "../controller/consultation.controller.js";

const router = express.Router();

router.use(protect);

router.get("/", getConsultations);
router.get("/upcoming", getUpcomingConsultation);
router.get("/doctors", listDoctors);
router.post("/preferred-doctor", setPreferredDoctor);
router.get("/:id", getConsultation);
router.post("/", requestConsultation);
router.patch("/:id", updateConsultation);

export default router;
