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
