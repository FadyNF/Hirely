// Classifies the free-text lines from the Excel "Training Historical
// Record" section. Each line is one of two shapes mixed together with no
// structural marker: a genuine formal degree (e.g. "Doctorate in Business
// Administration (DBA), Cairo University, 2027") or a professional
// certificate/training/course/award (e.g. "Corporate Governance, Risk &
// Compliance (GRC) certification"). Formatting is inconsistent enough
// (commas vs. en-dashes, year present or not) that this is a Gemini
// classification pass rather than a regex — one batch call over every
// line, not one call per line.

import { GoogleGenAI, ThinkingLevel } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} took too long (over ${ms / 1000}s) — please try again.`)), ms)
    ),
  ]);
}

const ENTRY_DELIMITER = "\n@@@ENTRY@@@\n";

const SYSTEM_INSTRUCTION = `You classify entries from an HR "Training Historical Record" list. Each entry describes either a formal academic degree, or a professional certificate/training program/course/award.
Entries are separated by the literal marker "@@@ENTRY@@@" on its own line. An entry may itself contain internal line breaks (e.g. a certificate name on one line and its issuer on the next) — that is still ONE entry, not two. Only split on the "@@@ENTRY@@@" marker, never on a plain newline inside an entry.
Use "education" ONLY for a real academic degree from a university or degree-granting institution (Doctorate, Master's/MBA, Bachelor's, an academic Diploma from a university). Use "certificate" for everything else — professional certifications, corporate training programs, short courses, awards, license-type credentials (e.g. ICDL) — even if the word "Diploma" or "Certificate" appears in a non-academic context.
Extract whatever fields you can confidently read from the entry; leave a field out entirely if the entry doesn't state it. Never invent a value that isn't in the text.
Echo the "rawText" field back EXACTLY as given, character-for-character (including any internal line breaks), so the caller can match your output to its input — do not paraphrase, translate, reformat, or split it.`;

const TRAINING_CLASSIFICATION_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      description: "One entry per input line, in the same order given.",
      items: {
        type: "object",
        properties: {
          rawText: { type: "string", description: "The exact input line this entry is for, unchanged." },
          type: {
            type: "string",
            enum: ["certificate", "education"],
          },
          certName: { type: "string", description: "type='certificate' only: the name of the certificate/training/course/award." },
          issuer: { type: "string", description: "type='certificate' only: the issuing organization, if stated." },
          issueDate: { type: "string", description: "type='certificate' only: a date or year, if stated in the text." },
          degree: { type: "string", description: "type='education' only: the degree name, e.g. \"Doctorate in Business Administration (DBA)\"." },
          fieldOfStudy: { type: "string", description: "type='education' only: the field of study, if determinable from the degree name." },
          institution: { type: "string", description: "type='education' only: the institution/university name." },
          graduationYear: { type: "integer", description: "type='education' only: the year, if stated in the text." },
        },
        required: ["rawText", "type"],
      },
    },
  },
  required: ["items"],
  propertyOrdering: ["items"],
};

export interface ClassifiedTrainingItem {
  rawText: string;
  type: "certificate" | "education";
  certName?: string;
  issuer?: string;
  issueDate?: string;
  degree?: string;
  fieldOfStudy?: string;
  institution?: string;
  graduationYear?: number;
}

export interface ClassifyTrainingResult {
  items: ClassifiedTrainingItem[];
  warnings: string[];
}

export async function classifyTrainingLines(lines: string[]): Promise<ClassifyTrainingResult> {
  const warnings: string[] = [];
  if (lines.length === 0) return { items: [], warnings };

  const joinedEntries = lines.join(ENTRY_DELIMITER);

  const response = await withTimeout(
    ai.models.generateContent({
      // Same model as the main employee extraction: this is the same
      // "many fields, real record" trust level, not the tiny single-field
      // schema Flash-Lite is used for elsewhere.
      model: "gemini-flash-latest",
      contents: `Classify each of the following ${lines.length} entries:\n\n${joinedEntries}`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: TRAINING_CLASSIFICATION_SCHEMA,
        temperature: 0.1,
        // MEDIUM, not LOW: unlike the single-field/full-record chatbot
        // calls (short, low-latency-sensitive), this is a one-shot batch
        // over up to dozens of ambiguously-formatted lines — LOW cut
        // reasoning off mid-thought on an ambiguous entry during testing
        // and leaked scratch text into a structured field instead of a
        // real value.
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
      },
    }),
    45000,
    "Training record classification"
  );

  const parsed = JSON.parse(response.text ?? "{}");
  const items: ClassifiedTrainingItem[] = Array.isArray(parsed.items) ? parsed.items : [];

  if (items.length !== lines.length) {
    warnings.push(`Expected ${lines.length} classified items back, got ${items.length}.`);
  }
  const inputSet = new Set(lines.map((l) => l.trim()));
  for (const item of items) {
    if (!inputSet.has(item.rawText?.trim())) {
      warnings.push(`Returned rawText did not match any input line: ${JSON.stringify(item.rawText)}`);
    }
  }

  return { items, warnings };
}
