import http from "http";
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { connectDB } from "./config/db.js";
import userRoutes from "./routes/user.routes.js";
import authRoutes from "./routes/auth.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import appointmentRoutes from "./routes/appointment.routes.js";
import medicationRoutes from "./routes/medication.routes.js";
import kickRoutes from "./routes/kick.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import messageRoutes from "./routes/message.routes.js";
import doctorRoutes from "./routes/doctor.routes.js";
import nurseRoutes from "./routes/nurse.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import healthRecordRoutes from "./routes/healthRecord.routes.js";
import consultationRoutes from "./routes/consultation.routes.js";
import staffRoutes from "./routes/staff.routes.js";
import emergencyRoutes from "./routes/emergency.routes.js";

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || "0.0.0.0";
const isProduction = process.env.NODE_ENV === "production";

function parseOrigins(value) {
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const devOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
];

const envOrigins = [
  ...(process.env.CLIENT_URL ? parseOrigins(process.env.CLIENT_URL) : []),
  ...(process.env.FRONTEND_URL ? parseOrigins(process.env.FRONTEND_URL) : []),
];

const allowedOrigins = [
  ...new Set([...envOrigins, ...(isProduction ? [] : devOrigins)]),
];

if (isProduction && allowedOrigins.length === 0) {
  console.warn(
    "Warning: CLIENT_URL (or FRONTEND_URL) is not set. CORS and Socket.IO will reject browser requests.",
  );
}

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);

app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));

const io = new Server(server, {
  cors: { origin: allowedOrigins, credentials: true },
});

app.set("io", io);

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Authentication required"));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

io.on("connection", (socket) => {
  socket.join(`user:${String(socket.userId)}`);

  socket.on("join_conversation", (conversationId) => {
    socket.join(`conversation:${conversationId}`);
  });

  socket.on("leave_conversation", (conversationId) => {
    socket.leave(`conversation:${conversationId}`);
  });
});

connectDB().catch((err) => {
  console.error("Startup DB connection failed:", err.message);
  process.exit(1);
});

app.get("/", (_req, res) => {
  res.json({ status: "ok", message: "HealthAid server is running" });
});

app.get("/api/ping", (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/medications", medicationRoutes);
app.use("/api/kicks", kickRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/consultations", consultationRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/emergency", emergencyRoutes);
app.use("/api/doctor", doctorRoutes);
app.use("/api/nurse", nurseRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/health-records", healthRecordRoutes);

server.listen(PORT, HOST, () => {
  console.log(`HealthAid server running on ${HOST}:${PORT}`);
}).on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use. Stop the other process and restart:\n` +
        `  netstat -ano | findstr :${PORT}\n` +
        `  taskkill /PID <pid> /F`,
    );
    process.exit(1);
  }
  throw err;
});

export default app;
