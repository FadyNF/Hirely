// Maps a parsed single-employee Excel file + its classified training
// lines into the shape EmployeeForm's `initialData` prop expects. This is
// a PRE-FILL only — every entry still passes through the form's own
// validation and the admin's review before anything reaches the database.

import type { ParsedSingleEmployeeExcel } from "./singleEmployeeParser";
import type { ClassifyTrainingResult } from "./classifyTraining";

export function buildEmployeeFormInitialData(
  parsed: ParsedSingleEmployeeExcel,
  classified: ClassifyTrainingResult
): Record<string, unknown> {
  const { basic } = parsed;
  const initialData: Record<string, unknown> = {};

  // Basic Information: this template only supplies fullName and
  // Department (workLocation). Every other required field — phone,
  // birthDate, nationality, maritalStatus, email, gender, nationalId,
  // militaryStatus — has no source here and stays blank for the admin.
  if (basic.fullName) initialData.fullName = basic.fullName;
  if (basic.workLocation) initialData.workLocation = basic.workLocation;

  // Additional Info: all directly available from the header block.
  if (basic.companyID) initialData.companyID = basic.companyID;
  if (basic.hiringDate) initialData.hiringDate = basic.hiringDate;
  if (basic.position) initialData.position = basic.position;
  if (basic.age !== undefined) initialData.age = basic.age;
  if (basic.yearsExpPrev !== undefined) initialData.yearsExpPrev = basic.yearsExpPrev;
  if (basic.yearsExpElsewedy !== undefined) initialData.yearsExpElsewedy = basic.yearsExpElsewedy;
  if (basic.totalExperience !== undefined) initialData.totalExperience = basic.totalExperience;

  // Experience History table maps directly, one row per entry.
  initialData.experience = parsed.experience.map((e) => ({
    jobTitle: e.jobTitle ?? "",
    company: e.company ?? "",
    startDate: e.startDate ?? "",
    endDate: e.endDate ?? "",
  }));

  // Education: one entry from the basic "Graduation"/"Graduation year"
  // fields (degree and institution have no source in that block — left
  // blank for the admin, per the earlier "figure out later" decision),
  // plus one entry per Gemini-classified 'education' training line.
  const education: Record<string, unknown>[] = [];
  if (basic.graduationField || basic.graduationYear !== undefined) {
    education.push({
      degree: "",
      fieldOfStudy: basic.graduationField ?? "",
      institution: "",
      graduationYear: basic.graduationYear ?? "",
    });
  }
  for (const item of classified.items) {
    if (item.type !== "education") continue;
    education.push({
      degree: item.degree ?? "",
      fieldOfStudy: item.fieldOfStudy ?? "",
      institution: item.institution ?? "",
      graduationYear: item.graduationYear ?? "",
    });
  }
  initialData.education = education;

  // Certificates: one entry per Gemini-classified 'certificate' training
  // line. issuer/issueDate are required Certificate columns but weren't
  // always determinable from the raw text — left blank for the admin.
  // rawText is always kept, so the admin can check the source line.
  initialData.certificates = classified.items
    .filter((item) => item.type === "certificate")
    .map((item) => ({
      certName: item.certName ?? "",
      issuer: item.issuer ?? "",
      issueDate: item.issueDate ?? "",
      rawText: item.rawText,
    }));

  // Skills: no source anywhere in this template.
  initialData.skills = [];

  // Performance appraisal history — score arrives from the parser as a
  // fraction (0.95); EmployeeForm displays and edits it as a percentage
  // (95), converting back to a fraction itself right before submit.
  initialData.performanceReviews = parsed.performanceReviews.map((p) => ({
    quarter: p.quarter,
    year: p.year,
    score: Math.round(p.score * 100),
  }));

  return initialData;
}
