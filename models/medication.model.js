import mongoose from "mongoose";

const medicationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    dosage: { type: String, required: true },
    timing: { type: String, required: true },
    reminder: { type: Boolean, default: true },
    taken: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("Medication", medicationSchema);
