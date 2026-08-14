import User from "../models/user.models.js";
import {
  clearRefreshTokenCookie,
  getRefreshTokenFromRequest,
  setRefreshTokenCookie,
} from "../utils/cookieHelpers.js";
import {
  issueAuthTokens,
  invalidateUserRefreshToken,
  validateStoredRefreshToken,
  verifyRefreshToken,
} from "../utils/tokenService.js";

export const refresh = async (req, res) => {
  try {
    const refreshToken = getRefreshTokenFromRequest(req);

    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh token is required" });
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }

    if (decoded.type !== "refresh") {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const user = await User.findById(decoded.id).select("+refreshTokenHash +refreshTokenExpiresAt");

    if (!user) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "Account is deactivated. Contact support." });
    }

    const valid = await validateStoredRefreshToken(user, refreshToken);
    if (!valid) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const tokens = await issueAuthTokens(user);
    setRefreshTokenCookie(res, tokens.refreshToken);

    res.json({
      message: "Token refreshed",
      accessToken: tokens.accessToken,
      token: tokens.accessToken,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const logout = async (req, res) => {
  try {
    const refreshToken = getRefreshTokenFromRequest(req);

    if (refreshToken) {
      try {
        const decoded = verifyRefreshToken(refreshToken);
        if (decoded?.id) {
          await invalidateUserRefreshToken(decoded.id);
        }
      } catch {
        // Ignore invalid refresh tokens on logout
      }
    }

    clearRefreshTokenCookie(res);
    res.json({ message: "Logged out successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
