# Foundry

An internal HR tool for Elsewedy Electric that validates and manages employee data. It's built to visually and structurally match the company's real internal product ("Radar.ai" / Wedy.AI suite) as a design and tech reference — but it's an independent codebase, not an extension of it.

**The long-term goal** (not yet built): an AI agent that matches existing employees to new job openings before the company hires externally. Everything built so far is the foundation for that — making the underlying employee data trustworthy first.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.2 (App Router, Turbopack) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Database | SQLite, via Prisma 7 + `@prisma/adapter-better-sqlite3` |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` password hashing, tokens kept in `sessionStorage` |
| Email (OTP delivery) | Gmail SMTP via `nodemailer` |
| AI extraction | Google Gemini (`@google/genai`) — `gemini-flash-latest` for full-record extraction, `gemini-flash-lite-latest` for single-field questions |
| Icons | FontAwesome |
| Chat rendering | `react-markdown` |
| Charts | `recharts` |

> ⚠️ This project runs on a version of Next.js newer than most training data — API conventions (route handler params, dynamic route typing, etc.) may differ from what you'd expect. See `AGENTS.md` for the note about checking `node_modules/next/dist/docs/` before writing routing code.

---

## How the pieces fit together

```
public/Foundry_Landing_Page.html   →  served at "/" via a next.config.ts rewrite
app/login, app/register            →  auth screens (outside the authenticated shell)
app/app/*                          →  everything behind login (Dashboard, Records, Chatbot)
  ├─ app/app/page.tsx              →  Dashboard
  ├─ app/app/records/page.tsx      →  Records
  └─ app/app/chatbot/page.tsx      →  Chatbot
app/api/auth/*                     →  register / verify-code / resend-code / login / refresh / me
app/api/chatbot/*                  →  extract / commit / employee/[id]
lib/*                              →  shared business logic (see below)
prisma/*                           →  schema, migrations, seed script
context/AuthContext.tsx            →  client-side session state + authFetch
```

### Data model (`prisma/schema.prisma`)

- **`User`** — an HR admin who logs into Foundry. Email + hashed password, an OTP verification code + expiry, a hashed refresh token.
- **`Employee`** — the actual record being managed: name, phone, birth date, nationality, marital status, email, work location, gender, national ID, military status. All optional except `fullName`, since the whole point of this project is tracking *incomplete* profiles.
- **`Experience`, `Education`, `Certificate`, `Skill`** — one-to-many child tables off `Employee`, cascade-deleted with the parent.

### Authentication

`register → (email OTP) → verify-code → login → access token (15m) + refresh token (7d, hashed at rest) → refresh → me`

- Tokens live in `sessionStorage` (via `AuthContext`), not cookies.
- `AuthContext.authFetch()` is the client's authenticated fetch wrapper: attaches the access token, and on a `401` transparently refreshes and retries once.
- On the server, `lib/requireAuth.ts` exports `requireUserId(request)` — the one shared helper every protected route should call to verify the Bearer token before doing anything else.
- Email delivery for the OTP code goes through Gmail SMTP (`lib/mailer.ts`), not a third-party transactional email API — that switch was made because the alternative's free tier only delivers to the account owner's own address.

### Dashboard

A Server Component (`app/app/page.tsx` + `lib/employeeStats.ts`) that computes live data-completeness statistics straight from the database — which fields are most often missing, per-employee completion percentage, etc. `lib/tabConfig.ts` is the single source of truth for which fields exist and which are required, so the Dashboard, Records, and Chatbot all agree on the same field list.

### Records

A searchable, paginated table of every employee (`app/app/records/page.tsx` + `components/records/RecordsView.tsx`) with a tabbed detail modal for drilling into one person's full profile.

### Chatbot — the main body of work so far

Natural-language Create/Update/Read of employee records. **Delete is intentionally not built yet.**

- **`lib/gemini.ts`** — calls Gemini with a structured JSON schema (so the model can't return free-form prose) and a system instruction that scopes it strictly to employee-record CRUD. Two entry points: `extractEmployeeData` (full message, every field) and `extractSingleField` (one field at a time, cheaper model, used during guided data collection).
- **`lib/chatbotResolve.ts`** — figures out *which* employee (if any) a message is about: by numeric ID, by National ID, or by exact name match. Returns a `create` / `update` / `disambiguate` (write) or `found` / `notFound` / `disambiguate` (read) verdict. When a name search turns up more than one person, the UI shows a picker rather than guessing.
- **`lib/chatbotValidate.ts`** — the deterministic layer beneath the LLM. Real structural checks, not just "is this a string": Egyptian mobile phone format, a proper email shape, real calendar dates (including written-out dates like "June 7th, 2000", normalized to `YYYY-MM-DD`), and Egyptian National ID structure (century digit + embedded YYMMDD birth date must be a real date — governorate code and the final checksum digit are deliberately *not* verified, since neither algorithm is confidently known here). This same validation now runs at **both** the extraction step and again immediately before the database write, so bad data can't get in through a request that skips the guided flow.
- **`app/api/chatbot/extract/route.ts`** — two modes: a fresh message (full extraction + resolution), or answering one specific question during guided new-hire data collection (with a "skip" escape hatch per field).
- **`app/api/chatbot/commit/route.ts`** — the *only* place that writes to the `Employee` table, and only after the admin explicitly clicks Confirm in the UI.
- **`app/api/chatbot/employee/[id]/route.ts`** — a plain, no-LLM-involved fetch of one employee's full record, used after picking someone from a disambiguation list.
- All three chatbot routes require a valid access token (`requireUserId`), and the client sends it via `authFetch`.
- **`components/chatbot/ChatbotView.tsx`** — the UI: welcome screen, avatar/bubble chat layout, a confirmation card per response type (create/update/disambiguate/needs-info/invalid-field/lookup-result/etc.), and a deterministic client-side memory of who was last discussed (`lastEmployee`) so a follow-up like "his phone number" resolves correctly without needing to trust the LLM to infer it from raw history text alone.

### Landing page

Static HTML (`public/Foundry_Landing_Page.html`), served at `/` via a Next.js rewrite rather than a React page — animated hero mockup (layered "ghost" cards, a periodic scan-sweep, a looping data-reveal sequence), scroll-triggered reveals, and a barely-there ambient background texture shared visually with the in-app chatbot.

---

## Getting started

```bash
npm install
```

Create a `.env` file with:

| Variable | What it's for |
|---|---|
| `DATABASE_URL` | SQLite connection string, e.g. `file:./prisma/dev.db` |
| `JWT_SECRET` | Signs and verifies access/refresh tokens |
| `GEMINI_API_KEY` | Google Gemini API key for chatbot extraction |
| `GMAIL_USER` | The Gmail address OTP emails are sent from |
| `GMAIL_APP_PASSWORD` | A Google Account **App Password** (not your real password) — Google Account → Security → 2-Step Verification → App Passwords |

Then:

```bash
npx prisma migrate dev     # apply the schema
npx prisma db seed         # load ~20 realistic mock employees
npm run dev                # start the dev server on :3000
```

Other scripts: `npm run build`, `npm run start`, `npm run lint`.

---

## Known limitations / not yet built

- **Delete** isn't implemented — planned with a soft-delete (`deletedAt`) column and explicit double-confirmation, but deferred until Create/Update/Read are fully solid.
- **No password-reset flow** — only register → verify → login → refresh exist.
- **No rate limiting or account lockout** on login attempts or OTP guesses.
- **No audit trail** — nothing records who changed which employee field or when.
- **Chat history isn't persisted** — it's client-side React state; a page refresh loses the conversation (including the `lastEmployee` memory).
- **Relation sub-fields aren't validated** — the experience/education/certificate/skill arrays' own fields (e.g. a job's start/end date) can still reach the database malformed or missing, even though the scalar employee fields are now validated at both the extraction step and the write boundary.
- **The actual AI job-matching feature** — the stated long-term goal — hasn't been started. Everything so far is the data-integrity foundation it depends on.
