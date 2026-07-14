import { GoogleGenAI } from "@google/genai";
import { Prisma } from "./generated/prisma/client";
import { prisma } from "./prisma";

const SEMANTIC_WEIGHT = 0.7;
const BM25_WEIGHT = 0.3;
const RRF_K = 30;

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
  requirementText: string;
};

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
      requirementText: parsed.requirementText?.trim() || jobDescription.trim(),
    };

    // Prints the extracted requirements object with syntax coloring in Node's terminal
    console.log("\n\x1b[36m=== Extracted Requirements from Gemini ===\x1b[0m");
    console.dir(structuredData, { depth: null, colors: true });
    console.log("\x1b[36m==========================================\x1b[0m\n");

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

function getSortedIndices(scores: number[]): number[] {
  return scores
    .map((score, index) => ({ score, index }))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.index);
}

function rrfFusion(
  bm25Ranking: number[],
  semanticRanking: number[],
  nDocs: number
): { docIdx: number; score: number }[] {
  const bm25RankOf = new Map<number, number>();
  const semRankOf = new Map<number, number>();

  bm25Ranking.forEach((docIdx, rank) => bm25RankOf.set(docIdx, rank + 1));
  semanticRanking.forEach((docIdx, rank) => semRankOf.set(docIdx, rank + 1));

  const fusedScores: { docIdx: number; score: number }[] = [];

  for (let docIdx = 0; docIdx < nDocs; docIdx++) {
    const bm25R = bm25RankOf.get(docIdx) ?? nDocs;
    const semR = semRankOf.get(docIdx) ?? nDocs;
    const score =
      SEMANTIC_WEIGHT / (RRF_K + semR) + BM25_WEIGHT / (RRF_K + bm25R);
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

  const where: Prisma.EmployeeWhereInput = {};
  if (requirements.nationality) {
    where.nationality = { equals: requirements.nationality };
  }
  if (requirements.gender) {
    where.gender = { equals: requirements.gender };
  }
  if (requirements.totalExperience !== null && !isNaN(requirements.totalExperience)) {
    where.totalExperience = { gte: requirements.totalExperience };
  }
  if (requirements.yearsExpElsewedy !== null && !isNaN(requirements.yearsExpElsewedy)) {
    where.yearsExpElsewedy = { gte: requirements.yearsExpElsewedy };
  }

  const employees = await prisma.employee.findMany({
    where,
    select: { id: true },
  });

  const employeeIds = employees.map((employee) => employee.id);
  if (employeeIds.length === 0) {
    return [];
  }

  const dbProfiles = await prisma.employeeEmbedding.findMany({
    where: { 
      employeeId: { in: employeeIds } 
    },
    select: { 
      employeeId: true,
      allexperience: true, 
      embedding: true 
    }
  });

  if (!dbProfiles || dbProfiles.length === 0) {
    return [];
  }

  const profileTexts = dbProfiles.map((p) => p.allexperience || "");

  const tokenizedCorpus = profileTexts.map((txt) => tokenize(txt));
  const bm25 = new BM25Okapi(tokenizedCorpus);
  const bm25Scores = bm25.getScores(tokenize(searchText));
  const bm25Ranking = getSortedIndices(bm25Scores);

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
  const semanticRanking = getSortedIndices(semanticScores);

  const fused = rrfFusion(bm25Ranking, semanticRanking, dbProfiles.length);

  const limit = topN ?? Math.max(1, Math.ceil(dbProfiles.length * 0.15));
  const topMatches = fused.slice(0, limit);

  return topMatches.map((match) => ({
    employeeId: Number(dbProfiles[match.docIdx].employeeId),
    text: dbProfiles[match.docIdx].allexperience ?? "",
    parsedRequirements: requirements,
  }));
}