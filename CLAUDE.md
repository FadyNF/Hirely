# CLAUDE.md — Foundry (ElSewedy Electric HR Platform)

> Auto-generated context file. Last updated: 2026-07-12.
> Drop this in your project root so Claude Code picks it up on every session.

---

## Project Overview

**Foundry** is an internal HR employee data management and validation system for ElSewedy Electric.
It handles employee records, validates data integrity, and long-term will support AI-driven internal job matching.

### Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| ORM | Prisma 7 |
| Database | SQLite (local dev) |
| AI | Google Gemini API |
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
- <!-- TODO: fill in auth approach (NextAuth? custom? none?) -->

---

## Environment Variables

```bash
# .env.local — never commit this file
DATABASE_URL="file:./dev.db"
GEMINI_API_KEY="..."
# Add others here
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
- Built a structured "Add Employee" modal form (`components/chatbot/EmployeeForm.tsx`) to replace one-by-one chatbot data entry, wired into the chatbot's create-intent flow.
- **Excel import/export — fully built this session**, see the "Excel import & export" section in `README.md`:
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

- Excel import/export (single-employee + batch) is done and verified end-to-end — see "Active / Recent Work" above and the README's "Excel import & export" section. Not a next-session task unless new issues turn up.
- Known, intentionally-deferred gaps in batch import: no inline row-editing in the review table (fix in the sheet and re-upload), no volume/pagination handling for very large sheets.
- Other long-standing, not-yet-actioned items (pre-date the Excel work, still true): the dead one-by-one `needsInfo` create flow left as unreachable code in `extract/route.ts`/`ChatbotView.tsx`; six pre-existing `react/no-unescaped-entities` ESLint errors in `ChatbotView.tsx`; chatbot rate-limiting (explicitly deprioritized); landing-page metadata bug (never explicitly requested to fix).
- Check `git status` before starting new work — confirm whether this session's Excel-import work has been committed yet.