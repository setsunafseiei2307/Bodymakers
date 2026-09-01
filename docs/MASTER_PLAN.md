# Bodymakers product direction

## Purpose
Bodymakers is a **daily guide for strength and body building**. It turns a user's goal, current body, training, food, and recovery into one clear next action.

## Core journey
`Start diagnosis → 12-week Plan → Program selection → Today → Record → next day`

## Information architecture
- `/`: first-time explanation or the member's daily overview
- `/start/`: one-theme-at-a-time diagnosis
- `/plan/`: goal, current phase, this week's targets, and detailed diagnosis
- `/tools/today/`: training, food, recovery, and quick recording
- `/record/`: weekly evidence of consistency
- `/library/`: goal-led access to programs, strength, food/nutrition, tools, and articles
- existing `/tools/`, `/articles/`, and specialist routes remain stable for SEO and bookmarks

## Design principles
1. Put one or two next actions before data.
2. Use friendly cards, meaningful category colors, generous space, and readable Japanese sans-serif UI.
3. Keep source data and technical detail available behind progressive disclosure.
4. Make the 390px mobile experience the baseline; tables may scroll only inside their own container.
5. Preserve local-only data and never turn daily guidance into medical diagnosis.

## Existing assets to protect
The MEXT food dataset, official nutrition references, food recommendations, strength standards, 1RM/RM tools, Program Library, daily logs, Personal Plan, articles, and `bodymakers:data:v1` are continuing product assets.

## Next priorities
The first screen of Today must always show the next meaningful action: an active workout, a saved Plan, or an explicit Plan/Program entry point. Keep empty states action-led, improve repeat recording through recent-food shortcuts and weekly progress, validate retention, then add contextual article recommendations before considering deeper workout logging or account sync.

Production is deployed only by the GitHub Actions path documented in `docs/DECISIONS.md`.

## Deliberately not in scope
No AI coach, login, cloud database, social feed, marketplace, payments, camera recognition, or native app before the daily journey has proven repeat value.
