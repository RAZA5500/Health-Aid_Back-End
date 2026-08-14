export const REFRESH_COOKIE_NAME = "refreshToken";

const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

export function getRefreshCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: TEN_DAYS_MS,
    path: "/",
  };
}

export function setRefreshTokenCookie(res, refreshToken) {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions());
}

export function clearRefreshTokenCookie(res) {
  const { maxAge: _maxAge, ...options } = getRefreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE_NAME, options);
}

export function getRefreshTokenFromRequest(req) {
  return req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken || null;
}

export function sendAuthSuccess(res, { status = 200, message, tokens, user, redirectTo, extra = {} }) {
  setRefreshTokenCookie(res, tokens.refreshToken);
  return res.status(status).json({
    message,
    token: tokens.accessToken,
    accessToken: tokens.accessToken,
    user,
    redirectTo,
    ...extra,
  });
}
