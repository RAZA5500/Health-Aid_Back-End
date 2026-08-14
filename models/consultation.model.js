import mongoose from "mongoose";

const consultationSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation" },
    status: {
      type: String,
      enum: [
        "requested",
        "pending",
        "accepted",
        "scheduled",
        "waiting",
        "active",
        "completed",
        "cancelled",
      ],
      default: "requested",
    },
    scheduledAt: { type: Date },
    startedAt: { type: Date },
    endedAt: { type: Date },
    reason: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

consultationSchema.index({ patient: 1, status: 1 });
consultationSchema.index({ doctor: 1, status: 1 });

export default mongoose.model("Consultation", consultationSchema);
