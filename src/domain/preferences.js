export const DEFAULT_PREFERENCES = Object.freeze({
  workspaceName: "Studio workspace",
  ownerName: "Jamie Davis",
  ownerEmail: "jamie@nexus.example",
  reportingDays: "30",
  rowsPerPage: "10",
});

export function validatePreferences(input) {
  const data = Object.fromEntries(
    Object.keys(DEFAULT_PREFERENCES).map((key) => [key, typeof input?.[key] === "string" ? input[key].trim() : ""]),
  );
  const errors = {};
  if (!data.workspaceName || data.workspaceName.length > 80)
    errors.workspaceName = "Enter a workspace name of 1–80 characters.";
  if (!data.ownerName || data.ownerName.length > 80) errors.ownerName = "Enter a name of 1–80 characters.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.ownerEmail) || data.ownerEmail.length > 254)
    errors.ownerEmail = "Enter a valid email address, up to 254 characters.";
  if (!["7", "30", "90"].includes(data.reportingDays)) errors.reportingDays = "Choose a supported reporting period.";
  if (!["10", "20", "50"].includes(data.rowsPerPage)) errors.rowsPerPage = "Choose a supported page size.";
  return { data: Object.keys(errors).length ? null : data, errors };
}

export function preferenceFingerprint(data) {
  return JSON.stringify(Object.keys(DEFAULT_PREFERENCES).map((key) => data[key]));
}

export function initials(name) {
  return name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join("")
    .toUpperCase();
}
