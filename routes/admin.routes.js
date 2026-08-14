import express from "express";
import { protect, authorize } from "../middleware/auth.middleware.js";
import {
  getAdminStats,
  getAllUsers,
  toggleUserStatus,
  createStaffUser,
  createAssignment,
  getAssignments,
  removeAssignment,
  getAllAppointments,
  adminCreateAppointment,
  getAdminNotifications,
  getAdminConversations,
} from "../controller/admin.controller.js";

const router = express.Router();

router.use(protect, authorize("admin"));

router.get("/stats", getAdminStats);
router.get("/users", getAllUsers);
router.post("/users", createStaffUser);
router.patch("/users/:id/toggle-status", toggleUserStatus);
router.get("/assignments", getAssignments);
router.post("/assignments", createAssignment);
router.delete("/assignments/:id", removeAssignment);
router.get("/appointments", getAllAppointments);
router.post("/appointments", adminCreateAppointment);
router.get("/notifications", getAdminNotifications);
router.get("/conversations", getAdminConversations);

export default router;
