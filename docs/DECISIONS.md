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
