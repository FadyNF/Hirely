// lib/gemini.ts
//
// Wraps the Gemini call we already proved works in Postman. Field names
// here are deliberately kept identical to lib/tabConfig.ts and the Prisma
// schema, so the same word ("workLocation", "graduationYear") means the
// same thing everywhere in the app — one shape, three places it's used.

import { GoogleGenAI, ThinkingLevel } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Free-tier Gemini traffic gets deprioritized under load — response time
// genuinely varies from ~1s to several minutes, which is real, not a bug
// we can fix. What WAS a bug: we had no timeout of our own, so a slow
// call just sat there until Node's underlying HTTP library gave up at
// its own default of 5 MINUTES. This wrapper fails fast and honestly
// instead. One real limitation, stated plainly: this stops US from
// waiting any longer — it does NOT cancel the underlying network
// request, which keeps running in the background regardless. Good
// enough for a project at this stage; a production system would need
// an actual AbortController wired through the fetch call itself.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} took too long (over ${ms / 1000}s) — please try again.`)), ms)
    ),
  ]);
}

// The model only fills in fields it actually finds — nothing is
// "required" except intent, so a message that only mentions a phone
// number returns ONLY a phone number, not invented values for
// everything else. This is what makes our "never blank out unmentioned
// fields" merge rule possible downstream.
// The system instruction is the "job briefing" — separate from the
// schema, which is just the "form." The schema controls OUTPUT SHAPE;
// this controls JUDGMENT: what the bot is for, and what it must refuse.
const SYSTEM_INSTRUCTION = `You are Hirely's internal employee-data assistant, used only by HR administrators.
Your ONLY capabilities are: (1) creating new employee records, (2) updating existing employee records, and (3) answering lookup questions about existing employees (e.g. "is there an employee named X", "who is employee #5", "does Y work here").
You must NEVER answer general knowledge questions, hold casual conversation, or discuss anything unrelated to employee records. If asked something outside this scope, set intent to "unspecified" and leave every other field empty.
IMPORTANT — identifying WHO a message is about is a SEPARATE concern from what VALUES are being set. If the admin refers to someone mentioned earlier in the conversation (e.g. "his", "her", "that employee", "him"), infer their identity from the conversation history and put it in identifierHint — even if this message doesn't restate their name. Never use a field like fullName to identify who the message is about; fullName is only ever the NEW VALUE being provided or changed.
Always respond only through the structured schema provided — never in free-form prose.`;

const EMPLOYEE_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: ["create", "update", "delete", "read", "unspecified"],
      description: "What the admin is trying to do. Use 'read' for questions about existing employees (checking if someone exists, or asking for their details) — this does NOT modify anything.",
    },
    identifierHint: {
      type: "string",
      description: "WHO the message is about — an employee ID, National ID, or full name. If the admin uses a pronoun or reference to someone from earlier in the conversation ('his', 'her', 'that employee'), infer who they mean from the conversation history and put that person's name here, even if this exact message doesn't restate it.",
    },
    requestedFields: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "fullName", "phone", "birthDate", "nationality", "maritalStatus",
          "email", "workLocation", "gender", "nationalId", "militaryStatus",
          "experience", "education", "certificates", "skills",
        ],
      },
      description: "ONLY for intent 'read': which specific field(s) the admin is asking about, e.g. \"what is her military status\" -> [\"militaryStatus\"], \"what's his phone and email\" -> [\"phone\", \"email\"]. Leave this EMPTY if they're asking to see the employee's whole record/profile rather than one or two specific fields (e.g. \"tell me about Sara\", \"show me Ahmed's info\", \"is there an employee named X\").",
    },
    fullName: { type: "string", description: "ONLY the employee's full name when it is being PROVIDED or CHANGED — e.g. creating a new employee, or a rename such as \"change his name to Ahmed Ali\" / \"rename her to Sara Adel\" -> fullName: \"Ahmed Ali\" / \"Sara Adel\". A rename ALWAYS goes here, never into workLocation or any other field. Never use this to identify who the message is about — use identifierHint for that." },
    phone: { type: "string", description: "A phone number, digits only (e.g. 01012345678). Never an email address." },
    birthDate: { type: "string", description: "Date of birth, format YYYY-MM-DD." },
    nationality: { type: "string", description: "The employee's nationality, e.g. Egyptian. Not a location or an address." },
    maritalStatus: { type: "string", description: "One of: Single, Married, Divorced, Widowed." },
    email: { type: "string", description: "An email address, must contain '@' (e.g. name@company.com). Never a phone number." },
    workLocation: { type: "string", description: "The employee's department or team within the company — e.g. \"Engineering\", \"Finance\", \"HR\". Elsewedy is one company, so this is NOT a city or office location. Only set this when the message is actually about which department they're in. Never put a person's name here." },
    gender: { type: "string", description: "One of: Male, Female." },
    nationalId: { type: "string", description: "A national ID number, digits only." },
    militaryStatus: { type: "string", description: "One of: Exempted, Completed, Postponed, Not Applicable." },
    experience: {
      type: "array",
      description: "The employee's work history. Create ONE separate array entry per distinct job/role mentioned — if the admin lists three jobs, this array must have three objects, never one merged entry combining them.",
      items: {
        type: "object",
        properties: {
          jobTitle: { type: "string", description: "The job title for THIS one role only — never merge titles from other roles." },
          company: { type: "string", description: "The employer for THIS one role only." },
          startDate: { type: "string", description: "When this specific role started." },
          endDate: { type: "string", description: "When this specific role ended — use \"Current\" if it's their current role." },
          description: { type: "string", description: "A short summary of THIS one role's responsibilities only — never other roles' details." },
        },
      },
    },
    education: {
      type: "array",
      description: "The employee's education history. Create ONE separate array entry per distinct degree/program mentioned — never merge multiple degrees into one entry.",
      items: {
        type: "object",
        properties: {
          degree: { type: "string", description: "The degree for THIS one program only." },
          fieldOfStudy: { type: "string", description: "The field of study for THIS one program only." },
          institution: { type: "string", description: "The institution for THIS one program only." },
          graduationYear: { type: "integer" },
          gpa: { type: "number", description: "Optional. Accepts any of: a 0-4.0 scale, a 0.7-4.0 German scale, or a 0-100 percentage grade." },
        },
      },
    },
    certificates: {
      type: "array",
      description: "The employee's certifications. Create ONE separate array entry per distinct certificate mentioned — never merge multiple certificates into one entry.",
      items: {
        type: "object",
        properties: {
          certName: { type: "string", description: "The name of THIS one certificate only." },
          issuer: { type: "string", description: "The issuing organization for THIS one certificate only." },
          issueDate: { type: "string" },
          expiryDate: { type: "string" },
        },
      },
    },
    skills: {
      type: "array",
      description: "The employee's skills. Create ONE separate array entry per distinct skill mentioned — never merge multiple skills into one entry.",
      items: {
        type: "object",
        properties: {
          category: { type: "string", enum: ["technical", "language"] },
          name: { type: "string", description: "The name of THIS one skill only." },
          proficiency: { type: "integer" },
        },
      },
    },
  },
  required: ["intent"],
  // Pins the model's generation order to match the field descriptions
  // above — without this, Gemini is otherwise free to reorder properties
  // internally, which is exactly the kind of nondeterminism that let a
  // rename value ("fady fouad") drift into workLocation instead of
  // fullName in testing.
  propertyOrdering: [
    "intent", "identifierHint", "requestedFields", "fullName", "phone",
    "birthDate", "nationality", "maritalStatus", "email", "workLocation",
    "gender", "nationalId", "militaryStatus", "experience", "education",
    "certificates", "skills",
  ],
};

export interface ExtractedEmployeeData {
  intent: "create" | "update" | "delete" | "read" | "unspecified";
  identifierHint?: string;
  requestedFields?: string[];
  fullName?: string;
  phone?: string;
  birthDate?: string;
  nationality?: string;
  maritalStatus?: string;
  email?: string;
  workLocation?: string;
  gender?: string;
  nationalId?: string;
  militaryStatus?: string;
  experience?: { jobTitle?: string; company?: string; startDate?: string; endDate?: string; description?: string }[];
  education?: { degree?: string; fieldOfStudy?: string; institution?: string; graduationYear?: number; gpa?: number }[];
  certificates?: { certName?: string; issuer?: string; issueDate?: string; expiryDate?: string }[];
  skills?: { category?: "technical" | "language"; name?: string; proficiency?: number }[];
}

// A single prior turn in the conversation, in Gemini's native multi-turn
// shape — this is the real fix for "no memory": we now send the actual
// conversation, not one isolated string per call.
export interface ChatTurn {
  role: "user" | "model";
  text: string;
}

// Shared by extractEmployeeData and extractSelfServiceEmployeeData — same
// schema, same model/config, the only thing that ever differs between the
// admin and self-service assistants is the system instruction (i.e. WHO
// the model should assume it's talking about), never the output shape.
async function runEmployeeExtraction(
  message: string,
  history: ChatTurn[],
  systemInstruction: string
): Promise<ExtractedEmployeeData> {
  const contents = [
    ...history.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
    { role: "user", parts: [{ text: message }] },
  ];

  const response = await withTimeout(
    ai.models.generateContent({
      // Flash-Lite proved unreliable on our REAL schema size (it correctly
      // extracted a 3-field test schema, but misfiled email→phone once
      // experience/education/certificates/skills were added back in).
      // Full Flash's extra internal reasoning step is worth the token cost
      // here, since this writes to a real employee record.
      model: "gemini-flash-latest",
      contents,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: EMPLOYEE_EXTRACTION_SCHEMA,
        // Near-zero temperature: this is a mechanical extraction task, not
        // creative writing, so we want the SAME input to reliably produce
        // the SAME output — not a slightly different answer each time.
        temperature: 0.1,
        // THIS is the actual fix for the multi-minute latency spikes.
        // gemini-3.5-flash "thinks" (invisible internal reasoning) by
        // default, and defaults to "medium" effort when unconfigured —
        // on every call, even trivial ones, and Google's own docs
        // confirm this can't be fully disabled on Gemini 3 Flash. "low"
        // is the minimum available: the model mostly skips thinking
        // unless something genuinely seems to need it, which should
        // still be enough to avoid reintroducing the phone/email
        // misclassification bug that full thinking originally fixed.
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW, },
      },
    }),
    25000,
    "Employee data extraction"
  );

  // response.text is a JSON STRING (guaranteed to match our schema),
  // not yet a real object — this is the one JSON.parse we need.
  return JSON.parse(response.text ?? "{}");
}

export async function extractEmployeeData(
  message: string,
  history: ChatTurn[] = []
): Promise<ExtractedEmployeeData> {
  return runEmployeeExtraction(message, history, SYSTEM_INSTRUCTION);
}

// The self-service assistant's system instruction is written from a
// completely different vantage point than the admin one above: the admin
// instruction only ever describes THIRD-PARTY lookups ("is there an
// employee named X", "who is employee #5") and has no concept of a
// first-person question. Reusing it verbatim for the employee-scoped
// assistant was the real reason "do I have any certificates?" fell
// through to intent: "unspecified" instead of being recognized as a read
// question — the model genuinely didn't know who "I" was allowed to mean.
function selfServiceSystemInstruction(ownerName: string): string {
  const who = ownerName?.trim() ? ownerName.trim() : "the employee chatting with you";
  return `You are Hirely's self-service employee assistant. You are talking directly to ONE specific employee — ${who} — and every message is from and about THEM, never anyone else.
Your ONLY capabilities are: (1) answering questions about THEIR OWN record (e.g. "what's my phone number", "do I have any certificates", "what's my department"), and (2) updating THEIR OWN record (e.g. "update my phone to...", "add a certificate for...").
Treat first-person pronouns ("I", "me", "my", "mine") as always referring to this one employee — there is no ambiguity about who "I" means, it is always them. A first-person question about their own data is intent "read"; do not classify it as "unspecified" just because no name or ID was mentioned — none is needed, since it's always about them.
If the message instead asks about or tries to change a DIFFERENT, explicitly named person, still extract identifierHint with that other person's name/ID exactly as given — do not refuse, soften, or leave it blank. A separate access-control check elsewhere is responsible for rejecting that; your only job here is accurate extraction of what was actually said.
Never answer general knowledge questions or discuss anything unrelated to this employee's own HR record. If asked something genuinely outside this scope (not about them, not about another named person, not employee-record-related at all), set intent to "unspecified" and leave every other field empty.
Always respond only through the structured schema provided — never in free-form prose.`;
}

export async function extractSelfServiceEmployeeData(
  message: string,
  history: ChatTurn[] = [],
  ownerName: string = ""
): Promise<ExtractedEmployeeData> {
  return runEmployeeExtraction(message, history, selfServiceSystemInstruction(ownerName));
}

// Per-field descriptions, reused both in the big schema above (implicitly,
// via the same wording) and here for one-field-at-a-time questions.
const FIELD_DESCRIPTIONS: Record<string, string> = {
  fullName: "The employee's full personal name.",
  phone: "A phone number, digits only (e.g. 01012345678). Never an email address.",
  birthDate: "Date of birth, format YYYY-MM-DD.",
  nationality: "A nationality, e.g. Egyptian.",
  maritalStatus: "One of: Single, Married, Divorced, Widowed.",
  email: "A company email address ending in @elsewedy.com. Never a phone number.",
  workLocation: "The employee's department or team, e.g. Engineering, Finance, HR — not a city or office.",
  gender: "One of: Male, Female.",
  nationalId: "A national ID number, digits only.",
  militaryStatus: "One of: Exempted, Completed, Postponed, Not Applicable.",
};

// A deliberately TINY schema — just one property — for the one-by-one
// collection flow. This is the direct, proven fix from our earlier bug:
// a smaller schema is a dramatically more reliable schema.
export async function extractSingleField(field: string, message: string): Promise<string | null> {
  const response = await withTimeout(
    ai.models.generateContent({
      // Unlike extractEmployeeData's ~20-field schema, this one has a
      // SINGLE property — exactly the size Flash-Lite already proved
      // reliable at, back when we isolated the phone/email bug to schema
      // SIZE, not the model itself. Flash's free-tier daily quota is a
      // scarce 20 requests; Flash-Lite's is roughly 1,500 — and this
      // function fires once per question in the one-by-one flow, so it's
      // the highest-volume call in the whole chatbot.
      model: "gemini-flash-lite-latest",
      contents: `The admin was asked to provide the employee's ${field}. Their reply: "${message}"`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            value: { type: "string", description: FIELD_DESCRIPTIONS[field] ?? "The requested value." },
          },
        },
        temperature: 0.1,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW, },
      },
    }),
    15000,
    "Field lookup"
  );

  const parsed = JSON.parse(response.text ?? "{}");
  return typeof parsed.value === "string" && parsed.value.trim().length > 0 ? parsed.value.trim() : null;
}

// ---------------------------------------------------------------------------
// Certificate upload — the first multimodal (image/PDF) call in this
// codebase. Every other Gemini call here sends text-only `contents`; this
// one sends an `inlineData` part (base64 file bytes) alongside a plain
// text instruction, in the same `parts` array shape already used above.
// ---------------------------------------------------------------------------

export interface ExtractedCertificateData {
  certName?: string;
  issuer?: string;
  issueDate?: string;
  expiryDate?: string;
}

const CERTIFICATE_SYSTEM_INSTRUCTION = `You are reading an uploaded image or PDF of a professional certificate/certification document. Extract only what is actually printed on the document — never invent or guess a value that isn't visibly present. Leave a field out entirely if the document doesn't state it.`;

const CERTIFICATE_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    certName: { type: "string", description: "The name/title of the certificate or certification exactly as printed on the document." },
    issuer: { type: "string", description: "The issuing organization or institution." },
    issueDate: { type: "string", description: "The date the certificate was issued. Format YYYY-MM-DD if a full date is determinable, otherwise whatever precision the document actually gives." },
    expiryDate: { type: "string", description: "The expiry / valid-until date, only if the document states one." },
  },
};

export async function extractCertificateFromFile(fileBuffer: Buffer, mimeType: string): Promise<ExtractedCertificateData> {
  const response = await withTimeout(
    ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: fileBuffer.toString("base64") } },
            { text: "Extract the certificate's name, issuer, issue date, and expiry date (if present) from this document." },
          ],
        },
      ],
      config: {
        systemInstruction: CERTIFICATE_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: CERTIFICATE_EXTRACTION_SCHEMA,
        temperature: 0.1,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    }),
    30000,
    "Certificate extraction"
  );

  return JSON.parse(response.text ?? "{}");
}