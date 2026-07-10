// lib/tabConfig.ts
//
// Single source of truth for which fields belong to which tab, and what
// counts as required vs optional. Both the Dashboard's aggregation logic
// and (later) the Records view read from this — one place to update if
// a field ever changes.

export const BASIC_INFO_FIELDS = [
  "fullName", "phone", "birthDate", "nationality", "maritalStatus",
  "email", "workLocation", "gender", "nationalId", "militaryStatus",
] as const;

export const BASIC_INFO_LABELS: Record<string, string> = {
  fullName: "Full Name", phone: "Phone", birthDate: "Birth Date",
  nationality: "Nationality", maritalStatus: "Marital Status", email: "Email",
  // Underlying field is still `workLocation` (no schema change) — relabeled
  // "Department" since Elsewedy is one company, so "where do they work"
  // doesn't apply the way "which department" does.
  workLocation: "Department", gender: "Gender", nationalId: "National ID",
  militaryStatus: "Military Status",
};

// Fields a new-hire record shouldn't be created without. The chatbot
// walks through these ONE AT A TIME if they're missing — see
// app/api/chatbot/extract/route.ts. Order here is the order they get
// asked in.
export const CREATE_REQUIRED_FIELDS = [...BASIC_INFO_FIELDS];

export interface MultiTabConfig {
  key: "experience" | "education" | "certificates";
  label: string;
  requiredFields: string[];
  optionalFields: string[];
  fieldLabels: Record<string, string>;
}

export const MULTI_TAB_CONFIG: MultiTabConfig[] = [
  {
    key: "experience",
    label: "Experience",
    requiredFields: ["jobTitle", "company", "startDate", "endDate", "description"],
    optionalFields: [],
    fieldLabels: {
      jobTitle: "Job Title", company: "Company", startDate: "Start Date",
      endDate: "End Date", description: "Description",
    },
  },
  {
    key: "education",
    label: "Education",
    requiredFields: ["degree", "fieldOfStudy", "institution", "graduationYear"],
    optionalFields: ["gpa"],
    fieldLabels: {
      degree: "Degree", fieldOfStudy: "Field of Study", institution: "Institution",
      graduationYear: "Graduation Year", gpa: "GPA",
    },
  },
  {
    key: "certificates",
    label: "Certificates",
    requiredFields: ["certName", "issuer", "issueDate"],
    optionalFields: ["expiryDate"],
    fieldLabels: {
      certName: "Certification Name", issuer: "Issuing Organization",
      issueDate: "Issue Date", expiryDate: "Expiry Date",
    },
  },
];

export const SKILL_CATEGORIES = [
  { key: "technical", label: "Technical Skills" },
  { key: "language", label: "Language" },
] as const;