import mongoose from "mongoose";

const messageRequestSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined", "cancelled"],
      default: "pending",
    },
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation" },
    note: { type: String, default: "" },
  },
  { timestamps: true },
);

messageRequestSchema.index({ sender: 1, receiver: 1, status: 1 });

export default mongoose.model("MessageRequest", messageRequestSchema);
