import { OAuth2Client } from "google-auth-library";
import appleSignin from "apple-signin-auth";
import User from "../models/user.models.js";
import { sanitizeUser } from "./validation.js";
import { getAuthRedirectPath } from "./notificationService.js";
import { issueAuthTokens } from "./tokenService.js";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export function isGoogleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID);
}

export function isAppleConfigured() {
  return Boolean(process.env.APPLE_CLIENT_ID);
}

export async function verifyGoogleIdToken(idToken) {
  if (!isGoogleConfigured()) {
    throw new Error("Google OAuth is not configured on the server");
  }

  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload?.email) {
    throw new Error("Google account did not provide an email address");
  }

  return {
    email: payload.email,
    name: payload.name || payload.email.split("@")[0],
    avatar: payload.picture || "",
    providerId: payload.sub,
  };
}

export async function verifyAppleIdToken(idToken) {
  if (!isAppleConfigured()) {
    throw new Error("Apple Sign In is not configured on the server");
  }

  const payload = await appleSignin.verifyIdToken(idToken, {
    audience: process.env.APPLE_CLIENT_ID,
  });

  if (!payload?.email && !payload?.sub) {
    throw new Error("Apple account did not provide required identity information");
  }

  return {
    email: payload.email,
    name: "",
    avatar: "",
    providerId: payload.sub,
  };
}

export async function authenticateOAuthUser({ provider, profile, displayName }) {
  const normalizedEmail = profile.email?.toLowerCase().trim();
  const name = displayName?.trim() || profile.name?.trim() || normalizedEmail?.split("@")[0] || "HealthAid User";

  let user =
    (profile.providerId &&
      (await User.findOne({ authProvider: provider, providerId: profile.providerId }))) ||
    (normalizedEmail && (await User.findOne({ email: normalizedEmail })));

  let isNewUser = false;

  if (user) {
    if (!user.isActive) {
      const error = new Error("Account is deactivated. Contact support.");
      error.statusCode = 403;
      throw error;
    }

    if (user.authProvider === "local") {
      const error = new Error(
        "An account with this email already exists. Please sign in with your email and password.",
      );
      error.statusCode = 409;
      throw error;
    }

    if (user.authProvider !== provider) {
      const providerLabel = user.authProvider === "google" ? "Google" : "Apple";
      const error = new Error(`This email is linked to ${providerLabel} sign-in. Use that method instead.`);
      error.statusCode = 409;
      throw error;
    }

    let updated = false;
    if (profile.avatar && !user.avatar) {
      user.avatar = profile.avatar;
      updated = true;
    }
    if (!user.providerId && profile.providerId) {
      user.providerId = profile.providerId;
      updated = true;
    }
    if (updated) {
      await user.save();
    }
  } else {
    if (!normalizedEmail) {
      const error = new Error(
        "Apple did not share your email. Remove HealthAid from Apple ID settings and try again, or use email signup.",
      );
      error.statusCode = 400;
      throw error;
    }

    user = await User.create({
      name,
      email: normalizedEmail,
      authProvider: provider,
      providerId: profile.providerId || "",
      avatar: profile.avatar || "",
      phone: "",
      role: "patient",
    });
    isNewUser = true;
  }

  const tokens = await issueAuthTokens(user);

  return {
    token: tokens.accessToken,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: sanitizeUser(user),
    redirectTo: getAuthRedirectPath(user),
    isNewUser,
  };
}
