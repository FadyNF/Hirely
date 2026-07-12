// Single source of truth for the batch (tabular) template's columns —
// shared by the template builder, the parser, and the export builder so all
// three agree on column order, labels, and which field each maps to.
//
// Batch import covers the scalar Employee fields only: one row per employee,
// one column per attribute. The one-to-many relations (experience,
// education, certificates, skills, performance) don't fit a flat row and are
// handled per-employee through the single-file flow or the chatbot instead.

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
