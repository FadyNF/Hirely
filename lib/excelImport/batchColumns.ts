// Single source of truth for the batch (tabular) template's columns —
// shared by the template builder, the parser, and the export builder so all
// three agree on column order, labels, and which field each maps to.
//
// One row per employee. Scalar Employee fields get one column each.
// The one-to-many relations (experience/education/certificates/skills/
// performance) don't fit a flat row naturally, so each gets a fixed number
// of numbered "slots" — e.g. "Experience 1 - Job Title", "Experience 2 -
// Job Title" — instead of one row per entry. A blank slot (every field in
// it empty) is simply skipped; slots aren't required to be filled in order.

export interface BatchColumn {
  field: string; // Employee scalar field name
  label: string; // header text shown in the sheet
  kind: "text" | "date" | "number";
}

export const BATCH_COLUMNS: BatchColumn[] = [
  { field: "fullName", label: "Full Name", kind: "text" },
  { field: "phone", label: "Phone", kind: "text" },
  { field: "birthDate", label: "Birth Date", kind: "date" },
  { field: "nationality", label: "Nationality", kind: "text" },
  { field: "maritalStatus", label: "Marital Status", kind: "text" },
  { field: "email", label: "Email", kind: "text" },
  { field: "workLocation", label: "Department", kind: "text" },
  { field: "gender", label: "Gender", kind: "text" },
  { field: "nationalId", label: "National ID", kind: "text" },
  { field: "militaryStatus", label: "Military Status", kind: "text" },
  { field: "companyID", label: "Company ID", kind: "text" },
  { field: "hiringDate", label: "Hiring Date", kind: "date" },
  { field: "position", label: "Position", kind: "text" },
  { field: "age", label: "Age", kind: "number" },
  { field: "yearsExpPrev", label: "Years of Exp. (Prior)", kind: "number" },
  { field: "yearsExpElsewedy", label: "Years of Exp. (Elsewedy)", kind: "number" },
  { field: "totalExperience", label: "Total Experience", kind: "number" },
];

// One realistic example row, shown in the template so an admin sees the
// expected format for each column (dates, enums, etc.).
export const BATCH_EXAMPLE_ROW: Record<string, string | number> = {
  fullName: "Ahmed Ali Hassan",
  phone: "01012345678",
  birthDate: "1995-06-15",
  nationality: "Egyptian",
  maritalStatus: "Single",
  email: "ahmed.ali@elsewedy.com",
  workLocation: "Engineering",
  gender: "Male",
  nationalId: "29506151234567",
  militaryStatus: "Completed",
  companyID: "1024",
  hiringDate: "2020-09-01",
  position: "Electrical Engineer",
  age: 30,
  yearsExpPrev: 2,
  yearsExpElsewedy: 5,
  totalExperience: 7,
};

export interface BatchRelationField {
  key: string; // matches the Prisma relation model's field name exactly
  label: string;
  kind: "text" | "date" | "number";
}

export interface BatchRelationGroup {
  relationKey: "experience" | "education" | "certificates" | "skills" | "performanceReviews";
  groupLabel: string; // e.g. "Experience" -> "Experience 1", "Experience 2", ...
  slots: number; // how many numbered slots this relation gets
  fields: BatchRelationField[];
}

// Column header format for a relation field: "{groupLabel} {slot} - {field.label}"
// e.g. "Experience 1 - Job Title", "Performance 3 - Score (%)".
export const BATCH_RELATION_GROUPS: BatchRelationGroup[] = [
  {
    relationKey: "experience",
    groupLabel: "Experience",
    slots: 2,
    fields: [
      { key: "jobTitle", label: "Job Title", kind: "text" },
      { key: "company", label: "Company", kind: "text" },
      { key: "startDate", label: "Start Date", kind: "date" },
      { key: "endDate", label: "End Date (or 'Current')", kind: "date" },
      { key: "description", label: "Description", kind: "text" },
    ],
  },
  {
    relationKey: "education",
    groupLabel: "Education",
    slots: 2,
    fields: [
      { key: "degree", label: "Degree", kind: "text" },
      { key: "fieldOfStudy", label: "Field of Study", kind: "text" },
      { key: "institution", label: "Institution", kind: "text" },
      { key: "graduationYear", label: "Graduation Year", kind: "number" },
      { key: "gpa", label: "GPA", kind: "number" },
    ],
  },
  {
    relationKey: "certificates",
    groupLabel: "Certificate",
    slots: 2,
    fields: [
      { key: "certName", label: "Certificate Name", kind: "text" },
      { key: "issuer", label: "Issuer", kind: "text" },
      { key: "issueDate", label: "Issue Date", kind: "date" },
      { key: "expiryDate", label: "Expiry Date", kind: "date" },
    ],
  },
  {
    relationKey: "skills",
    groupLabel: "Skill",
    slots: 3,
    fields: [
      { key: "category", label: "Category (technical/language)", kind: "text" },
      { key: "name", label: "Skill Name", kind: "text" },
      { key: "proficiency", label: "Proficiency (0-100)", kind: "number" },
    ],
  },
  {
    relationKey: "performanceReviews",
    groupLabel: "Performance",
    // Naturally 4 — one per quarter.
    slots: 4,
    fields: [
      { key: "quarter", label: "Quarter (Q1-Q4)", kind: "text" },
      { key: "year", label: "Year", kind: "number" },
      { key: "score", label: "Score (%)", kind: "number" },
    ],
  },
];

export function relationColumnHeader(group: BatchRelationGroup, slot: number, field: BatchRelationField): string {
  return `${group.groupLabel} ${slot} - ${field.label}`;
}

// One example entry per relation, shown in slot 1 of the template's example
// row alongside BATCH_EXAMPLE_ROW.
export const BATCH_EXAMPLE_RELATIONS: Partial<Record<BatchRelationGroup["relationKey"], Record<string, string | number>>> = {
  experience: { jobTitle: "Junior Electrical Engineer", company: "ElSewedy Electric Headquarters", startDate: "2018-01-01", endDate: "2020-08-01" },
  education: { degree: "Bachelor of Engineering", fieldOfStudy: "Electrical Engineering", institution: "Cairo University", graduationYear: 2017 },
  certificates: { certName: "Project Management Professional", issuer: "PMI", issueDate: "2021-05-01" },
  skills: { category: "technical", name: "AutoCAD", proficiency: 80 },
  performanceReviews: { quarter: "Q1", year: 2023, score: 90 },
};
