const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email) {
  return EMAIL_REGEX.test(String(email).toLowerCase().trim());
}

export function validatePassword(password) {
  if (!password || password.length < 8) {
    return "Password must be at least 8 characters";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must contain at least one number";
  }
  return null;
}

export function validatePatientSignup(body) {
  const { name, email, password } = body;
  const errors = [];

  if (!name?.trim()) errors.push("Name is required");
  if (!email?.trim()) errors.push("Email is required");
  else if (!validateEmail(email)) errors.push("Invalid email format");
  const pwdErr = validatePassword(password);
  if (pwdErr) errors.push(pwdErr);
  if (!body.phone?.trim()) errors.push("Phone number is required");

  return errors;
}

export function validateStaffCreation(body) {
  const { name, email, password, role } = body;
  const errors = [];

  if (!name?.trim()) errors.push("Name is required");
  if (!email?.trim()) errors.push("Email is required");
  else if (!validateEmail(email)) errors.push("Invalid email format");
  const pwdErr = validatePassword(password);
  if (pwdErr) errors.push(pwdErr);

  const staffRoles = ["doctor", "nurse", "receptionist", "admin"];
  if (!staffRoles.includes(role)) errors.push("Invalid staff role");

  if (!body.phone?.trim()) errors.push("Phone number is required");

  if (role === "doctor") {
    if (!body.specialization?.trim()) errors.push("Specialization is required for doctors");
    if (!body.licenseNumber?.trim()) errors.push("License number is required for doctors");
    if (!body.hospital?.trim()) errors.push("Hospital/clinic is required for doctors");
  }

  if (role === "nurse") {
    if (!body.department?.trim()) errors.push("Department is required for nurses");
    if (!body.nurseLicense?.trim()) errors.push("Nurse license is required for nurses");
    if (!body.hospital?.trim()) errors.push("Hospital/clinic is required for nurses");
  }

  if (role === "receptionist") {
    if (!body.hospital?.trim()) errors.push("Hospital/clinic is required for receptionists");
  }

  return errors;
}

export function sanitizeUser(user) {
  const obj = user.toObject ? user.toObject() : { ...user };
  delete obj.password;
  return obj;
}
