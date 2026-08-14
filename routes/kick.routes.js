import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { getKickSessions, createKickSession } from "../controller/kick.controller.js";

const router = express.Router();
router.use(protect);

router.get("/", getKickSessions);
router.post("/", createKickSession);

export default router;
