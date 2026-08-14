import mongoose from "mongoose";

const healthRecordSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    recordType: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    value: { type: String, default: "" },
    unit: { type: String, default: "" },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

export default mongoose.model("HealthRecord", healthRecordSchema);
