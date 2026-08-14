import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { getHealthRecords, createHealthRecord } from "../controller/healthRecord.controller.js";

const router = express.Router();
router.use(protect);

router.get("/", getHealthRecords);
router.post("/", createHealthRecord);

export default router;
