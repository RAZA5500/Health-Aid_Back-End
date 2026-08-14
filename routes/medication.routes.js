import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  getMedications,
  createMedication,
  toggleMedication,
  deleteMedication,
} from "../controller/medication.controller.js";

const router = express.Router();
router.use(protect);

router.get("/", getMedications);
router.post("/", createMedication);
router.patch("/:id/toggle", toggleMedication);
router.delete("/:id", deleteMedication);

export default router;
