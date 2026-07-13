import { GoogleGenAI } from "@google/genai";
import { prisma } from "./prisma";

const SEMANTIC_WEIGHT = 0.7;
const BM25_WEIGHT = 0.3;
const RRF_K = 30;

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "for", "with", "to", "of", "in", "on", "at", "is",
  "are", "we", "our", "this", "that", "from", "by", "as", "be", "it", "its", "into", "across"
]);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

  bm25Ranking.forEach((docIdx, rank) => bm25RankOf.set(docIdx, rank));
  semanticRanking.forEach((docIdx, rank) => semRankOf.set(docIdx, rank));

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
  const dbProfiles = await prisma.$queryRaw<
    { employeeId: bigint | number; allexperience: string; embedding: string }[]
  >`
    SELECT "employeeId", "allexperience", "embedding"
    FROM "EmployeeEmbedding"
  `;

  if (!dbProfiles || dbProfiles.length === 0) {
    return [];
  }

  const profileTexts = dbProfiles.map((p) => p.allexperience || "");

  const tokenizedCorpus = profileTexts.map((txt) => tokenize(txt));
  const bm25 = new BM25Okapi(tokenizedCorpus);
  const bm25Scores = bm25.getScores(tokenize(jobDescription));
  const bm25Ranking = getSortedIndices(bm25Scores);

  const queryVec = await embedText(jobDescription);
  const semanticScores = dbProfiles.map((profile) => {
    let profileVec: number[] = [];
    if (typeof profile.embedding === "string") {
      try { profileVec = JSON.parse(profile.embedding); } catch { /* empty */ }
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
    text: dbProfiles[match.docIdx].allexperience,
  }));
}
