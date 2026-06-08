# Finance Tracker — Engineering Docs

Engineering documentation for the Finance Tracker app (single-user personal finance SPA: React 19 + Vite + Supabase, ~9,400 LOC). Generated June 2026 from a full review of the `src/` tree and `supabase/schema.sql`.

These docs complement the existing root [`PROJECT_REFERENCE.md`](../PROJECT_REFERENCE.md) (handoff/orientation) and [`README.md`](../README.md) (setup) — they go deeper on quality, design, and the path to making this your daily-driver finance app.

## Contents

| Doc | What's in it |
|-----|--------------|
| [`code-review.md`](./code-review.md) | Concrete defects ranked by severity, with file/function refs. Start here for "what's broken." |
| [`tech-debt.md`](./tech-debt.md) | Categorized, scored debt register with a phased paydown plan. |
| [`architecture.md`](./architecture.md) | System context + ADRs (decisions & trade-offs) + the mobile/laptop responsive architecture. |
| [`system-design.md`](./system-design.md) | Data model, sync redesign, and detailed designs for daily entry, recurring, myMoney import, multi-broker stocks, and the merged same-stock view. |
| [`design-system.md`](./design-system.md) | Tokens, components, and patterns reverse-engineered from the code. |
| [`fix-prompts.md`](./fix-prompts.md) | **Copy-paste Claude Code prompts** to implement every fix and feature, in priority order. |

## The short version

The app is well-built for its purpose — clean layering, careful finance math, correct RLS, real offline support. It is **not re-architecture territory.** Three things stand between it and being your everyday transaction app:

1. **The data layer doesn't scale with transaction count.** Every edit rewrites the whole transactions table; there's no write debouncing. Fix first (`fix-prompts.md` FP-1, FP-2).
2. **Two domain models need correcting:** the merged same-stock view double-counts across brokers (no ISIN/canonical identity), and account balances can silently drift from transaction history (FP-7, FP-8).
3. **The myMoney import is 80% there** — it just drops transfers and isn't idempotent (FP-6). And the Gemini "AI insights" feature is dead code (FP-4).

## Recommended path

Run the prompts in `fix-prompts.md` in order, starting with **FP-0** (add tests as a safety net) → Phase 1 (fast & safe) → Phase 2 (trustworthy numbers) → Phase 3 (daily-entry UX). Review the diff and run `tsc --noEmit` + `npm test` after each.

## Note on design references

`design-system.md` was built from the code only. Your reference designs at `D:\Ronit\Personal\designs\Expense-Portfolio-Designs` weren't accessible in this session — points to reconcile against them are flagged with ⚑ in that doc. Connect that folder and I can complete the comparison.
