import { setRefreshTokenCookie } from "../utils/cookieHelpers.js";
import {
  authenticateOAuthUser,
  isAppleConfigured,
  isGoogleConfigured,
  verifyAppleIdToken,
  verifyGoogleIdToken,
} from "../utils/oauthHelpers.js";

export const googleAuth = async (req, res) => {
  try {
    if (!isGoogleConfigured()) {
      return res.status(503).json({
        message: "Google sign-in requires GOOGLE_CLIENT_ID in server/.env",
      });
    }

    const { credential, idToken } = req.body;
    const token = credential || idToken;

    if (!token) {
      return res.status(400).json({ message: "Google credential is required" });
    }

    const profile = await verifyGoogleIdToken(token);
    const result = await authenticateOAuthUser({
      provider: "google",
      profile,
    });

    const { refreshToken, ...payload } = result;
    setRefreshTokenCookie(res, refreshToken);

    res.json({
      message: result.isNewUser ? "Account created successfully" : "Login successful",
      ...payload,
    });
  } catch (error) {
    const status = error.statusCode || (error.message.includes("not configured") ? 503 : 400);
    res.status(status).json({ message: error.message || "Google authentication failed" });
  }
};

export const appleAuth = async (req, res) => {
  try {
    if (!isAppleConfigured()) {
      return res.status(503).json({
        message: "Apple sign-in requires APPLE_CLIENT_ID in server/.env",
      });
    }

    const { idToken, identityToken, name } = req.body;
    const token = idToken || identityToken;

    if (!token) {
      return res.status(400).json({ message: "Apple identity token is required" });
    }

    const profile = await verifyAppleIdToken(token);
    const result = await authenticateOAuthUser({
      provider: "apple",
      profile,
      displayName: typeof name === "string" ? name : name?.firstName ? `${name.firstName} ${name.lastName || ""}`.trim() : "",
    });

    res.json({
      message: result.isNewUser ? "Account created successfully" : "Login successful",
      ...result,
    });
  } catch (error) {
    const status = error.statusCode || (error.message.includes("not configured") ? 503 : 400);
    res.status(status).json({ message: error.message || "Apple authentication failed" });
  }
};

export const oauthStatus = (_req, res) => {
  res.json({
    google: isGoogleConfigured(),
    apple: isAppleConfigured(),
  });
};
