# CLAUDE.md — Foundry (ElSewedy Electric HR Platform)

> Auto-generated context file. Last updated: 2026-07-13.
> Drop this in your project root so Claude Code picks it up on every session.

---

## Project Overview

**Foundry** is an internal HR employee data management and validation system for ElSewedy Electric.
It handles employee records, validates data integrity, and long-term will support AI-driven internal job matching.

### Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2 (App Router, Turbopack) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| ORM | Prisma 7 |
| Database | SQLite (local dev) |
| AI | Google Gemini API (`@google/genai`) |
| Runtime | Node.js (Windows + WSL2) |

---

## File Structure

> **TODO**: Run `find . -not -path './node_modules/*' -not -path './.git/*' -not -path './.next/*' -not -path './prisma/migrations/*' | sort` and paste here.

```
foundry/
├── app/                    # Next.js App Router pages
│   ├── api/                # API routes
│   └── (routes)/           # Page routes
├── components/             # Shared React components
├── lib/                    # Utilities, helpers, Prisma client
├── prisma/
│   ├── schema.prisma       # DB schema
│   └── seed.ts             # Seed script
├── public/
├── .env.local              # Local env vars (never commit)
├── CLAUDE.md               # ← you are here
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## Key Architecture Decisions

### Database
- **SQLite** for local dev simplicity. Prisma handles all DB access — never raw SQL.
- Migrations live in `prisma/migrations/` — always run `npx prisma migrate dev` after schema changes, never `db push` in shared envs.
- Reseed with `npx prisma db seed` — seed script at `prisma/seed.ts`.

### AI / Chatbot
- Uses **Gemini API** via `@google/generative-ai`.
- Chatbot feature: currently debugging **employee rename flow and reseed test data** (last known session task).
- AI responses should be streamed where possible.
- Keep Gemini calls in server components / API routes only — never expose API key to client.

### Data Validation
- Employee data validation is a core responsibility. Validation rules live in `lib/validation/`.
- Invalid records should be flagged, not silently dropped.

### Auth
- Custom (no NextAuth): `register → OTP email → verify-code → login → access token (15m) + refresh token (7d, hashed at rest) → refresh`. Tokens live in httpOnly cookies, never in client state.
- `lib/requireAuth.ts`: `requireUserId`/`requireUserIdFromServerCookies` gate any authenticated route/page; `requireRootUserId`/`requireRootUserIdFromServerCookies` additionally check `User.role === "root"` for the admin console.
- On top of email verification there's a second gate: `User.approved`. A new admin can fully verify their OTP and still get `{ status: "pending_approval" }` back from login/verify-code until the root admin approves them at `/app/admin`. See README's "Root admin approval & support requests" section for the full flow.
- The root admin isn't a normal signup — it's bootstrapped from `ADMIN_EMAIL`/`ADMIN_PASS` env vars via `lib/rootAdmin.ts`, re-upserted on every login attempt for that email so credential rotation needs no restart or seed script.

---

## Environment Variables

```bash
# .env.local — never commit this file
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
npm run dev

# Prisma
npx prisma studio              # Visual DB browser
npx prisma migrate dev         # Apply migrations
npx prisma db seed             # Reseed test data
npx prisma generate            # Regenerate client after schema change

# Build
npm run build
npm run start
```

---

## Active / Recent Work (last session)

- Working on branch `chatbot-form` (branched off `chatbot`, which holds the earlier auth/validation hardening work).
- **Root admin approval system + support requests — built this session**, see the README's "Root admin approval & support requests" section for the full breakdown:
  - Schema: `User.role` (`"admin"`|`"root"`), `User.approved` (default `false`, existing users backfilled to `true` so nobody got locked out), new `SupportRequest` model — migration `20260712232439_add_admin_approval_and_support`.
  - `lib/rootAdmin.ts` bootstraps the one root account from `ADMIN_EMAIL`/`ADMIN_PASS` env vars, re-upserted on every login attempt for that email (no restart or seed script needed to rotate credentials).
  - `login`/`verify-code` routes gate on `approved` after credentials/OTP succeed, returning `{ status: "pending_approval" }` instead of tokens; `AuthContext` persists that state to sessionStorage and routes to `/pending`.
  - `/app/admin` (root-only, gated by `requireRootUserIdFromServerCookies`): approve/decline pending admins (decline **hard-deletes** the row so the email can re-register), view/resolve support requests.
  - `components/shared/SupportRequestModal.tsx`, reachable from the sidebar ("Report an issue", any admin) and the `/pending` waiting screen (email locked) — submits via unauthenticated `POST /api/support-requests` so pending users without a cookie can still reach root.
- **Branding + metadata + hover polish — also built this session**, see README's "Branding & page metadata" and "Hover / transition polish" sections: replaced the `faFire` gradient badge with `components/shared/Logo.tsx` (Wedy.AI mark) everywhere; every route now sets its own page title through `app/layout.tsx`'s title template instead of the default "Create Next App"; interactive elements across the app (nav links, stat cards, table rows, buttons) got hover/transition treatment, using component state instead of Tailwind `hover:` wherever an inline conditional `style` prop already controlled the same CSS property.
- Earlier this session: built a structured "Add Employee" modal form (`components/chatbot/EmployeeForm.tsx`) to replace one-by-one chatbot data entry, wired into the chatbot's create-intent flow.
- **Excel import/export**, see the "Excel import & export" section in `README.md`:
  - Single-employee: label-based parser (`lib/excelImport/singleEmployeeParser.ts`, robust to layout shifts — verified), Gemini classification of the template's free-text training lines into education/certificate (`classifyTraining.ts`), mapping into `EmployeeForm` pre-fill (`mapToFormData.ts`), multi-file upload with sequential review modals + drag-and-drop + welcome quick-action in the chatbot, and a template/export builder (`singleEmployeeTemplate.ts`, ExcelJS, styling mirrors the real ElSewedy template) round-tripping through the parser.
  - Batch: shared column config (`batchColumns.ts`), SheetJS parser (`batchParser.ts`), ExcelJS template/export (`batchTemplate.ts`), a review-table modal on the Records page (upload → per-row valid/error preview → select → import, partial-success reporting), and filtered/full export.
  - Schema additions: `Employee.companyID/hiringDate/position/age/yearsExpPrev/yearsExpElsewedy/totalExperience`, `Certificate.rawText`, new `PerformanceReview` model — `EmployeeForm` gained a 5th "Performance Reviews" relation section (percentage in the UI, fraction in the DB).
  - Real bugs found and fixed during verification (not hypothetical): `EmployeeForm.removeEntry` left stale index-keyed errors after deleting an entry; `showWelcome` only checked user-role messages so an upload-only session never left the welcome screen; the counter-based drag-enter/leave overlay double-fired in this environment (switched to a `dragover` + debounce-timeout pattern); P2002 duplicate-key error messages said "unique field" instead of naming the column, because the better-sqlite3 Prisma adapter leaves `meta.target` undefined (fixed in both commit routes to match against the whole `meta` blob).
- GPA is stored as scale-tagged text (`"2.5/4.0 (American)"`) rather than a bare float, since American/German scales share a denominator — required a schema change (`Education.gpa`: `Float?` → `String?`).

---

## Long-Term Roadmap

1. ✅ Employee CRUD + validation
2. 🔄 AI chatbot for HR queries (in progress)
3. ⬜ Internal job matching (AI-driven — match employees to open roles)
4. ⬜ Analytics dashboard

---

## Conventions

- **Components**: PascalCase, co-locate styles if Tailwind isn't enough.
- **API routes**: REST-style under `app/api/`. Return `{ data, error }` shape consistently.
- **Prisma models**: PascalCase singular (`Employee`, not `employees`).
- **Error handling**: Always catch Prisma errors explicitly — distinguish `P2002` (unique constraint) from other codes.
- **Tailwind v4**: Use the new `@import "tailwindcss"` syntax, not `@tailwind base/components/utilities`.

---

## Known Issues / Gotchas

- SQLite doesn't support all Prisma features (e.g., no `createMany` with `skipDuplicates` in some versions — check Prisma 7 docs).
- WSL2 file watcher can be flaky — if hot reload stops, restart `npm run dev`.
- Gemini API has quota limits — add rate limiting before any production use.
- <!-- TODO: Add any bugs discovered in last session -->

---

## Notes for Next Session

- Root admin approval system + support requests is done and verified end-to-end (root login, approve, decline, pending-user login gate, support request submission from both an authed and a pending session) — see "Active / Recent Work" above and the README's "Root admin approval & support requests" section. Not a next-session task unless new issues turn up.
- Branding/metadata/hover-polish pass is also done — see README's "Branding & page metadata" and "Hover / transition polish" sections.
- Excel import/export (single-employee + batch) is done and verified end-to-end — see the README's "Excel import & export" section. Not a next-session task unless new issues turn up.
- Known, intentionally-deferred gaps in batch import: no inline row-editing in the review table (fix in the sheet and re-upload), no volume/pagination handling for very large sheets.
- Other long-standing, not-yet-actioned items (pre-date this session, still true): Records page's filter UI (department/gender/nationality/marital/military) is still a stub, not wired to real filtering logic; the dead one-by-one `needsInfo` create flow left as unreachable code in `extract/route.ts`/`ChatbotView.tsx`; six pre-existing `react/no-unescaped-entities` ESLint errors in `ChatbotView.tsx`; chatbot rate-limiting (explicitly deprioritized); landing-page metadata bug (never explicitly requested to fix).
- Check `git status` before starting new work — confirm whether this session's work has been committed yet.