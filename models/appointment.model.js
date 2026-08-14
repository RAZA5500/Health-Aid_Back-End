import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    doctorName: { type: String, required: true },
    specialization: { type: String, default: "Obstetrician" },
    date: { type: Date, required: true },
    time: { type: String, required: true },
    notes: { type: String, default: "" },
    status: { type: String, enum: ["upcoming", "past", "cancelled"], default: "upcoming" },
  },
  { timestamps: true },
);

appointmentSchema.index({ user: 1, date: 1, time: 1 });
appointmentSchema.index({ patient: 1, date: 1 });
appointmentSchema.index({ doctor: 1, date: 1 });

export default mongoose.model("Appointment", appointmentSchema);
