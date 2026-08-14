/**
 * Manual auth refresh flow test.
 * Run: node scripts/testRefreshAuth.js
 * Requires server running on PORT (default 2000).
 */
import jwt from "jsonwebtoken";

const BASE = `http://localhost:${process.env.PORT || 2000}/api`;

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  const login = await request("/users/login", {
    method: "POST",
    body: JSON.stringify({ email: "doctor@healthaid.test", password: "Test@123456" }),
  });

  if (login.status !== 200) {
    console.error("Login failed:", login.status, login.data);
    process.exit(1);
  }

  const { accessToken, refreshToken, token } = login.data;
  if (!accessToken || !refreshToken || !token) {
    console.error("Missing tokens in login response", login.data);
    process.exit(1);
  }

  const dashboard = await request("/dashboard", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (dashboard.status !== 200) {
    console.error("Dashboard failed with access token:", dashboard.status, dashboard.data);
    process.exit(1);
  }

  const expiredAccess = jwt.sign(
    { id: login.data.user._id, role: login.data.user.role },
    process.env.JWT_SECRET || "330c6d528c67bb9c1e534f2c9e847427544f4965577999f571f2c80e70fa3b9b96bbc4ecf1ea69eaa7eb4ee6722eef7d85f8b7fedb4cc6a5ce7edcae7fcd5edd",
    { expiresIn: "-1s" },
  );

  const expiredDashboard = await request("/dashboard", {
    headers: { Authorization: `Bearer ${expiredAccess}` },
  });
  if (expiredDashboard.status !== 401) {
    console.error("Expected 401 for expired access token, got:", expiredDashboard.status);
    process.exit(1);
  }

  const refreshed = await request("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
  if (refreshed.status !== 200 || !refreshed.data.accessToken) {
    console.error("Refresh failed:", refreshed.status, refreshed.data);
    process.exit(1);
  }

  const dashboardAfterRefresh = await request("/dashboard", {
    headers: { Authorization: `Bearer ${refreshed.data.accessToken}` },
  });
  if (dashboardAfterRefresh.status !== 200) {
    console.error("Dashboard failed after refresh:", dashboardAfterRefresh.status);
    process.exit(1);
  }

  const logout = await request("/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refreshToken: refreshed.data.refreshToken }),
  });
  if (logout.status !== 200) {
    console.error("Logout failed:", logout.status, logout.data);
    process.exit(1);
  }

  const refreshAfterLogout = await request("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken: refreshed.data.refreshToken }),
  });
  if (refreshAfterLogout.status !== 401) {
    console.error("Expected 401 after logout refresh, got:", refreshAfterLogout.status);
    process.exit(1);
  }

  console.log("All refresh auth tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
