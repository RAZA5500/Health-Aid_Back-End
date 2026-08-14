import express from "express";
import { refresh, logout } from "../controller/auth.controller.js";

const router = express.Router();

router.post("/refresh", refresh);
router.post("/logout", logout);

export default router;
