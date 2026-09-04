# Current state

- Last verified: 2026-09-04
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

## Home (`/`) — Public Home v1
- Home is a **public page**, not a personal screen. It shows the same brand, explanation, and entry points to a first-time visitor and to someone who already saved a Plan. Today never takes over `/`.
- Home is **read-only**. It never writes to localStorage and defines no storage key of its own. It reads `bodymakers:data:v1` and `bodymakers:diagnosis:draft:v1` only.
- Sections, in order: hero → continuation (saved users only) → できること (4) → どんな身体になりたい？(4 goals) → 記事 (4) → ツール (4) → プログラム (3) → final CTA. Every section is static HTML and is shown in every state.
- Wording, links, and the featured article ids live in `src/config/home.ts`. Editing copy or swapping a tool/article does not require touching the page or the stylesheet.
- Brand line: 「カライイは、つくれる。」. 「カライイ」 is a coined word, so the gloss 「カライイ = カッコいい体 × 調子のいい身体」 is rendered directly under the headline and is never used alone.
- Primary CTA is 「30秒で自分向けPlanを見る」 → `/start`, repeated in the hero and the final band. 「無料・登録不要」 sits under both.

### What the state still decides
- `resolveHomeState` (`src/lib/home/state.ts`) is unchanged and still returns `A` / `B` / `C` / `D1` / `D2`. What changed is what it is used for: it no longer hides sections. It only decides the small continuation notice.
  - Plan or active Program (`C` / `D1` / `D2`) → a small 「続きから」 card and a 「Personalの続きへ」 link in the final band.
  - Diagnosis draft only (`B`) → 「診断の続きから」 with 「n問目 / 全m問」.
  - `A` → nothing extra.
- `buildContinueCard` (`src/lib/home/continue.ts`) decides what that card says. It shows `Week N / Day M` from `ActiveProgram` and nothing else. **No weight, kcal, or completion rate is repeated on Home** — that stays in Today and `/record/`. A test asserts the card text contains no `kg` / `kcal` / `%`.
- `showsMarketingSections` and `showsLoopAndEvidence` were removed; nothing decides section visibility any more.

### Hero image
- `HERO_IMAGE` in `src/config/home.ts` is `null`, so `src/components/home/HeroVisual.astro` renders a CSS-only phone showing an example Today screen, labelled as 表示例.
- Setting `HERO_IMAGE` to `{ src, alt }` swaps in a photo. No other file changes. Pick an image without baked-in text: the headline and CTA are already in the HTML.

### Goal handoff to the diagnosis
- The four goal cards link to `/start?goal=<GoalId>`. `parseGoalParam` (`src/lib/home/goals.ts`) is the only place a query value becomes a `GoalId`; anything outside `GOAL_IDS` is ignored.
- `Onboarding` applies it **only when there is neither a saved Plan nor a draft**. Someone reviewing their previous answers can never have their goal rewritten by a URL. Question order, progression, and plan building are unchanged — only the first question's initial value is set.

### Motion
- CSS plus one `IntersectionObserver`. No animation library.
- `data-home-reveal` is set in `<head>` only when `IntersectionObserver` exists and `prefers-reduced-motion` is not `reduce`. Without it, everything is visible from the first paint, so no-JS and reduced-motion visitors see the full page.
- The observer callback sweeps every remaining target instead of trusting one entry, because a fast scroll can skip an element's intersection notification entirely.
- A 2-second failsafe in `<head>` clears `data-home-reveal` if the body script never ran, so content can never stay invisible.

### First paint
- Everything except the continuation notice is static HTML and needs no JavaScript.
- A synchronous inline script in `<head>` sets `data-home-known="1"` when either storage key exists. This is a presence check only — it carries no STATE meaning — and is used to reserve the height of the continuation slot so it does not push the page down after hydration. The same pattern is already used for the theme FOUC guard.
- `HomeContinue` (`client:load`) resolves the real STATE and stamps `data-home-state`, which is what shows 「Personalの続きへ」 in the final band.

### Colour
- Home does not use `--signal`: that token becomes red in the dark theme. Home's brand colours are `--hm-*`, scoped to `.home-page` in `src/styles/home.css` — Deep Navy, vivid blue (hue kept in 210–220 so it never reads purple), white, ice blue, and a small warm accent on the continuation card.
- `.home-cta` replaces `.button` on this page for the same reason.
- Site-wide `h1..h6` are `--ink`; the headings on the navy bands override that explicitly.

### Not on Home
- No sticky CTA. `BottomNav` is already `position: fixed` on mobile across every page, so a second fixed bar would sit on top of it.
- No streak, no today's progress, no weekly summary, no session weights. Those stay on Today and `/record/`.
- No account, login, or cloud sync wording anywhere.

### Verified on a real render
- Chromium screenshots at 320 / 375 / 390 / 430 / 768 / 1440, light and dark, plus no-JS and `prefers-reduced-motion: reduce`.
- No horizontal scroll at any width (`scrollWidth === clientWidth`), no link under 44px tall, and no element left at `opacity: 0` after scrolling.
- Checked with a saved `activeProgram`: STATE `C`, the public hero is still the hero, and the continuation card reads `Week 1 / Day 2`.

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
- Nutrient values: 日本食品標準成分表（八訂）増補2023年 (`FOOD_SOURCE` in `src/lib/foods.ts`).
- Daily reference values: 日本人の食事摂取基準（2025年版）, 厚生労働省 (`NUTRITION_REFERENCE_SOURCE`).
- Strength figures: 387,265 lifters, from `STRENGTH_STANDARDS.totalLifters` in `src/lib/strength/standardsData.ts`. Source OpenPowerlifting, public domain. Public Home v1 links to 筋力レベル診断 but does not repeat the figure; the number and the attribution live on `/strength-standards/`.
- Programs: linear progression, upper/lower, PPL and similar named構成 exist in `PROGRAM_LIBRARY`; no paid template is copied. Home's three program entries (初心者向け / 筋肥大 / 筋力アップ) all link to the existing `/tools/programs`.
- Today does show a kcal and protein target, so the hero's example screen includes that line. It is labelled 表示例 and the numbers are not read from any record.
- Diagnosis draft can report "n問目 / 全m問" via `questionProgress`.

### Deliberately absent from Home copy
- "やったことが、翌週の内容に反映されます。" — `buildPersonalPlan` never reads `dailyLogs`, so recorded work does not change next week's menu.
- "体重が思ったように動かなければ、食事の目安が変わります。" — nutrition targets come from the diagnosis-time `input.body`, not from logged weight.
- "重量が上がれば、次回の提示重量も上がります。" — `ActiveProgram.trainingMaxes` is fixed when the program starts; `advanceActiveProgram` never updates it from records.

## Analytics
- No vendor, no SDK, no snippet. `src/lib/analytics.ts` exposes a single `track()` that is a deliberate no-op, plus the event names and properties as types.
- Fired on Home now: `home_view`, `hero_cta_click` (`position: hero | final`), `goal_select` (carrying the chosen `goal`), `continue_click`, `draft_resume_click`, each carrying `state`. `hero_secondary_click` is still declared but no longer fired — Public Home v1 has no secondary hero link.
- `goal` is one of the five `GoalId` values. It records which button was pressed, not anything about the visitor's body.
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
