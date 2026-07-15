# CLAUDE.md — Hirely (ElSewedy Electric HR Platform)

> Auto-generated context file. Last updated: 2026-07-14.
> Drop this in your project root so Claude Code picks it up on every session.

---

## Project Overview

**Hirely** is an internal HR employee data management and validation system for ElSewedy Electric.
It handles employee records, validates data integrity, and — as of this session — includes a working AI-driven job matching feature (hybrid BM25 + semantic search) that ranks existing employees against a pasted job description.

### Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2 (App Router, Turbopack) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Database access | Raw SQL via `better-sqlite3` — **no ORM at runtime** (see "Database" below) |
| Database | SQLite (local dev + prod, single file) |
| AI | Google Gemini API (`@google/genai`) — chatbot extraction, single-employee Excel training-line classification, and job-matching embeddings (`gemini-embedding-2`) |
| Runtime | Node.js (Windows + WSL2) |

---

## File Structure

```
foundry/
├── app/                    # Next.js App Router pages
│   ├── api/                # API routes
│   └── app/                # Authenticated routes (Dashboard, Records, Chatbot, Job Matching, Admin)
├── components/             # Shared React components
├── lib/                    # Utilities, helpers, raw-SQL data-access layer
│   ├── db.ts               # The SQLite connection + migration runner — everything else imports this
│   ├── employees.ts        # Employee CRUD + relation writes (raw SQL)
│   ├── users.ts             # User CRUD (raw SQL)
│   ├── supportRequests.ts  # SupportRequest CRUD (raw SQL)
│   ├── jobMatching.ts       # BM25 + semantic hybrid search, RRF fusion
│   ├── employeeCertificates.ts  # Corpus building + embedding sync for Job Matching
│   └── excelImport/        # Excel parsing/classification/generation
├── public/
├── .env                     # Local env vars (never commit)
├── CLAUDE.md               # ← you are here
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── prisma/                 # schema.prisma + migrations — DEV-ONLY schema-design tool, see below
└── package.json
```

---

## Key Architecture Decisions

### Database

**No ORM at runtime — this is a deliberate, recent change** (production infra policy disallows an ORM on the server). The app talks to SQLite directly via `better-sqlite3`.

- **`lib/db.ts`** is the single connection + migration runner. It opens the SQLite file at `DATABASE_URL`, runs `PRAGMA foreign_keys = ON` (SQLite disables this per-connection by default — without it, `onDelete: Cascade`/`SetNull` in the schema are silently unenforced), and auto-applies any `prisma/migrations/*/migration.sql` not yet recorded in its own `_migrations` table (bootstrapping that table from Prisma's `_prisma_migrations` ledger on an existing DB). **This means deploying is just "ship the code" — no Prisma CLI, no `migrate deploy`, needed on the server at all.**
- **`prisma/schema.prisma` + `prisma` CLI are dev-only tooling now** — used locally to design a schema change and generate the next `migration.sql` via `npx prisma migrate dev`. `@prisma/client` and `@prisma/adapter-better-sqlite3` are **not** dependencies anymore; `prisma` (the CLI) stays a devDependency only.
- **Data-access layer**: `lib/employees.ts`, `lib/users.ts`, `lib/supportRequests.ts` — hand-written functions per table, no query-building abstraction. `lib/employees.ts`'s `createEmployeeWithRelations`/`updateEmployeeWithRelations` replace Prisma's nested relation writes with explicit transactions (`runInTransaction` from `lib/db.ts`).
- Booleans are stored as `0`/`1`, converted to real `boolean` at read/write time. Dates are stored as ISO-8601 `TEXT`, converted to/from real `Date` objects the same way.
- A unique-constraint violation is a `SqliteError` with `code === "SQLITE_CONSTRAINT_UNIQUE"` — the message already names the colliding column (e.g. `"UNIQUE constraint failed: Employee.companyID"`), simpler than the old Prisma-era `meta`-blob string-matching workaround.
- **To inspect the DB now**: `npx prisma studio` still works (it's a separate CLI tool that connects straight to the datasource, independent of whether app code uses the generated client) — still the easiest visual browser. For a quick scripted check, `better-sqlite3` is already a dependency:
  ```bash
  node -e "const Database = require('better-sqlite3'); const db = new Database('dev.db', {readonly:true}); console.log(db.prepare('SELECT * FROM Employee LIMIT 5').all());"
  ```
- **Never write raw SQL string-concatenation** — always parameterized (`?` placeholders via `.prepare(sql).run(...)`/`.get(...)`/`.all(...)`), matching the pattern already used everywhere in `lib/`.

### AI / Chatbot
- Uses **Gemini API** via `@google/genai`.
- Chatbot Create/Update/Read is complete and stable — extraction, disambiguation, validation, and commit are all working end-to-end. **Delete is intentionally not built.**
- Keep Gemini calls in server components / API routes only — never expose API key to client.

### Job Matching
- `lib/employeeCertificates.ts` builds each employee's text corpus (certificates + experience + skills) and syncs embeddings for any employee missing one or flagged `isdirty` (set on every employee create/update).
- `lib/jobMatching.ts` — a from-scratch BM25Okapi implementation combined with cosine similarity over cached embeddings, fused via Reciprocal Rank Fusion (RRF). No BM25/semantic/RRF scores are shown in the UI — just a ranked list, top N (count, not percentage).
- `topN` is validated server-side (`app/api/job-matching/route.ts`) — must be a positive integer, or the route returns 400. (A prior bug: negative `topN` fell through to `Array.prototype.slice(0, negativeN)`, which returns "everything except the last N" — silently returning almost the whole employee table instead of erroring.)
- **Not yet built**: a "job openings" concept (structured, reusable job postings) — today a job description is pasted fresh each search. Structured/schema-based matching (parse requirements + profiles into comparable structured fields, hard-filter, then score) was scoped and discussed but deferred in favor of the current hybrid approach.

### Data Validation
- Employee data validation is a core responsibility. Validation rules live in `lib/validation/` and `lib/chatbotValidate.ts`.
- Invalid records should be flagged (`ReviewFlag` model), not silently dropped.

### Auth & roles
- Custom (no NextAuth): `register → OTP email → verify-code → login → access token (15m) + refresh token (7d, hashed at rest) → refresh`. Tokens live in httpOnly cookies, never in client state.
- Three roles: `"employee"` (default for every fresh signup), `"admin"` (a promoted employee), `"root"` (the single env-configured superuser) — see `lib/roles.ts`'s `Role` union type.
- **Every signup is created at full functionality immediately** — no approval gate. `app/api/auth/register/route.ts` creates the `User` row *and* a blank, linked `Employee` row (`Employee.userId` → `User.id`) in one transaction, so a fresh employee has something to edit in the self-service view from the first login. The old "pending admin approval" flow (`/pending`, `PendingApprovalScreen.tsx`, `pending_approval` status) is gone — removed, not left as dead code — since there's no state left to gate on (`approved` is `true` from creation).
- `lib/requireAuth.ts`: `requireUserId`/`requireUserIdFromServerCookies` gate any authenticated route/page; `requireRootUserId`/`requireRootUserIdFromServerCookies` additionally check `User.role === "root"`. `requireCallerContext`/`requireCallerContextFromServerCookies` resolve role **and** the caller's linked `employeeId` in one call — the primitive every employee-scoped guard/route (`/app/employee`, `/api/employee/me`, the employee branch in `commit`/`extract`/`employee/[id]`) is built on.
- **Becoming an admin is root promoting an existing employee**, never a signup-time choice — `POST /api/admin/approvals/[userId]` (root-only) flips `role` to `"admin"`, no confirmation needed (non-destructive). `/app/admin`'s "Promote to admin" section lists every `role: "employee"` user.
- The root admin isn't a normal signup — it's bootstrapped from `ADMIN_EMAIL`/`ADMIN_PASS` env vars via `lib/rootAdmin.ts`, re-upserted on every login attempt for that email so credential rotation needs no restart or seed script.
- **A live authorization gap was found and closed while building the employee self-service view**: `app/api/chatbot/commit/route.ts` (the only write path to `Employee`) used to trust a client-supplied `employeeId` completely — harmless while every logged-in user was admin/root (all meant to edit anyone), but a real hole the moment an `employee` role exists behind the same route. Fixed by forcing `action` to `"update"` and overwriting the request body's `employeeId` with the caller's own resolved id for `role === "employee"` — verified live with a spoofed request (`employeeId` pointing at another employee) that was correctly ignored.
- Login/Register screens' "Need help?" link opens the real support-request modal (email editable, since neither screen knows who the visitor is yet). There used to also be a "Contact IT Support" link next to it that went nowhere (`href="#"`, no handler) — removed.

---

## Environment Variables

```bash
# .env — never commit this file
DATABASE_URL="file:./dev.db"
GEMINI_API_KEY="..."

# Gmail SMTP for OTP verification emails (App Password, not the account password)
GMAIL_USER="..."
GMAIL_APP_PASSWORD="..."

# Root admin — the single privileged account that can approve/decline
# pending admin signups and triage support requests. Changing either of
# these takes effect on the next login attempt (no restart, no seed
# script) — the row is upserted from these values inside the login route.
# Required: without them, no account has approval powers.
ADMIN_EMAIL="admin@test.com"
ADMIN_PASS="admin1234"
```

---

## Commands

```bash
# Dev
npm run dev                    # auto-creates dev.db and applies every migration on first run

# Prisma (dev-only tooling — schema.prisma is not used at runtime)
npx prisma studio               # Visual DB browser — still works, connects directly to the datasource
npx prisma migrate dev          # Only needed when actually editing schema.prisma — generates the next migration
npx prisma db seed              # Reseed test data (prisma/seed.ts uses lib/db.ts directly, not the Prisma client)

# Build
npm run build
npm run start
```

---

## Active / Recent Work (last session)

This session shipped four follow-ons to the Employee self-service view (described below, already merged/verified before this session started): **demote** (admin → employee, symmetric to promote), the **admin console split** into three paginated subpages, **excluding an admin/root's own Employee record** from every company-wide employee view, and **certificate upload** (image/PDF → Gemini-parsed fields + saved file).

- **Demote**: `DELETE /api/admin/approvals/[userId]` (root-only, 400 if `role !== "admin"`) flips role back to `"employee"` — symmetric to the existing `POST` promote handler. Non-destructive; the linked `Employee` row is untouched.
- **Admin console split**: `/app/admin` (Promote), `/app/admin/admins` (Admins/Demote — new `lib/users.ts` `findAdminUsers()`), `/app/admin/support-requests` — each a real route sharing `components/admin/AdminSubNav.tsx`, each paginated client-side via a new `usePagination` hook + `PaginationControls` component (same slice pattern `RecordsView.tsx` already used). The old monolithic `AdminConsoleView.tsx` was deleted, not left alongside the new components.
- **Exclusion filter**: `lib/employees.ts`'s `getAllEmployees`/`getFilteredEmployees` and `lib/jobMatching.ts`'s own candidate query all gained a `LEFT JOIN "User" ... WHERE "User"."id" IS NULL OR "User"."role" = 'employee'` condition — live-computed, not a stored flag, so promoting/demoting an admin makes their record vanish/reappear automatically everywhere. Verified live in both directions across Records, Dashboard, batch export, and Job Matching.
- **Certificate upload**: new `Certificate.attachmentPath` column (migration `20260716090000_add_certificate_attachment`); `lib/gemini.ts`'s `extractCertificateFromFile()` is the **first multimodal Gemini call** in this codebase (`inlineData` base64 part, not text-only `contents`); `POST /api/employee/certificates/upload` parses + saves the file to a local `data/certificates/<employeeId>/` folder without writing the `Certificate` row (review-before-save, same shape as chatbot/Excel-import extraction); the confirm step reuses the existing `commit` route additively. `GET /api/certificates/[certificateId]/attachment` serves the file back with an ownership check (employee-own or admin/root).
  - **A real bug found and fixed along the way**: `EmployeeForm`'s generic relation editor only round-trips fields listed in its own `RELATION_UI` config — `attachmentPath` wasn't one, so any save through the generic form (an admin editing that employee, or the employee's own "Edit profile") silently dropped the link to the uploaded file. Fixed by adding it as a `type: 'hidden'` field (renders nothing, but flows through the existing read/write loop) and adding it to `lib/chatbotValidate.ts`'s `RELATION_FIELDS.certificates.optional` (the validator was independently building a fresh object from only its known fields, same root cause, different file).
- Full `tsc --noEmit` + `next build` + project-wide `eslint` pass (clean except pre-existing, documented debt: `lib/mailer.ts`'s type error, six `react/no-unescaped-entities` in `ChatbotView.tsx`, a handful of pre-existing `react-hooks/set-state-in-effect` findings in `LoginScreen.tsx`/`RegisterScreen.tsx` — none introduced this session, confirmed via scoped lints of only the touched files). Verified live: promote/demote round-trip, all three admin subpages + pagination, exclusion filter in all four surfaces, and a full certificate upload → parse → confirm → save → download cycle including a cross-employee 403 check.

## Earlier: Employee self-service view + onboarding overhaul

This session built the **Employee self-service view + onboarding overhaul** directly on `master` (the earlier Prisma→raw-SQL migration, described below, was already merged before this session started): employees now log in themselves, land on their own HR record (view/edit + a chatbot scoped to just their profile), and every fresh signup becomes a plain employee rather than a pending admin. Root promotes employees to admin from the console instead.

- **Schema**: `Employee.userId` (nullable-unique, `onDelete: SetNull`) links a login account to its HR record 1:1; `User.role`'s default changed from `"admin"` to `"employee"`, `approved`'s default from `false` to `true` (migration: `prisma/migrations/20260715120000_link_user_employee`, hand-written since `prisma migrate dev` couldn't run against the drifted local dev DB — applied and verified via `lib/db.ts`'s own runner instead). New `lib/roles.ts` exports the shared `Role` union type.
- **Onboarding rewrite**: `app/api/auth/register/route.ts` now creates the `User` row *and* a blank linked `Employee` row (`fullName: ""`, `email` pre-filled) in one transaction; both roll back together if the verification email fails to send. The `pending_approval` status and its whole flow (`/pending`, `PendingApprovalScreen.tsx`, `pendingApproval` state in `AuthContext.tsx`) were removed outright, not left unreachable. `app/api/admin/approvals/[userId]/route.ts` is now a single **Promote to admin** action (`lib/users.ts`'s `findEmployeeUsers()` replaces `findPendingAdmins()`); the old hard-delete Decline action is gone along with the approval queue it belonged to.
- **Auth plumbing**: `lib/requireAuth.ts`'s new `requireCallerContext`/`requireCallerContextFromServerCookies` resolve role + linked `employeeId` in one call. Dashboard/Records (Server Components that fetch company-wide data) hard-check role server-side before fetching; `app/app/layout.tsx`'s client-side effect additionally redirects an employee to `/app/employee` (and anyone else away from it) for every other page. Post-login/register redirects and `Sidebar.tsx`'s nav are both role-aware now.
- **Employee self-service view** (`app/app/employee/page.tsx`, `components/employee/*`): "My Profile" reuses `EmployeeForm` unmodified; "Assistant" is a new, much smaller scoped chatbot (`ScopedAssistant.tsx`) that skips `lib/chatbotResolve.ts`'s whole-table search entirely, since there's only ever one possible target.
- **A real authorization gap was found and fixed as part of this work**: `app/api/chatbot/commit/route.ts` (and `GET /api/chatbot/employee/[id]`) used to trust a client-supplied `employeeId` completely — harmless while every logged-in user was admin/root, but a live hole the instant an `employee` role exists behind the same route (any employee could pass an arbitrary `employeeId` via devtools/curl and edit someone else's record). Fixed by forcing `action`/`employeeId` server-side for `role === "employee"`; verified live with an actual spoofed request.
- Full production build + typecheck pass (clean except the pre-existing unrelated `lib/mailer.ts` error); verified live end-to-end: signup → OTP → lands on `/app/employee` with blank profile, edit-and-reload, spoofed-`employeeId` rejection, scoped-chatbot update via natural language, root's promote action, and regression-checked the unchanged admin Records/Chatbot flows.

## Earlier: Prisma → raw SQL migration (already merged before this session)

Converted every data-access call off Prisma to raw SQL via `better-sqlite3`, keeping the same SQLite database — production infra policy disallows an ORM on the server. See the README's "Database access" section for the full breakdown:
  - New `lib/db.ts` (connection + migration auto-runner + `PRAGMA foreign_keys = ON`), `lib/users.ts`, `lib/supportRequests.ts`; `lib/employees.ts` grew a full raw-SQL relation loader (`getAllEmployees`/`getEmployeeById`/`getFilteredEmployees`) and nested-write helpers (`createEmployeeWithRelations`/`updateEmployeeWithRelations`).
  - Every `app/api/**` route, `lib/chatbotResolve.ts`, `lib/employeeStats.ts`, `lib/employeeCertificates.ts`, `lib/jobMatching.ts`, `lib/rootAdmin.ts`, `lib/requireAuth.ts`, `prisma/seed.ts`, and `app/app/admin/page.tsx` rewritten off Prisma. `lib/prisma.ts` deleted; `@prisma/client`/`@prisma/adapter-better-sqlite3` removed from `package.json` dependencies (kept `prisma` CLI in devDependencies for local schema design only).
  - **Two real, previously-hidden bugs surfaced and got fixed as a side effect**: (a) `PRAGMA foreign_keys` was never enabled by the old Prisma adapter either, so cascade deletes/`SetNull` were silently unenforced in production the whole time — now fixed. (b) A migration renaming `EmployeeEmbedding`'s columns (`allcertificates`/`is_dirty` → `allexperience`/`isdirty`) existed as a file but had never actually been applied to the real dev database, meaning Job Matching's search query was silently broken (`no such column: allexperience`) — the new migration runner applied it automatically, which restored Job Matching to actually working. (One data-loss note: that migration's own SQL didn't carry the old `allcertificates` text into the new `allexperience` column, so the cached corpus text reset to empty for existing rows — a low-risk loss since it's a regenerable cache, not a primary source, and the embeddings themselves were preserved.)
  - Full production build + typecheck pass; every major flow (login/register/OTP, dashboard, records CRUD, chatbot create/update/lookup/disambiguate, batch import collision-retry, job matching search, admin approve/decline/resolve) verified live in-browser against the real seeded database.
- **Full front-to-back QA sweep**, reporting real bugs found (not hypothetical) across the whole app:
  1. Job Matching: `topN: 0` silently returned zero matches; negative `topN` (e.g. `-5`) returned almost the entire employee table due to `Array.prototype.slice(0, negativeN)` semantics — **fixed**: `app/api/job-matching/route.ts` now validates `topN` is a positive integer, 400s otherwise.
  2. Admin Console "Decline" — **turned out to already have a `confirm()` guard** (pre-existing, unrelated to this session); an earlier QA report incorrectly flagged it as missing because the automated browser testing tool auto-accepts native JS dialogs, making it look like it fired with no confirmation. No code change needed.
  3. Login/Register screens had a dead "Contact IT Support" link (`href="#"`, no handler) next to "Need help?" (also dead) — **fixed**: removed "Contact IT Support" entirely, wired "Need help?" to open the real `SupportRequestModal`.
  4. Landing page (`public/Hirely_Landing_Page.html`) had a "Features" nav link pointing at `#hero` (no actual Features section exists), placeholder `#` Privacy/Terms footer links, and stale "Coming soon: instant matching against new openings" copy (the feature already shipped) — **fixed**: removed the dead links, updated the copy, and made the header/hero/footer "Hirely" links point to `/` instead of `#hero`.
  5. Landing page now checks `/api/auth/me` on load — if a session is already active, it swaps Sign in/Sign up (header + hero) for real links into the app (Dashboard/Records/Chatbot/Job Matching, +Admin if root) and a single "Go to Dashboard" CTA — **new behavior, added this session**, not a bug fix.
  6. Single-employee Excel export → re-import garbled Education entries: one real Education row (e.g. Bachelor of Arts / Civil Engineering / Helwan University / 2003) came back as *two* incomplete entries. Root cause (confirmed via code, not a prompt/AI-accuracy issue): the exporter writes the *first* education entry's data in two places — structured "Graduation"/"Graduation year" cells (fieldOfStudy + year) AND a free-text training-block line (degree + institution + year) — and `mapToFormData.ts` pushed both as separate array entries instead of merging them (a gap the code's own comment already flagged as "figure out later"). **Fixed**: the basic-info Graduation fields now merge into the first Gemini-classified education entry (backfilling only what wasn't already found there), verified against both a single-degree and a two-degree real/synthetic case.
  7. Single-employee Excel template still has **no Skills section at all** — exporting an employee and re-importing silently drops their skills. **Explicitly deferred** — left alone per instruction, not fixed this session. Two ways to actually close it later: add a Skills section to the template (bigger, matches how the batch template already does it), or just document the limitation.

---

## Long-Term Roadmap

1. ✅ Employee CRUD + validation
2. ✅ AI chatbot for HR queries
3. 🔄 Internal job matching (AI-driven) — hybrid BM25+embedding search is built and working; no "job openings" concept yet (job descriptions are pasted ad hoc, not saved/reused)
4. ⬜ Analytics dashboard

---

## Conventions

- **Components**: PascalCase, co-locate styles if Tailwind isn't enough.
- **API routes**: REST-style under `app/api/`. Return `{ data, error }` shape consistently.
- **Prisma models** (`prisma/schema.prisma`, dev-only): PascalCase singular (`Employee`, not `employees`).
- **Raw SQL** (`lib/*.ts`, runtime): double-quoted identifiers (`"Employee"`, `"fullName"`), always parameterized (`?` placeholders, never string concatenation), matching the style already used throughout `lib/`.
- **Error handling**: Always catch SQLite errors explicitly — distinguish `SQLITE_CONSTRAINT_UNIQUE` (unique constraint) from other errors, same way the old code distinguished Prisma's `P2002`.
- **Tailwind v4**: Use the new `@import "tailwindcss"` syntax, not `@tailwind base/components/utilities`.

---

## Known Issues / Gotchas

- SQLite has no native boolean/datetime type — the raw-SQL data-access layer converts `0`/`1` ↔ `boolean` and ISO-8601 `TEXT` ↔ `Date` at the edge; don't assume a `Employee`/`User` row coming straight off `db.prepare(...).get()` has real booleans/dates without going through the mapping functions in `lib/users.ts` etc.
- `PRAGMA foreign_keys = ON` is set once per connection in `lib/db.ts` — if you ever open a `better-sqlite3` connection somewhere else (a script, a one-off tool), remember cascade deletes won't work there unless you set this pragma yourself.
- WSL2 file watcher can be flaky — if hot reload stops, restart `npm run dev`.
- Gemini API has quota limits — add rate limiting before any production use.
- This sandbox/dev environment has intermittent outbound network issues reaching both Gmail SMTP and the Gemini API (`ECONNRESET`/`ENETUNREACH`/45s timeouts) — not a code bug, just worth retrying or testing the surrounding logic (e.g. rollback-on-failure) rather than assuming a real bug when a live email/Gemini call flakes out.
- Single-employee Excel export/import: Skills are dropped entirely (known, deferred — see Active/Recent Work above).

---

## Notes for Next Session

- The Employee self-service view + onboarding overhaul AND this session's four follow-ons (demote, admin console split, exclusion filter, certificate upload) are done, verified end-to-end live in-browser, and sitting as **uncommitted changes on `master`** as of this writing — not yet committed. Confirm with the user before committing/pushing.
- Still open, by explicit user decision (see README's "Planned work" → "Still open"): the Sync Embeddings UI button (deferred until real scheduled automation exists, not a stopgap restore), Structured Matching's skills/education hard-filtering gap, root can't remove a `User` account outright (only demote), and orphaned certificate attachment files aren't cleaned up on delete/replace.
- Root admin approval system is **gone**, replaced by the promote-to-admin flow described above — don't reference "pending admin approval" as current behavior in new work.
- Excel import/export (single + batch), branding/metadata/hover-polish, and the earlier QA-sweep fixes are all from prior sessions and still done/verified — see README for full detail.
- Other long-standing, not-yet-actioned items (pre-date this session, still true): the single-employee Excel template's Skills gap (deferred, don't touch unless asked); Records page's filter UI only covers department/gender/nationality (marital/military status filters were removed by user request, not a gap); the dead one-by-one `needsInfo` create flow left as unreachable code in `extract/route.ts`/`ChatbotView.tsx`; six pre-existing `react/no-unescaped-entities` ESLint errors in `ChatbotView.tsx`; chatbot rate-limiting (explicitly deprioritized); a pre-existing, unrelated `lib/mailer.ts` TypeScript error (`nodemailer` `createTransport` overload mismatch) that predates this session and wasn't introduced by any of this session's changes.
