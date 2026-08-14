import mongoose from "mongoose";

const ROLES = ["patient", "doctor", "nurse", "receptionist", "admin"];

const AVAILABILITY = ["Available", "Busy", "Offline", "Available for Video"];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: {
      type: String,
      required: function requiredPassword() {
        return !this.authProvider || this.authProvider === "local";
      },
    },
    authProvider: {
      type: String,
      enum: ["local", "google", "apple"],
      default: "local",
    },
    providerId: { type: String, default: "" },
    role: { type: String, enum: ROLES, default: "patient", required: true },
    isActive: { type: Boolean, default: true },
    avatar: { type: String, default: "" },
    phone: { type: String, default: "" },
    dob: { type: Date },
    bio: { type: String, default: "" },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other", "Prefer not to say", ""],
      default: "",
    },
    location: { type: String, default: "" },
    website: { type: String, default: "" },
    // Patient fields
    dueDate: { type: Date },
    lmpDate: { type: Date },
    emergencyContact: { type: String, default: "" },
    bloodType: { type: String, default: "" },
    // Doctor fields
    specialization: { type: String, default: "" },
    licenseNumber: { type: String, default: "" },
    hospital: { type: String, default: "" },
    yearsOfExperience: { type: Number },
    // Nurse fields
    department: { type: String, default: "" },
    nurseLicense: { type: String, default: "" },
    // Staff availability & messaging
    specialty: { type: String, default: "" },
    online: { type: Boolean, default: false },
    availability: { type: String, enum: AVAILABILITY, default: "Offline" },
    clockedIn: { type: Boolean, default: false },
    clockedInAt: { type: Date },
    shiftStart: { type: String, default: "09:00" },
    shiftEnd: { type: String, default: "17:00" },
    // Patient preference
    preferredDoctor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // Refresh token (hashed; not returned in API responses)
    refreshTokenHash: { type: String, select: false },
    refreshTokenExpiresAt: { type: Date, select: false },
  },
  { timestamps: true },
);

userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ authProvider: 1, providerId: 1 });

const User = mongoose.model("User", userSchema);
export { ROLES, AVAILABILITY };
export default User;
