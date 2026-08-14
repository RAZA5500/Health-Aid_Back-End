import mongoose from "mongoose";

const kickSessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    kickCount: { type: Number, required: true },
    durationSeconds: { type: Number, required: true },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("KickSession", kickSessionSchema);
