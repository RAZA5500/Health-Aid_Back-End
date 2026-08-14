import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    provider: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    providerRole: {
      type: String,
      enum: ["doctor", "nurse", "receptionist", "support"],
      required: true,
    },
    type: {
      type: String,
      enum: ["doctor", "nurse", "receptionist", "general-support"],
      default: "doctor",
    },
    status: {
      type: String,
      enum: ["pending", "active", "locked", "declined", "closed"],
      default: "active",
    },
    messageRequest: { type: mongoose.Schema.Types.ObjectId, ref: "MessageRequest" },
    title: { type: String, default: "" },
    lastMessage: { type: String, default: "" },
    lastMessageAt: { type: Date, default: Date.now },
    deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true },
);

conversationSchema.index({ participants: 1 });
conversationSchema.index({ patient: 1, provider: 1, type: 1 });

export default mongoose.model("Conversation", conversationSchema);
