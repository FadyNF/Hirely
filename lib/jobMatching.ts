import { GoogleGenAI } from "@google/genai";
import { db, inClause } from "./db";

const SEMANTIC_WEIGHT = 0.7;
const BM25_WEIGHT = 0.3;

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "for", "with", "to", "of", "in", "on", "at", "is",
  "are", "we", "our", "this", "that", "from", "by", "as", "be", "it", "its", "into", "across"
]);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

type StructuredJobRequirements = {
  nationality?: string | null;
  gender?: string | null;
  totalExperience?: number | null;
  yearsExpElsewedy?: number | null;
  requiredSkills?: string[] | null;
  educationField?: string | null;
  requirementText: string;
};

const SKILLS_WEIGHT = 0.2;
const EDUCATION_WEIGHT = 0.1;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 0 && !STOPWORDS.has(word));
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0.0;
}

class BM25Okapi {
  private docTexts: string[][];
  private docLengths: number[];
  private avgDocLength: number;
  private docCount: number;
  private idf: Map<string, number> = new Map();
  private k1: number;
  private b: number;

  constructor(corpus: string[][], k1 = 1.5, b = 0.95) {
    this.docTexts = corpus;
    this.docCount = corpus.length;
    this.k1 = k1;
    this.b = b;

    this.docLengths = corpus.map((doc) => doc.length);
    const totalLength = this.docLengths.reduce((sum, len) => sum + len, 0);
    this.avgDocLength = this.docCount > 0 ? totalLength / this.docCount : 0;

    const df = new Map<string, number>();
    for (const doc of corpus) {
      const uniqueWords = new Set(doc);
      for (const word of uniqueWords) {
        df.set(word, (df.get(word) || 0) + 1);
      }
    }

    for (const [word, freq] of df.entries()) {
      this.idf.set(word, Math.log((this.docCount - freq + 0.5) / (freq + 0.5) + 1.0));
    }
  }

  public getScores(queryTerms: string[]): number[] {
    const scores = new Array(this.docCount).fill(0);

    for (let i = 0; i < this.docCount; i++) {
      const doc = this.docTexts[i];
      const docLen = this.docLengths[i];

      const tfMap = new Map<string, number>();
      for (const word of doc) {
        tfMap.set(word, (tfMap.get(word) || 0) + 1);
      }

      let docScore = 0;
      for (const term of queryTerms) {
        if (!tfMap.has(term)) continue;
        const tf = tfMap.get(term) || 0;
        const idfVal = this.idf.get(term) || 0;
        const numerator = tf * (this.k1 + 1);
        const denominator = tf + this.k1 * (1 - this.b + this.b * (docLen / this.avgDocLength));
        docScore += idfVal * (numerator / denominator);
      }
      scores[i] = docScore;
    }

    return scores;
  }
}

function buildRequirementText(requirements: StructuredJobRequirements): string {
  return requirements.requirementText.trim();
}

async function extractJobRequirements(jobDescription: string): Promise<StructuredJobRequirements> {
  if (!process.env.GEMINI_API_KEY) {
    return {
      requirementText: jobDescription.trim(),
    };
  }

  try {
    const prompt = `You are extracting a structured employee-profile requirement from a job description.
    Return valid JSON only, with this schema:
    {
      "nationality": "string (e.g., 'Egyptian', 'Jordanian') or null",
      "gender": "string ('Male' or 'Female') or null",
      "totalExperience": "number or null",
      "yearsExpElsewedy": "number or null",
      "requiredSkills": "array of short skill/tech names explicitly required (e.g. ['React', 'SQL', 'AutoCAD']) or null if none are clearly required",
      "educationField": "string naming the required field of study/degree (e.g. 'Computer Engineering', 'Mechanical Engineering') or null if none is specified",
      "requirementText": "A concise summary of the required technical skills, tech stack, and academic background. CRITICAL: DO NOT mention years of experience, nationality, or gender in this text, as they are already extracted above."
    }

    Job description:
    ${jobDescription}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const rawText = response.text?.trim() ?? "";
    const jsonText = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    const parsed = JSON.parse(jsonText) as Partial<StructuredJobRequirements>;

    const structuredData: StructuredJobRequirements = {
      nationality: parsed.nationality ?? null,
      gender: parsed.gender ?? null,
      totalExperience: parsed.totalExperience ? Number(parsed.totalExperience) : null,
      yearsExpElsewedy: parsed.yearsExpElsewedy ? Number(parsed.yearsExpElsewedy) : null,
      requiredSkills: Array.isArray(parsed.requiredSkills) && parsed.requiredSkills.length > 0
        ? parsed.requiredSkills.map((s) => String(s).trim()).filter(Boolean)
        : null,
      educationField: parsed.educationField ? String(parsed.educationField).trim() : null,
      requirementText: parsed.requirementText?.trim() || jobDescription.trim(),
    };

    return structuredData;
  } catch (error) {
    console.error("Failed to parse job requirements with Gemini", error);
    return {
      requirementText: jobDescription.trim(),
    };
  }
}

async function embedText(text: string): Promise<number[]> {
  const resp = await ai.models.embedContent({
    model: "gemini-embedding-2",
    contents: text,
  });
  return resp.embeddings?.[0]?.values ?? [];
}

function normalizeText(s: string): string {
  return s.toLowerCase().trim();
}

interface SkillMatchDetail {
  score: number;
  matched: string[];
  missing: string[];
}

// Scored (not hard-filtered) the same way BM25/semantic are — a JD's skill
// list is a preference ordering, not a strict allowlist, so a candidate
// missing one required skill is ranked lower, not excluded outright. Keeps
// the matched/missing skill names (not just the score) so the UI can show
// them as per-candidate positives/negatives.
function computeSkillMatchDetails(employeeIds: number[], requiredSkills: string[] | null | undefined): Map<number, SkillMatchDetail> {
  const details = new Map<number, SkillMatchDetail>();
  if (!requiredSkills || requiredSkills.length === 0 || employeeIds.length === 0) {
    return details;
  }

  const { sql, params } = inClause(employeeIds);
  const rows = db
    .prepare(`SELECT "employeeId", "name" FROM "Skill" WHERE "employeeId" IN ${sql}`)
    .all(...params) as { employeeId: number; name: string }[];

  const skillsByEmployee = new Map<number, string[]>();
  for (const row of rows) {
    const list = skillsByEmployee.get(row.employeeId) ?? [];
    list.push(row.name);
    skillsByEmployee.set(row.employeeId, list);
  }

  for (const employeeId of employeeIds) {
    const skills = skillsByEmployee.get(employeeId) ?? [];
    const matched: string[] = [];
    const missing: string[] = [];
    for (const required of requiredSkills) {
      const normalizedReq = normalizeText(required);
      const hit = skills.some((s) => {
        const normalizedSkill = normalizeText(s);
        return normalizedSkill.includes(normalizedReq) || normalizedReq.includes(normalizedSkill);
      });
      if (hit) matched.push(required);
      else missing.push(required);
    }
    details.set(employeeId, { score: matched.length / requiredSkills.length, matched, missing });
  }
  return details;
}

interface EducationMatchDetail {
  score: number;
  matchedField: string | null;
}

// Same scored (not hard-filtered) approach as skills above.
function computeEducationMatchDetails(employeeIds: number[], educationField: string | null | undefined): Map<number, EducationMatchDetail> {
  const details = new Map<number, EducationMatchDetail>();
  if (!educationField || employeeIds.length === 0) {
    return details;
  }

  const { sql, params } = inClause(employeeIds);
  const rows = db
    .prepare(`SELECT "employeeId", "fieldOfStudy" FROM "Education" WHERE "employeeId" IN ${sql}`)
    .all(...params) as { employeeId: number; fieldOfStudy: string }[];

  const fieldsByEmployee = new Map<number, string[]>();
  for (const row of rows) {
    const list = fieldsByEmployee.get(row.employeeId) ?? [];
    list.push(row.fieldOfStudy);
    fieldsByEmployee.set(row.employeeId, list);
  }

  const normalizedField = normalizeText(educationField);
  for (const employeeId of employeeIds) {
    const fields = fieldsByEmployee.get(employeeId) ?? [];
    const match = fields.find((f) => {
      const normalizedF = normalizeText(f);
      return normalizedF.includes(normalizedField) || normalizedField.includes(normalizedF);
    });
    details.set(employeeId, { score: match ? 1 : 0, matchedField: match ?? null });
  }
  return details;
}

// Combines each already-normalized (0-1) component score into one weighted
// score per candidate, then ranks by it directly. This is the same score
// shown to the user as "match %" — a prior version fused BM25/semantic via
// RRF (rank-based) for ranking, but computed a *separate* weighted-average
// score for display, and the two could disagree (candidate A ranked above B
// while showing a lower %) since rank position and raw score don't move
// together. Normalizing every component up front (BM25 via max-scaling,
// semantic/skills/education already 0-1) means one weighted sum can serve
// both purposes with no risk of that contradiction.
function weightedFusion(
  components: { scores: number[]; weight: number }[],
  nDocs: number
): { docIdx: number; score: number }[] {
  const fusedScores: { docIdx: number; score: number }[] = [];

  for (let docIdx = 0; docIdx < nDocs; docIdx++) {
    let score = 0;
    for (const component of components) {
      score += component.weight * component.scores[docIdx];
    }
    fusedScores.push({ docIdx, score });
  }

  return fusedScores.sort((a, b) => b.score - a.score);
}

export async function matchTopProfiles(
  jobDescription: string,
  topN?: number
) {
  const requirements = await extractJobRequirements(jobDescription);
  const searchText = buildRequirementText(requirements);

  // An admin/root's own linked Employee record is never a job-matching
  // candidate either — same live "User.id IS NULL OR User.role =
  // 'employee'" condition lib/employees.ts's company-wide queries use, not
  // duplicated through a shared helper since this query already lives on
  // its own raw-SQL path outside lib/employees.ts.
  const conditions: string[] = [`("User"."id" IS NULL OR "User"."role" = 'employee')`];
  const params: (string | number)[] = [];
  if (requirements.nationality) {
    conditions.push(`"Employee"."nationality" = ?`);
    params.push(requirements.nationality);
  }
  if (requirements.gender) {
    conditions.push(`"Employee"."gender" = ?`);
    params.push(requirements.gender);
  }
  if (requirements.totalExperience != null && !isNaN(requirements.totalExperience)) {
    conditions.push(`"Employee"."totalExperience" >= ?`);
    params.push(requirements.totalExperience);
  }
  if (requirements.yearsExpElsewedy != null && !isNaN(requirements.yearsExpElsewedy)) {
    conditions.push(`"Employee"."yearsExpElsewedy" >= ?`);
    params.push(requirements.yearsExpElsewedy);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;
  const employees = db
    .prepare(
      `SELECT "Employee"."id", "Employee"."totalExperience", "Employee"."yearsExpElsewedy"
       FROM "Employee" LEFT JOIN "User" ON "User"."id" = "Employee"."userId" ${whereClause}`
    )
    .all(...params) as { id: number; totalExperience: number | null; yearsExpElsewedy: number | null }[];

  const employeeIds = employees.map((employee) => employee.id);
  if (employeeIds.length === 0) {
    return [];
  }
  const employeeById = new Map(employees.map((e) => [e.id, e]));

  const { sql: idsSql, params: idsParams } = inClause(employeeIds);
  const dbProfiles = db.prepare(`
    SELECT "employeeId", "allexperience", "embedding"
    FROM "EmployeeEmbedding"
    WHERE "employeeId" IN ${idsSql}
  `).all(...idsParams) as {
    employeeId: number;
    allexperience: string;
    embedding: string;
  }[];

  if (!dbProfiles || dbProfiles.length === 0) {
    return [];
  }

  const profileTexts = dbProfiles.map((p) => p.allexperience || "");

  const tokenizedCorpus = profileTexts.map((txt) => tokenize(txt));
  const bm25 = new BM25Okapi(tokenizedCorpus);
  const bm25Scores = bm25.getScores(tokenize(searchText));
  const maxBm25 = Math.max(...bm25Scores, 0) || 1;
  const bm25Norms = bm25Scores.map((s) => Math.max(0, Math.min(1, s / maxBm25)));

  const queryVec = await embedText(searchText);
  const semanticScores = dbProfiles.map((profile) => {
    let profileVec: number[] = [];
    if (typeof profile.embedding === "string") {
      try {
        profileVec = JSON.parse(profile.embedding);
      } catch {
      }
    } else if (Array.isArray(profile.embedding)) {
      profileVec = profile.embedding as unknown as number[];
    }
    return cosineSimilarity(queryVec, profileVec);
  });
  const semanticNorms = semanticScores.map((s) => Math.max(0, Math.min(1, s)));

  const candidateIds = dbProfiles.map((p) => Number(p.employeeId));
  const skillMatchDetails = computeSkillMatchDetails(candidateIds, requirements.requiredSkills);
  const educationMatchDetails = computeEducationMatchDetails(candidateIds, requirements.educationField);

  const skillsWeight = skillMatchDetails.size > 0 ? SKILLS_WEIGHT : 0;
  const educationWeight = educationMatchDetails.size > 0 ? EDUCATION_WEIGHT : 0;
  const base = 1 - skillsWeight - educationWeight;
  const semanticWeightEffective = SEMANTIC_WEIGHT * base;
  const bm25WeightEffective = BM25_WEIGHT * base;

  const components: { scores: number[]; weight: number }[] = [
    { scores: semanticNorms, weight: semanticWeightEffective },
    { scores: bm25Norms, weight: bm25WeightEffective },
  ];
  if (skillsWeight > 0) {
    const skillScoresArr = candidateIds.map((id) => skillMatchDetails.get(id)?.score ?? 0);
    components.push({ scores: skillScoresArr, weight: skillsWeight });
  }
  if (educationWeight > 0) {
    const eduScoresArr = candidateIds.map((id) => educationMatchDetails.get(id)?.score ?? 0);
    components.push({ scores: eduScoresArr, weight: educationWeight });
  }

  const fused = weightedFusion(components, dbProfiles.length);

  const limit = topN ?? Math.max(1, Math.ceil(dbProfiles.length * 0.15));
  const topMatches = fused.slice(0, limit);

  return topMatches.map((match) => {
    const employeeId = Number(dbProfiles[match.docIdx].employeeId);
    const employee = employeeById.get(employeeId);
    const skillDetail = skillMatchDetails.get(employeeId);
    const eduDetail = educationMatchDetails.get(employeeId);

    const matchScore = Math.round(match.score * 100);

    const positives: string[] = [];
    const negatives: string[] = [];

    if (requirements.nationality) positives.push(`Nationality: ${requirements.nationality} (required)`);
    if (requirements.gender) positives.push(`Gender: ${requirements.gender} (required)`);
    if (requirements.totalExperience != null) {
      positives.push(`Total experience: ${employee?.totalExperience ?? "?"} yrs (≥ ${requirements.totalExperience} required)`);
    }
    if (requirements.yearsExpElsewedy != null) {
      positives.push(`ElSewedy experience: ${employee?.yearsExpElsewedy ?? "?"} yrs (≥ ${requirements.yearsExpElsewedy} required)`);
    }

    for (const skill of skillDetail?.matched ?? []) positives.push(`Has required skill: ${skill}`);
    for (const skill of skillDetail?.missing ?? []) negatives.push(`Missing required skill: ${skill}`);

    if (requirements.educationField) {
      if (eduDetail?.matchedField) {
        positives.push(`Education matches: ${eduDetail.matchedField}`);
      } else {
        negatives.push(`No degree on file in required field: ${requirements.educationField}`);
      }
    }

    return {
      employeeId,
      text: dbProfiles[match.docIdx].allexperience ?? "",
      parsedRequirements: requirements,
      matchScore,
      positives,
      negatives,
    };
  });
}