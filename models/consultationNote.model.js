import mongoose from "mongoose";

const consultationNoteSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment" },
    notes: { type: String, required: true },
    diagnosis: { type: String, default: "" },
    prescription: { type: String, default: "" },
    followUpDate: { type: Date },
  },
  { timestamps: true },
);

export default mongoose.model("ConsultationNote", consultationNoteSchema);
