import express from "express";
import { signup, login, getMe } from "../controller/user.controller.js";
import { appleAuth, googleAuth, oauthStatus } from "../controller/oauth.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/auth/google", googleAuth);
router.post("/auth/apple", appleAuth);
router.get("/auth/status", oauthStatus);
router.get("/me", protect, getMe);

export default router;
