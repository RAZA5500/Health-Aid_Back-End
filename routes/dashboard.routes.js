import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  getDashboard,
  updateProfile,
  changePassword,
  getSettings,
  logout,
  deleteAccount,
  getCareTeam,
} from "../controller/dashboard.controller.js";

const router = express.Router();

router.use(protect);

router.get("/", getDashboard);
router.get("/care-team", getCareTeam);
router.get("/settings", getSettings);
router.patch("/profile", updateProfile);
router.patch("/password", changePassword);
router.post("/logout", logout);
router.delete("/account", deleteAccount);

export default router;
