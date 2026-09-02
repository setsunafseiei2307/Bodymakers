# Decisions

## 2026-09-02 Production deployment

Production deployment has one path only:

`GitHub main → GitHub Actions → Cloudflare Worker bodymakers → production smoke test`

Cloudflare Git automatic deployment is not used. Codex and local environments must not use `wrangler login` or direct deploy. The GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are the only Cloudflare credentials used by this repository; secret values must never be read or displayed.

Any change to this decision requires an update to this file with the reason.

## 2026-09-02 Home is read-only, and one place decides its state

Home (`/`) reads local data and never writes it. It introduces no localStorage key of its own.

`src/lib/home/state.ts` is the only place that decides which Home state a visitor is in. Whether a day counts as active is not redecided there — it comes from `src/lib/activity/`. `src/lib/todayAction.ts` keeps answering a different question (the next single action inside Today) and is not merged into Home state.

Streak, today's progress, and the weekly summary stay on Today and `/record/` and are not shown on Home, so the same numbers do not appear on two screens. They are implemented; this is only about placement.

No analytics vendor has been chosen. `src/lib/analytics.ts` holds the event contract and a no-op `track()`; no SDK or snippet is added until a vendor decision is recorded here.

Changing any of this requires updating this file with the reason.

## 2026-09-03 Adaptive weights sit on top of the program, never inside it

The Training Adaptive Loop stores a per-lift `offsetKg` and adds it to the weight the program calculated, at display time. It never rewrites `ProgramSession` weights and never rewrites `ActiveProgram.trainingMaxes`.

The program's own weekly progression stays the base. Because the adaptive layer is a separate addend, the two cannot double-count, and turning the adaptive layer off would restore the original program weights exactly.

One session may adjust a lift once. The session key `programId:wNdM` records what has already been applied.

The rule only uses what is actually saved: which exercises were ticked, and whether the session was marked 完了 or スキップ. Per-set weight and reps are not stored, so no rule may depend on them until they are.

Changing any of this requires updating this file with the reason.
