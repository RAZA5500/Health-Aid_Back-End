import mongoose from "mongoose";

const assignmentSchema = new mongoose.Schema(
  {
    provider: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    providerRole: { type: String, enum: ["doctor", "nurse"], required: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    isActive: { type: Boolean, default: true },
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

assignmentSchema.index({ provider: 1, patient: 1, providerRole: 1 }, { unique: true });
assignmentSchema.index({ patient: 1, isActive: 1 });
assignmentSchema.index({ provider: 1, isActive: 1 });

export default mongoose.model("Assignment", assignmentSchema);
