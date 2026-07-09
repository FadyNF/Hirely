# CLAUDE.md — Foundry (ElSewedy Electric HR Platform)

> Auto-generated context file. Last updated: 2026-07-09.
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

- **Debugging**: Chatbot employee rename flow — employees renamed via chatbot weren't persisting correctly or were causing validation errors downstream.
- **Reseed test data**: Test DB was stale / inconsistent. Reseeding to get clean state for debugging.
- `/compact` was failing with `ConnectionRefused` — likely a WSL2/network blip. If it happens again, just run `/clear` and rely on this file.

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

- Pick up from: **chatbot employee rename + reseed test data debugging**
- Check if seed script correctly handles the rename case (unique constraint on name? soft delete? etc.)
- Verify Prisma client was regenerated after any schema changes in last session