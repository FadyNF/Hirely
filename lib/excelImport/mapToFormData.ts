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

  // Education: the exporter writes the first entry's fieldOfStudy/year into
  // the "Graduation"/"Graduation year" basic-info cells AND (separately)
  // into the free-text training block as part of that same entry's
  // degree/institution/year line — so on import, the basic fields and the
  // first classified 'education' line describe the SAME entry, not two
  // different ones. Merge them into one rather than pushing both (which
  // used to produce two half-blank entries for what is really one degree).
  // Only stands alone if there's no classified education line at all (e.g.
  // the training block was empty or the line didn't classify).
  const education: Record<string, unknown>[] = classified.items
    .filter((item) => item.type === "education")
    .map((item) => ({
      degree: item.degree ?? "",
      fieldOfStudy: item.fieldOfStudy ?? "",
      institution: item.institution ?? "",
      graduationYear: item.graduationYear ?? "",
    }));

  if (basic.graduationField || basic.graduationYear !== undefined) {
    if (education.length > 0) {
      // Fill in whatever the free-text classification didn't already find —
      // never overwrite a value Gemini actually read from the line itself.
      if (!education[0].fieldOfStudy) education[0].fieldOfStudy = basic.graduationField ?? "";
      if (!education[0].graduationYear) education[0].graduationYear = basic.graduationYear ?? "";
    } else {
      education.push({
        degree: "",
        fieldOfStudy: basic.graduationField ?? "",
        institution: "",
        graduationYear: basic.graduationYear ?? "",
      });
    }
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
