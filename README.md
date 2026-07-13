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
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` password hashing, tokens kept in httpOnly cookies |
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
app/api/chatbot/*                  →  extract / commit / employee/[id] / import-excel
app/api/templates/*                →  single-employee / batch — blank Excel template downloads
app/api/export/*                   →  employee/[id] / batch — filled Excel exports
app/api/import/batch/*             →  batch sheet parse+preview / commit
lib/*                              →  shared business logic (see below)
lib/excelImport/*                  →  Excel parsing, classification, and Excel-generation for import/export
prisma/*                           →  schema, migrations, seed script
context/AuthContext.tsx            →  client-side session state + authFetch
```

### Data model (`prisma/schema.prisma`)

- **`User`** — an HR admin who logs into Foundry. Email + hashed password, an OTP verification code + expiry, a hashed refresh token, plus `role` (`"admin"` | `"root"`) and `approved` (root-admin gate, see "Root admin approval" below).
- **`SupportRequest`** — a message from an admin (approved or still-pending) to the root admin: `type` (issue/request/other), subject, message, `status` (open/resolved). `submittedById` is nullable with `onDelete: SetNull` so a declined admin's request history survives their account being hard-deleted; `submittedByEmail` keeps a readable snapshot regardless.
- **`Employee`** — the actual record being managed: name, phone, birth date, nationality, marital status, email, work location, gender, national ID, military status — plus (added for Excel import) `companyID`, `hiringDate`, `position`, `age`, `yearsExpPrev`, `yearsExpElsewedy`, `totalExperience`. All optional except `fullName`, since the whole point of this project is tracking *incomplete* profiles. `nationalId` and `companyID` are both nullable-unique.
- **`Experience`, `Education`, `Certificate`, `Skill`, `PerformanceReview`** — one-to-many child tables off `Employee`, cascade-deleted with the parent. `Certificate.rawText` holds the original Excel source line when a certificate came from import, for admin traceability. `PerformanceReview.score` is stored as a 0–1 fraction (the UI shows/edits it as a 0–100 percentage).

### Authentication

`register → (email OTP) → verify-code → login → access token (15m) + refresh token (7d, hashed at rest) → refresh → me`

- Tokens live in httpOnly cookies (access token, 15m, path `/`; refresh token, 7d hashed-at-rest, path `/api/auth`) — never readable by client-side JS, and never held in `AuthContext` state at all.
- `AuthContext.authFetch()` is the client's authenticated fetch wrapper: cookies are attached automatically by the browser, and on a `401` it transparently calls `/api/auth/refresh` and retries once.
- On the server, `lib/requireAuth.ts` exports `requireUserId(request)` (reads the cookie from the raw request) and `requireUserIdFromServerCookies()` (via `next/headers`, for Server Components) — the shared helpers every protected route/page calls before doing anything else.
- Email delivery for the OTP code goes through Gmail SMTP (`lib/mailer.ts`), not a third-party transactional email API — that switch was made because the alternative's free tier only delivers to the account owner's own address.

### Dashboard

A Server Component (`app/app/page.tsx` + `lib/employeeStats.ts`) that computes live data-completeness statistics straight from the database — nothing is fabricated or mocked. `lib/tabConfig.ts` is the single source of truth for which fields exist and which are required, so the Dashboard, Records, and Chatbot all agree on the same field list.

`components/dashboard/DashboardView.tsx` (client, for the accordion's expand/collapse state) renders:
- **Stat cards** — total employees, overall completion, records needing review.
- **Completeness distribution** — a bar chart bucketing employees into 0–19% / 20–39% / … / 100% basic-info completeness bands.
- **Record status** — a segmented bar splitting employees into complete / needs-review / incomplete, by count of missing basic-info fields.
- **Top issues** — the 5 worst fields across *every* tab (basic info, experience, education, certificates, skills) ranked by gap %, each with a real missing/total count, not just a percentage. Clicking one expands and scrolls to that tab in the section below.
- **Employees needing attention** — a ranked table of real people (name, company ID, department, position) by how many basic-info fields they're missing — the most actionable section, since it names individuals instead of only showing aggregates.
- **Tab health overview** — an accordion (click a row to expand it in place) with per-tab detail: a missing-field bar chart for Basic Info, coverage + field-completeness for Experience/Education/Certificates, and per-category coverage/average-proficiency for Skills.

### Records

A searchable, paginated table of every employee (`app/app/records/page.tsx` + `components/records/RecordsView.tsx`) with a tabbed detail modal for drilling into one person's full profile — the modal has an "Export to Excel" button (single-employee template, filled). The toolbar also has "Import batch" (see Excel import below) and "Export all"/"Export filtered".

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
- **`EmployeeForm`** has a 5th relation section beyond Experience/Education/Certificates/Skills: **Performance Reviews** (quarter/year/score), editable and reviewable like the others — score is entered/shown as a 0–100% but stored as a 0–1 fraction, converted right before submit.

### Excel import & export

Two import paths, both landing in `EmployeeForm` (single) or a review table (batch) for the admin to confirm before anything is written — nothing from Excel reaches the database unreviewed.

**Single-employee** — a specially-formatted "Talent Profile" `.xls`/`.xlsx` (one employee per file, not a simple table):
- `lib/excelImport/singleEmployeeParser.ts` — locates every section (basic info, performance appraisal, experience history, training record) **by label text, not fixed row/column position**, so the layout can shift between real files without breaking.
- `lib/excelImport/classifyTraining.ts` — the template's free-text "Training Historical Record" lines (a mix of formal degrees and professional certificates, inconsistently formatted) are classified into `education` vs `certificate` entries via one batched Gemini call.
- `lib/excelImport/mapToFormData.ts` — maps the parsed + classified data into `EmployeeForm`'s pre-fill shape.
- `lib/excelImport/singleEmployeeTemplate.ts` — the reverse direction: an ExcelJS builder that generates either a blank template (styling — grey section headers, bold labels, borders — mirrors the real ElSewedy template) or a filled export for one employee. Exports round-trip cleanly back through the parser.
- **Chatbot UI**: a paperclip icon + an "Import from Excel" welcome quick-action open a multi-file picker; drag-and-drop across the whole chat panel also works. Each file gets parsed server-side (`POST /api/chatbot/import-excel`), shows live status in a chat card (Parsing… → Ready / error), then successfully-parsed files open `EmployeeForm` one at a time ("Reviewing 2 of 3") — canceling one advances to the next rather than aborting the batch, and a summary message reports the final created/skipped counts.
- Template download: `GET /api/templates/single-employee`. Export: `GET /api/export/employee/[id]` (button in the Records detail modal).

**Batch (tabular)** — one row per employee. Scalar `Employee` fields get one column each; the one-to-many relations (Experience, Education, Certificates, Skills, Performance) get a fixed number of *numbered slot* columns per relation instead of one row per entry (e.g. "Experience 1 - Job Title" … "Experience 2 - Job Title"; performance gets exactly 4 slots, one per quarter). A blank slot is simply skipped:
- `lib/excelImport/batchColumns.ts` — the shared column list AND relation-slot scheme (field ↔ label ↔ type, slot counts per relation), used by the template, parser, and export so all three can't drift apart.
- `lib/excelImport/batchParser.ts` (SheetJS) — reconstructs each relation's numbered slots back into an entry array per row. Reads cells directly via `XLSX.utils.decode_range`/`encode_cell` rather than `sheet_to_json`, because `sheet_to_json`'s date handling was found (during testing) to shift date cells by the system's local UTC offset.
- `lib/excelImport/batchTemplate.ts` (ExcelJS, template/export) — `performanceReviews.score` is shown/entered as a 0–100 percentage in the sheet, converted to the 0–1 fraction the DB stores on both read and write.
- Relation entries are validated with the exact same per-relation validators (`lib/chatbotValidate.ts`'s `RELATION_VALIDATORS`) the chatbot and single-employee flows already use — a bad individual entry drops just that entry (with a warning), it does not invalidate the whole row the way a bad scalar field does.
- **Records UI**: "Import batch" opens a modal — upload → preview table (each row shows Ready or its specific validation error, in-file duplicate National ID/Company ID caught before commit, plus any relation-entry warnings) → select rows → import. A row that fails scalar validation can't be selected; there's no inline cell-editing yet, so a bad row means fix-it-in-the-sheet-and-re-upload. Commit is per-row, so one collision doesn't abort the rest — the response reports created count and per-row failures.
- "Export all" / "Export filtered" (respects the Records search box and the filter dropdowns — department/gender/nationality/marital status/military status) download every relation too, via `GET /api/export/batch?search=&department=&gender=&nationality=&maritalStatus=&militaryStatus=`. Template: `GET /api/templates/batch`. Parse+preview: `POST /api/import/batch`. Commit: `POST /api/import/batch/commit`.

### Landing page

Static HTML (`public/Foundry_Landing_Page.html`), served at `/` via a Next.js rewrite rather than a React page — animated hero mockup (layered "ghost" cards, a periodic scan-sweep, a looping data-reveal sequence), scroll-triggered reveals, and a barely-there ambient background texture shared visually with the in-app chatbot.

### Branding & page metadata

`components/shared/Logo.tsx` wraps the Wedy.AI wordmark/mark (`public/images/wedy-mark.png`) at a caller-specified height, used everywhere the app previously showed a `faFire` gradient badge — the sidebar, login/register screens, and the chatbot welcome screen. `app/icon.png` is the app favicon; `public/images/wedy-mark.png` doubles as the landing page's favicon.

Every route sets its own `<title>` via a Metadata export, composed through `app/layout.tsx`'s title template (`"%s · Foundry"`) rather than each page hardcoding the full string: `/login` → "Sign In · Foundry", `/register` → "Create Account · Foundry", `/app` → "Dashboard · Foundry", `/app/records` → "Records · Foundry", `/app/chatbot` → "Chatbot · Foundry", `/pending` → "Waiting for approval · Foundry".

### Root admin approval & support requests

Not every signup can self-activate — a new admin's account is unusable (no tokens issued on login, even with the right password and a verified email) until the **root admin** approves it. This is deliberately separate from email verification: a person can fully OTP-verify their email and still be stuck on a "waiting for approval" screen.

- **The root identity is env-configured, not seeded.** `ADMIN_EMAIL` / `ADMIN_PASS` in `.env` are the only privileged account. `lib/rootAdmin.ts`'s `ensureRootAdminFromEnv()` upserts a `User` row matching those values — `role: "root"`, `approved: true` — every time that email attempts to log in, so rotating the password or changing the email takes effect on the next login attempt with no restart, no seed script, and no direct DB edit. The register route refuses signups for that email (`isRootEmail()`), since the root can't be created through the normal flow.
- **Approval gate.** `POST /api/auth/login` and `POST /api/auth/verify-code` both check `user.approved` after credentials/OTP succeed; an unapproved user gets back `{ status: "pending_approval", email }` instead of auth cookies. `AuthContext` persists that state to `sessionStorage` (mirroring how `pendingVerification` already worked) so a page reload on the waiting screen doesn't bounce the user back to `/login`.
- **`/pending`** — the waiting screen (`components/auth/PendingApprovalScreen.tsx`). Shows the account's email, a "Request assistance" button (opens the support form, pre-filled and locked to that email — works with no auth cookie, since the account isn't approved yet), and "Sign out".
- **`/app/admin`** — the root's console (`components/admin/AdminConsoleView.tsx`), gated server-side by `requireRootUserIdFromServerCookies()` (`lib/requireAuth.ts`) — a non-root admin who navigates here directly gets redirected to `/app`, not shown an error page. Two sections:
  - **Pending admin approvals** — every `approved: false` admin, oldest first. **Approve** flips `approved` to `true`. **Decline hard-deletes the `User` row** (not a soft "rejected" flag) so the same email can freely re-register later — `POST`/`DELETE /api/admin/approvals/[userId]`.
  - **Support requests** — every submission, newest-open-first, with type icon (Issue/Request/Other), submitter email, message, and a Mark resolved/Reopen toggle (`PATCH /api/admin/support-requests/[id]`). If the submitter's account was later declined, the row still shows their email (`submittedByEmail` is a snapshot, kept even after `submittedById` nulls out via `onDelete: SetNull`).
- **Support request form** — `components/shared/SupportRequestModal.tsx`, submitted through `POST /api/support-requests` (no auth required, so a pending or logged-out user can still reach root). Reachable two ways: the sidebar's "Report an issue" item (any logged-in admin) and the pending-approval screen (email pre-filled and locked).
- **Sidebar** — root-only "Admin" nav link and a small "Root admin" label under the account email; "Report an issue" is visible to everyone.

### Hover / transition polish

Interactive elements across the app (nav links, stat cards, table rows, buttons, filter selects, the batch-import modal) use `transition-colors`/`transition-all` plus a hover state, rather than being static until clicked. Two patterns recur because of two specific gotchas hit while building this:
- **State-driven hover, not Tailwind `hover:`, when an element also has an inline conditional `style`** — React silently reverts DOM mutations on the next render, and Tailwind `hover:` classes lose to an inline `style` prop on the same property. Anywhere background/color already depends on `style={{ ... }}` (the sidebar's active nav link, tab switchers), hover is tracked as component state instead.
- **Hover handlers on a wrapping `<span>`, not directly on `<Link>`**, where `next/link` needs a custom hover effect — `next/link` attaches its own `onMouseEnter` internally for prefetching, which intercepts a handler passed directly to it.

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
| `ADMIN_EMAIL` | The root admin's email — the one account that can approve pending admins and triage support requests |
| `ADMIN_PASS` | The root admin's password — re-hashed into the DB on every login attempt for that email, so changing it takes effect immediately |

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
- **Batch import has no inline row-editing** — a row that fails validation must be fixed in the source spreadsheet and re-uploaded; the review table can't edit cells directly.
- **Batch import has no volume/pagination handling** — an intentional deferral for very large sheets, revisit if it becomes a real problem.
