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

## 2026-09-03 Planned and actual are separate, and only actual moves the weight

Set records store the program's planned weight / sets / reps alongside what was actually lifted. The two are never merged. Pressing 完了 is a navigation action, not evidence that the planned work was done, so on its own it no longer raises the weight.

Achieved reps count only sets that were tapped and were at or above the planned weight. Reducing the weight to finish more reps is a valid session, but it is not the same as hitting the target, and the next weight must not rise because of it.

A near miss (85% or more of planned reps) holds the weight without counting as a miss. Starting to reduce the weight one rep short would stall progress that is nearly there.

When no set record exists for a session, the v1 rule (完了 / スキップ) runs unchanged. Older saves must never lose behaviour because a newer path exists.

The v1 guards stay as they are: ±40kg offset limit, 20kg display floor, one adjustment per session key, and the program's own weights are never rewritten.

Changing any of this requires updating this file with the reason.

## 2026-09-03 Nutrition changes are proposed, never applied on their own

Calorie targets move only when the user chooses. Bodymakers may show a proposal; it does not change a target in the background. Reverting to the plan's baseline is always available.

Judgement uses the last 7 days against the previous 7 days, with at least 4 weight measurements in each window. A single day's weight never moves a target. Averages are recomputed from the raw logs so a corrected weight cannot leave a stale figure behind.

A day counts toward the food record only when the user marks it complete (`DailyLog.nutritionComplete`). Entering one food does not make a day count, and an unmarked day is never treated as a low-intake day. Under-counting intake would push the target the wrong way, which is the more harmful error here.

One step is 100 kcal, the cumulative offset is capped at ±300 kcal, and at most one adjustment per calendar week. These are deliberately conservative so the target cannot drift far from the plan.

The plan's calories stay the baseline; only `offsetKcal` is stored. Re-running the diagnosis or changing the goal makes a new plan key and the old offset stops applying — an offset chosen for cutting must never carry onto a bulking plan.

Protein and fat keep the plan's values and the calorie difference is absorbed by carbohydrate. Lowering protein to hit a calorie number would change the goal itself.

`resolveNutritionTarget` is the only place that computes the daily target. Today, Plan, Record, and the weekly review all read it.

Direction comes from the saved goal only. `recomp`, `health`, and `strength` hold, because body weight on its own cannot tell whether they are going well.

No medical judgement is made, and copy never blames the user for what they ate.

Changing any of this requires updating this file with the reason.

## 2026-09-03 The Weekly Coach composes; it never re-judges

`buildWeeklyCoach` reads the results the training and nutrition engines already produced and does four things: order them, pick one recommendation, explain, and preview next week. It does not recompute training completion, weight trend, nutrition adherence, or any adaptive decision, and it writes nothing. A third engine with its own opinion would be a second source of truth for the same questions.

At most one primary action per week. In a week where a lift already went up and a calorie change is also available, the user is asked for one decision, not two.

Automatic change and user decision stay separate. A weight the training engine already moved is reported as a fact with no button. A calorie change needs consent, so it gets the action — and it reuses the existing nutrition confirmation UI rather than a second apply path.

`recomp` gets no automatic calorie candidate in v1. Body weight alone cannot tell whether a recomposition is going well. Describing training progress and weight together is explanation, not an adjustment.

Coach output is never persisted. It is rebuilt from current records on every read, so a corrected weight or a fixed log cannot leave a stale summary behind.

The 800 kcal clamp in `resolveNutritionTarget` is a technical floor, not a target Bodymakers may adjust down to. When a further decrease would land within one step of it, the engine returns `plan-review` and the coach routes to reviewing the plan. No generic medical minimum is introduced, and no target is ever described as dangerous — Bodymakers does not diagnose required intake.

Changing any of this requires updating this file with the reason.

## 2026-09-03 A day counts as logged only when it has something in it

`nutritionComplete` marks intent; it is not on its own evidence that food was recorded. A day marked complete with no meals and no manual intake is excluded from adherence, because averaging it in as 0 kcal would understate intake and push the calorie target the wrong way. Under-counting intake is the more harmful error here, so the stricter rule wins.

Weekly history counts the same way. The same label must not mean two different things on two screens.

## 2026-09-03 The first week gets its own answer, not a smaller dashboard

Adaptive needs history, so day 0-3 has nothing to show. `buildFirstWeekProgress` derives a stage from what already exists and Today hides the Weekly Coach, nutrition review, and streak panel until there is data behind them. Showing empty aggregates would teach people the app has nothing for them.

The first action is satisfied by training, food, **or** weight — any one of them. Requiring all three would make day one a failure by default.

Locked features are explained as the next action, never as a threshold. Returning after a gap leads with "おかえりなさい", never with a broken streak.

## 2026-09-03 Suggestions are derived, never a second copy of the truth

Frequent foods and previous amounts are computed from the logs on read. No favourites list is persisted, so a deleted record cannot leave a stale suggestion behind, and there is no second place where "what you eat" is recorded. The same reasoning already applies to weekly history and the 30-day review, none of which store a snapshot.

Suggestions only fill in a value; adding food is always an explicit action, and it can be undone.

## 2026-09-03 Import shows what will change before it changes anything

Reading a backup file only parses and previews it. The device's current contents and the file's contents are shown side by side, and the overwrite happens after a separate confirmation, with the previous data saved first so it can be restored.

Changing any of this requires updating this file with the reason.
