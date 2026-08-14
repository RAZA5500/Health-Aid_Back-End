import User from "../models/user.models.js";
import bcrypt from "bcryptjs";
import { validatePatientSignup, sanitizeUser } from "../utils/validation.js";
import { getAuthRedirectPath } from "../utils/notificationService.js";
import { sendAuthSuccess } from "../utils/cookieHelpers.js";
import { issueAuthTokens } from "../utils/tokenService.js";

export const signup = async (req, res) => {
  try {
    if (req.body.role && req.body.role !== "patient") {
      return res.status(403).json({
        message: "Public signup is for patients only. Staff accounts are created by an admin.",
      });
    }

    const errors = validatePatientSignup(req.body);
    if (errors.length) {
      return res.status(400).json({ message: errors.join(". ") });
    }

    const { name, email, password, phone } = req.body;

    const normalizedEmail = email.toLowerCase().trim();
    const existUser = await User.findOne({ email: normalizedEmail });
    if (existUser) {
      return res.status(400).json({ message: "An account with this email already exists" });
    }

    const hashPwd = await bcrypt.hash(password, 10);

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashPwd,
      phone: phone?.trim() || "",
      role: "patient",
      authProvider: "local",
    });

    const tokens = await issueAuthTokens(user);

    sendAuthSuccess(res, {
      status: 201,
      message: "Account created successfully",
      tokens,
      user: sanitizeUser(user),
      redirectTo: getAuthRedirectPath(user),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "Account is deactivated. Contact support." });
    }

    if (user.authProvider && user.authProvider !== "local") {
      const providerLabel = user.authProvider === "google" ? "Google" : "Apple";
      return res.status(400).json({
        message: `This account uses ${providerLabel} sign-in. Please use "Continue with ${providerLabel}" instead.`,
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const tokens = await issueAuthTokens(user);

    sendAuthSuccess(res, {
      message: "Login successful",
      tokens,
      user: sanitizeUser(user),
      redirectTo: getAuthRedirectPath(user),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getMe = async (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
};
