import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import User from "../models/user.models.js";

const ACCESS_EXPIRES = process.env.JWT_EXPIRES_IN || "15m";
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || "10d";

function getRefreshSecret() {
  return process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
}

export function generateAccessToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: ACCESS_EXPIRES,
  });
}

export function generateRefreshToken(user) {
  return jwt.sign({ id: user._id, type: "refresh" }, getRefreshSecret(), {
    expiresIn: REFRESH_EXPIRES,
  });
}

export async function hashRefreshToken(token) {
  return bcrypt.hash(token, 10);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, getRefreshSecret());
}

export async function storeRefreshToken(userId, refreshToken) {
  const hash = await hashRefreshToken(refreshToken);
  const decoded = jwt.decode(refreshToken);
  const expiresAt = decoded?.exp
    ? new Date(decoded.exp * 1000)
    : new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

  await User.findByIdAndUpdate(userId, {
    refreshTokenHash: hash,
    refreshTokenExpiresAt: expiresAt,
  });
}

export async function issueAuthTokens(user) {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  await storeRefreshToken(user._id, refreshToken);
  return { accessToken, refreshToken, token: accessToken };
}

export async function invalidateUserRefreshToken(userId) {
  await User.findByIdAndUpdate(userId, {
    $unset: { refreshTokenHash: "", refreshTokenExpiresAt: "" },
  });
}

export async function validateStoredRefreshToken(user, refreshToken) {
  if (!user.refreshTokenHash || !user.refreshTokenExpiresAt) {
    return false;
  }
  if (user.refreshTokenExpiresAt < new Date()) {
    return false;
  }
  return bcrypt.compare(refreshToken, user.refreshTokenHash);
}
