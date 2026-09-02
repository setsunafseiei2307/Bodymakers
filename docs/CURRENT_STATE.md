# Current state

- Last verified: 2026-09-02
- Repository: `setsunafseiei2307/Bodymakers`
- Production: <https://bodymakers.shushushu1990.workers.dev/>
- Production Worker: `bodymakers`
- Deploy method: `main` push → GitHub Actions → existing `bodymakers` Worker → production SHA and route smoke test. Codex/local direct deploy is disabled.

## Main capabilities
- Goal diagnosis: one question per screen (24-25 questions depending on the goal), choice answers auto-advance, progress is counted from the questions actually shown, and short interstitials appear at about 25% / 50% / 75%
- Local 12-week Personal Plan, with a result screen showing current position, goal, direction, training, nutrition, and the next action
- Diagnosis draft save and resume: every answer is written to `bodymakers:diagnosis:draft:v1`, and returning to `/start/` offers resume or restart
- Program Library with local active-program progression
- Today: a single top priority action card, then training, food, nutrition targets/recommendations, recovery, and daily records
- User data export / import as JSON at `/data/`, with a one-slot pre-import backup in `bodymakers:data:backup:v1`
- MEXT food database, recipe data, and optional Open Food Facts product search
- BIG3-first 1RM, RM map, strength standards, work sets, and warmups
- Articles connected to tools
- Recent-food shortcuts and weekly Protein / active-program progress

## Local storage keys
- `bodymakers:data:v1` — the user's saved data. Format unchanged.
- `bodymakers:diagnosis:draft:v1` — unfinished diagnosis input, plus `questionId` for the current question. Drafts written before the one-question-per-screen change have no `questionId`; their section-based `step` is mapped to the first question of that section. Deleted when the Plan is saved or the user restarts. Ignored when older than 30 days, malformed, or incomplete.
- `bodymakers:data:backup:v1` — the previous `bodymakers:data:v1` value, kept so an import can be undone.

All user data remains in the browser unless a future product explicitly adds consented sync.

## Verification of the current commit
- `npm run typecheck`: 0 errors (150 files)
- `npm test`: 609 tests in 31 files passed
- `npm run build`: 66 pages built
- `npm run check:links`: all internal links resolved
- Local Node is 18.15.0 and cannot run this toolchain; the checks above were run with a throwaway Node 22.14.0 that is not installed into the system.

## Deployment status
- Latest commit on `main`: see `git log -1` (this state file is updated in the same commit as the change it describes).
- The diagnosis UX commit is local only and has not been pushed to `origin/main` yet.
- The previous commit `c03c734` reached `origin/main`, but its production deployment failed because the GitHub Actions secret `CLOUDFLARE_API_TOKEN` is not set. `CLOUDFLARE_ACCOUNT_ID` is also required by `.github/workflows/production.yml`.
- CI: GitHub Actions is responsible for the production deploy after a `main` push.
- Production: not verified from this session. Direct deploy and `wrangler login` are not used here.
