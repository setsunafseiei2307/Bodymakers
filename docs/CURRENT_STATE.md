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
- Re-diagnosis: a visitor who already has a saved Plan is asked first whether to review from their previous answers or start over, is told that saving replaces the current Plan, and sees a before → after list of what changed on the result screen. Nothing is written until they save.
- Program Library with local active-program progression
- Today: a single top priority action card, then today's progress, training, the last 7 days, food, nutrition targets/recommendations, recovery, and daily records
- Daily loop: activity days, current / longest streak, last 7 and 30 active days, today's task checklist, and a rule-based weekly summary — all derived from existing records, with no new storage schema
- Plan page also shows how much of the plan is actually being carried out this week
- Training Adaptive Loop v2: sets are logged in Today with one tap, the next session's suggested weight follows what was actually lifted, and Today and Record explain why
- Training history: recent sessions, per-lift top sets, and an estimated 1RM trend from the existing 1RM utility
- Finishing a session shows a short completion card — what was done, what Bodymakers decided, and the next session's weights — plus a next-session preview that stays after the card is dismissed
- The previous performance for each exercise is shown next to the set inputs, so the last weight and reps do not need looking up in Record
- Nutrition Adaptive Loop v1: marking a day's food record complete, plus enough weight measurements, lets Bodymakers propose a small calorie change. Nothing is applied until the user chooses it.
- Weekly Coach v1: once there is enough data, Today shows a compact "this week" card and Record shows the full weekly summary — training, nutrition, what changed, one recommendation, and next week
- First week: a stage model (`new` → `plan-created` → `first-action-done` → `building-history` → `weekly-review-ready` → `established`) derived from existing records, so day 0-3 users get something useful before Adaptive can run
- Quick food logging: "よく食べるもの" derived from the last 30 days of logs, one tap to add at the amount usually used, with undo
- Weekly history (6 weeks) and a 30-day review with milestones, both recomputed from records
- Import preview: what a backup contains, next to what is on the device now, before anything is overwritten
- User data export / import as JSON at `/data/`, with a one-slot pre-import backup in `bodymakers:data:backup:v1`
- MEXT food database, recipe data, and optional Open Food Facts product search
- BIG3-first 1RM, RM map, strength standards, work sets, and warmups
- Articles connected to tools
- Recent-food shortcuts and weekly Protein / active-program progress

## Local storage keys
- `bodymakers:data:v1` — the user's saved data. Format unchanged.
- `bodymakers:diagnosis:draft:v1` — unfinished diagnosis input, plus `questionId` for the current question. Drafts written before the one-question-per-screen change have no `questionId`; their section-based `step` is mapped to the first question of that section. Deleted when the Plan is saved or the user restarts. Ignored when older than 30 days, malformed, or incomplete.
- `bodymakers:data:backup:v1` — the previous `bodymakers:data:v1` value, kept so an import can be undone.

No new key was added for either adaptive loop. `bodymakers:data:v1` gained `trainingAdjustments`, `trainingSessions`, and `nutritionAdjustments`, plus `nutritionComplete` on each daily log. Older saves do not have them and restore as empty / false.

All user data remains in the browser unless a future product explicitly adds consented sync.

## Home (`/`)
- Home is **read-only**. It never writes to localStorage and defines no storage key of its own. It reads `bodymakers:data:v1` and `bodymakers:diagnosis:draft:v1` only.
- STATE is decided in exactly one place, `src/lib/home/state.ts` (`resolveHomeState`):
  - `A` no plan, no diagnosis draft
  - `B` no plan, diagnosis draft present
  - `C` plan present, no activity in the last 7 days
  - `D1` plan present, active in the last 7 days, nothing recorded today
  - `D2` plan present, active in the last 7 days, already recorded today
  - Any parse failure or unexpected shape falls back to `A`.
- "Plan present" means a saved Personal Plan **or** an active Program. A user running a Program has not been shown the first-time explanation.
- Recent activity and today's activity come from `src/lib/activity/` (`weeklyProgress`, `summarizeActivity`). Home does not define what an active day is.
- `src/lib/todayAction.ts` stays separate: it answers "what is the single next action inside Today", which is about session progression. Home answers "which entry point to show". The only shared concept is "has a plan"; the activity test is shared through `src/lib/activity/`.
- Sections by state: `A`/`B` show everything; `C` shows hero, loop, evidence, and the final CTA; `D1`/`D2` show the hero only.
- Streak, today's progress, and the weekly summary are implemented and stay on Today and `/record/`. They are deliberately **not** shown on Home, so the same numbers do not appear on two screens. This is a placement decision, not a missing feature.

### First paint
- The first-time hero and all body sections are static HTML in `src/pages/index.astro` and need no JavaScript.
- A synchronous inline script in `<head>` sets `data-home-known="1"` when either storage key exists. This is a presence check only — it carries no STATE meaning — and exists so returning visitors do not see the first-time hero flash before hydration. The same pattern is already used for the theme FOUC guard.
- `HomeHero` (`client:load`) resolves the real STATE and stamps `data-home-state`, which decides the final section visibility.
- Known trade-off: a visitor who has `bodymakers:data:v1` but no plan and no draft resolves to `A`, so the body sections appear after hydration rather than before. Content is added rather than removed, so nothing collapses. Needs a look on a real device.

### Not on Home
- No sticky CTA. `BottomNav` is already `position: fixed` on mobile across every page, so a second fixed bar would sit on top of it.
- No article list, tool link list, carousel, or card grid in the Home body.
- No account, login, or cloud sync wording anywhere.

## Training Adaptive Loop
### What is stored
- `trainingSessions` holds set-level records: per exercise the planned weight / sets / reps from the program, and per set the actual weight, reps, and whether the user tapped できた. Planned and actual are kept apart on purpose, so "pressed 完了" and "did what was planned" can never be confused.
- The older signals are still there: `DailyLog.doneExercises` and 完了 / スキップ.

### v2 rule — used when set records exist
- Achieved reps count only sets that were tapped **and** were at or above the planned weight. Going lighter for more reps does not count as hitting the target.
- ratio = achieved reps / (planned sets × planned reps).
- ratio ≥ 1.0 → up one step. 0.85 ≤ ratio < 1.0 → hold, and this does **not** count as a miss. ratio < 0.85 → counts as a miss.
- Two consecutive misses → down one step, counter resets.
- Pressing 完了 alone never raises the weight any more. That is the difference from v1.

### v1 fallback — unchanged
- No set records for the session, or the session was skipped → the original 完了 / スキップ rule runs exactly as before. Old saves and users who just tap 完了 keep working.

### Shared by both
- Step size: bench 2.5kg, squat and deadlift 5kg.
- Step size: bench 2.5kg, squat and deadlift 5kg. Only BIG3 lifts that already carry a weight in the session are adjusted; accessory work is never touched.
- **Base weight stays the program's own.** The adaptive layer only stores a separate `offsetKg` and adds it at display time; `ProgramSession` weights and `ActiveProgram.trainingMaxes` are never rewritten. That is why the program's weekly progression and the adaptive offset cannot double-count.
- One session adjusts once. `lastSessionKey` (`programId:wNdM`) blocks a repeat for the same week and day.
- Offsets are clamped to ±40kg and a displayed weight never drops below 20kg.
- Today shows the reason ("スクワットは目標25回中25回を完了したので、次回は+5kgです。") and the last five adjustments behind a details toggle. Record shows this week's training review, per-lift latest set, estimated 1RM change, and recent sessions. Wording never blames the user for a missed session.
- The completion card, the next-session preview, and Today's own suggested weight all come from the same path (`sessionForActiveProgram` → `adjustSession`), so they can never disagree.
- Previous performance is reference only. It never overwrites the suggested weight — the program plus the adaptive offset stays the recommendation, and there is deliberately no "copy last time" button that would override it.
- Estimated 1RM reuses the existing `estimateOneRM`; no new formula was introduced. Only facts that can be read straight from completed sets are shown — rep PRs across different weights are deliberately left out because they cannot be compared safely.

## Nutrition Adaptive Loop v1
- **One place decides the target.** `resolveNutritionTarget` in `src/lib/nutritionAdaptive/target.ts` is used by Today, Plan, Record, and the review. Target = the plan's baseline + `offsetKcal`. The plan's own calories are never rewritten.
- **A day counts only when the user says so.** `DailyLog.nutritionComplete` is set by an explicit toggle in Today. Entering one food does not make a day count, and a day without the mark is never read as a low-intake day. The mark can be removed again.
- **Weight is judged over 7 days vs the previous 7 days**, not day to day. Both windows need at least 4 measurements. Averages are recomputed from the raw logs every time, so correcting an old weight cannot leave a stale figure behind.
- Under 0.4% of body weight over the week counts as flat. That is a noise threshold, not a recommended rate of change.
- Adherence needs at least 4 completed days in the last 7, and at least 3 of them within ±10% of the target. Both figures are product heuristics, not medical standards.
- **A proposal appears only when weight data and food records are both sufficient and the weight is not moving as intended.** Missing data gives "collecting data"; records that drift far from the target give "keep the current target" rather than a new number.
- Goal drives direction: `fat-loss` → down, `muscle` → up, everything else (`recomp`, `health`, `strength`) holds, because weight alone cannot judge them. With no personal plan, `dietPlan.mode` is used.
- One step is 100 kcal. The cumulative offset is capped at ±300 kcal. Only one adjustment per calendar week.
- **Nothing is applied automatically.** The user picks "try −100kcal" or "keep the current target", and can return to the plan's baseline at any time.
- Protein and fat stay at the plan's values; the calorie difference is absorbed by carbohydrate. Lowering protein would change the goal itself.
- Re-running the diagnosis or changing the goal produces a new plan key, and the old offset stops applying. It is never carried silently onto a new baseline.
- No medical judgement, and no wording that blames the user for what they ate.

## Weekly Coach v1
- **It is not a third adaptive engine.** `buildWeeklyCoach` in `src/lib/coach/weekly.ts` reads what the training and nutrition engines already decided and only composes, prioritises, and explains. It never re-judges training progression or nutrition adherence, and it never writes.
- Reused as-is: `buildWeeklyTrainingReview`, `liftProgressSummaries`, `buildNextSessionPreview`, `trainingAdjustments.history`, `recommendNutrition`, `weightTrend`, `nutritionAdherence`, `resolveNutritionTarget`, `weeklyProgress`.
- "This week" is the same rolling 7 days used by `src/lib/activity/`, so training, nutrition, and activity never disagree about the window.
- States: `collecting-data`, `consistency-first`, `training-progressing`, `nutrition-review`, `plan-review`, `on-track`.
- Priority: not enough data → how much was recorded → training → nutrition → plan.
- **One primary action at most.** A week where both a lift went up and a calorie change is available still asks for one decision only.
- **Automatic change and user decision are kept apart.** A weight that already moved is reported as a fact with no button. Only a calorie change, which needs consent, gets an action, and it reuses the existing nutrition confirmation UI rather than a second apply path.
- `recomp` gets no automatic calorie candidate in v1. Training progress and weight are described side by side, which is explanation, not a new adjustment.
- Nothing about the coach is persisted. It is rebuilt from current records on every read, so correcting an old weight cannot leave a stale summary behind.

### Low-target hardening
- The 800 kcal clamp in `resolveNutritionTarget` is a technical floor so the arithmetic cannot break. It is **not** a target Bodymakers may adjust down to.
- When a further decrease would land within one step of that floor, the nutrition engine returns `plan-review` instead of a candidate, and the coach routes to reviewing the plan. No generic medical minimum (1200 / 1500 / 1800) is introduced, and the copy never calls a target dangerous.

## First week
- `buildFirstWeekProgress` in `src/lib/onboarding/firstWeek.ts` derives the stage from Plan, daily logs, and training sessions. Nothing is persisted for it.
- The first action counts if it is training **or** food **or** weight. There is no "complete all of these" gate.
- Locked features are described as the next action ("あと3回ほど体重を記録すると、7日ごとの動きを見られます"), never as a technical condition.
- During the first week Today hides the Weekly Coach, the nutrition review, and the streak panel — there is not enough data behind them yet.
- Returning after 4+ days shows "おかえりなさい / 今日からまた積み上げられます". A broken streak is never the headline.

## Logging speed
- `src/lib/foodHistory.ts` derives frequent foods and the last amount used from the last 30 days of logs. No favourites are persisted, so deleting a record also removes the suggestion.
- Adding a food uses the amount most often used for it, not a fixed 100g. Suggestions never add anything on their own.
- "元に戻す" removes exactly what the last action added, including bulk text entry and recipes.

## Weekly history and 30-day progress
- `src/lib/progressHistory.ts` recomputes both from records; no weekly snapshot is stored.
- Weeks use the existing Monday-based week key, so weekly history and the nutrition adjustment period never disagree. Month and year boundaries are covered by tests.
- A week with no records is marked `hasData: false` so the UI does not present 0 as an achievement.
- The 30-day narrative is at most 4 sentences and compares the first and second half averages for weight. It never claims muscle was gained or fat was lost, and estimated 1RM is labelled a calculated value.
- Milestones come only from what records can prove: first training, 10 sessions, 30 active days, program completion.

## Counting a food-logged day
A day counts as recorded only when it is marked complete **and** actually contains food data. A day marked complete with nothing in it would otherwise be averaged in as 0 kcal and push the target the wrong way. The weekly history uses the same rule, so the number means the same thing on every screen.

## Streak and weekly summary rules
- An active day is a day with at least one meaningful record: training, food, or a weight / steps / sleep check-in. A saved-but-empty day is not active. Page views are never counted.
- Completed programs count as training on their completion date.
- All date maths use the device's local `YYYY-MM-DD` key and noon-anchored dates, so time zones and DST do not shift a streak.
- The current streak keeps counting when today has no record yet but yesterday does, because the day is not over. A streak of 0 is never described as broken or failed.
- Weekly figures use a rolling 7-day window ending today. The previous week is only compared once the whole previous window could have been observed (14 days of history).
- Summary lines are rule-based from local records only, capped at four, and state facts without health or medical judgement.

## Claims used in Home copy (verified in this repo)
Only these were written into the page. Anything not verifiable was left out.
- Strength figures: 387,265 lifters = 262,191 male + 125,074 female, from `STRENGTH_STANDARDS.totalLifters` in `src/lib/strength/standardsData.ts`. Source OpenPowerlifting, public domain, attribution string from `STANDARDS_SOURCE.attribution`.
- Nutrient values: 日本食品標準成分表（八訂）増補2023年 (`FOOD_SOURCE` in `src/lib/foods.ts`).
- Daily reference values: 日本人の食事摂取基準（2025年版）, 厚生労働省 (`NUTRITION_REFERENCE_SOURCE`).
- Programs: linear progression, upper/lower, PPL and similar named構成 exist in `PROGRAM_LIBRARY`; no paid template is copied.
- Today does show a kcal and protein target, so the Home mock includes that line.
- Diagnosis draft can report "n問目 / 全m問" via `questionProgress`.

### Deliberately absent from Home copy
- "やったことが、翌週の内容に反映されます。" — `buildPersonalPlan` never reads `dailyLogs`, so recorded work does not change next week's menu.
- "体重が思ったように動かなければ、食事の目安が変わります。" — nutrition targets come from the diagnosis-time `input.body`, not from logged weight.
- "重量が上がれば、次回の提示重量も上がります。" — `ActiveProgram.trainingMaxes` is fixed when the program starts; `advanceActiveProgram` never updates it from records.
- Instead Home says only "プログラムに沿って、週ごとに負荷が上がっていきます。", which the generated week-by-week sessions do support.

## Analytics
- No vendor, no SDK, no snippet. `src/lib/analytics.ts` exposes a single `track()` that is a deliberate no-op, plus the event names and properties as types.
- Fired on Home now: `home_view`, `hero_cta_click` (`position: hero | final`), `hero_secondary_click`, `draft_resume_click`, each carrying `state`.
- Reserved as types only, not fired: `quiz_start`, `quiz_question_view`, `quiz_abandon`, `quiz_complete`, `plan_view`, `today_start`, `today_complete`.
- No `position: sticky` value exists, because there is no sticky CTA.
- No personal data is ever passed to `track()`.

## Performance
Not measured. There is no Lighthouse or field-measurement setup in this repository, and `typecheck` / `test` / `build` cannot measure any of these.
- LCP: 未測定
- CLS: 未測定
- INP: 未測定
These are real-device checks, not something the current verification commands can pass or fail.

## Verification of the current commit
- `npm run typecheck`: 0 errors (195 files)
- `npm test`: 1010 tests in 48 files passed
- `npm run build`: 66 pages built
- `npm run check:links`: all internal links resolved
- `git diff --check`: clean
- Local Node is 18.15.0 and cannot run this toolchain; the checks above were run with a throwaway Node 22.14.0 that is not installed into the system.

## Deployment status
- Commits through `1180b7e` are on `origin/main` and live in production. The Training Adaptive Loop v1 / v2 / v2.1 the Nutrition Adaptive Loop v1, and the Weekly Coach v1 commits are **implemented locally and not pushed**. `main` is ahead of `origin/main` by 6 commits.
- The Training Adaptive Loop and set-level logging have not been verified in production and are not live.
- The last commit that reached `origin/main` is `c03c734`, and its production deployment failed because the GitHub Actions secret `CLOUDFLARE_API_TOKEN` is not set. `CLOUDFLARE_ACCOUNT_ID` is also required by `.github/workflows/production.yml`.
- CI: GitHub Actions is responsible for the production deploy after a `main` push.
- Production: not verified from this session. Direct deploy and `wrangler login` are not used here.
