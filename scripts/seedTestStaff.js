import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import User from "../models/user.models.js";

dotenv.config();

const DEMO_EMAILS = [
  "sarah.mitchell@healthaid.demo",
  "patricia.nurse@healthaid.demo",
  "reception@healthaid.demo",
];

const TEST_STAFF = [
  {
    name: "Dr. Ahmed Khan",
    email: "doctor@healthaid.test",
    password: "Test@123456",
    role: "doctor",
    specialization: "Obstetrics",
    specialty: "Obstetrics",
    licenseNumber: "MD-TEST-001",
    hospital: "HealthAid Medical Center",
    yearsOfExperience: 10,
    availability: "Offline",
    online: false,
    clockedIn: false,
    shiftStart: "09:00",
    shiftEnd: "17:00",
    isActive: true,
    phone: "+923001234567",
  },
  {
    name: "Nurse Fatima Ali",
    email: "nurse@healthaid.test",
    password: "Test@123456",
    role: "nurse",
    department: "Maternity",
    specialty: "Maternity",
    nurseLicense: "RN-TEST-001",
    hospital: "HealthAid Medical Center",
    availability: "Offline",
    online: false,
    clockedIn: false,
    shiftStart: "08:00",
    shiftEnd: "16:00",
    isActive: true,
    phone: "+923001234568",
  },
  {
    name: "Sara Reception",
    email: "reception@healthaid.test",
    password: "Test@123456",
    role: "receptionist",
    department: "Patient Support",
    specialty: "Patient Support",
    hospital: "HealthAid Medical Center",
    availability: "Offline",
    online: false,
    clockedIn: false,
    shiftStart: "09:00",
    shiftEnd: "18:00",
  },
];

async function removeDemoStaff() {
  const result = await User.deleteMany({ email: { $in: DEMO_EMAILS } });
  if (result.deletedCount > 0) {
    console.log(`Removed ${result.deletedCount} demo staff account(s)`);
  }
}

async function seedTestStaff() {
  for (const staff of TEST_STAFF) {
    const { password, ...fields } = staff;
    const hashPwd = await bcrypt.hash(password, 10);
    const email = staff.email.toLowerCase().trim();

    const existing = await User.findOne({ email });
    if (existing) {
      await User.updateOne(
        { email },
        {
          $set: {
            ...fields,
            email,
            password: hashPwd,
            authProvider: "local",
            providerId: "",
          },
        },
      );
      console.log(`Updated: ${staff.name} (${staff.role}) — ${staff.email}`);
      continue;
    }

    await User.create({
      ...fields,
      email,
      password: hashPwd,
      authProvider: "local",
      providerId: "",
    });
    console.log(`Created: ${staff.name} (${staff.role}) — ${staff.email}`);
  }
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set in server/.env");
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    await removeDemoStaff();
    await seedTestStaff();

    console.log("Test staff seed complete");
  } catch (err) {
    console.error("Seed failed:", err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main();
