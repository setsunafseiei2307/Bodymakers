/**
 * よく食べるものと、前回の分量。
 *
 * 毎日ほぼ同じものを食べる人が、毎回検索して100gと打ち直すのは無駄が多い。
 * ただ、そのために「お気に入り」を別に保存すると、実際の食事と二重に管理が要る。
 *
 * ここでは保存済みの日々の記録から、その場で数える。
 * 記録を消せば候補も消えるので、実態とずれない。
 *
 * 候補を出すだけで、勝手に食べたことにはしない。追加は本人の操作でだけ起きる。
 */

import { dateKey, recentDateKeys } from './activity/days';
import { findFood, type Food } from './foods';
import type { DailyLog } from './storage';
import type { MealType } from './today';

/** 頻度を数える期間。 */
export const FOOD_HISTORY_DAYS = 30;

export interface FoodSuggestion {
  food: Food;
  /** その期間に登場した回数。 */
  count: number;
  /** 前回その食品に使った分量。そのまま追加の初期値にする。 */
  grams: number;
  /** 前回どの食事区分で食べたか。 */
  mealType: MealType | null;
  lastDate: string;
}

interface Tally {
  count: number;
  grams: number;
  mealType: MealType | null;
  lastDate: string;
  /** 分量ごとの登場回数。いちばん多い分量を選ぶのに使う。 */
  gramsCount: Map<number, number>;
}

function usableGrams(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= 5000;
}

/**
 * よく食べるものを、直近の記録から数える。
 *
 * 並びは「回数が多い順 → 最近使った順」。
 * 同じ食品を何度も出さないよう、食品IDごとに1件へまとめる。
 */
export function frequentFoods(
  logs: readonly DailyLog[],
  options: { limit?: number; days?: number; now?: Date } = {},
): FoodSuggestion[] {
  const limit = Math.max(0, options.limit ?? 8);
  if (limit === 0) return [];
  const days = Math.max(1, options.days ?? FOOD_HISTORY_DAYS);
  const window = new Set(recentDateKeys(dateKey(options.now ?? new Date()), days));

  const tally = new Map<string, Tally>();
  for (const log of logs) {
    if (!window.has(log.date)) continue;
    for (const meal of log.meals) {
      if (!usableGrams(meal.grams)) continue;
      const current = tally.get(meal.foodId);
      if (current == null) {
        tally.set(meal.foodId, {
          count: 1,
          grams: meal.grams,
          mealType: meal.mealType ?? null,
          lastDate: log.date,
          gramsCount: new Map([[meal.grams, 1]]),
        });
        continue;
      }
      current.count += 1;
      current.gramsCount.set(meal.grams, (current.gramsCount.get(meal.grams) ?? 0) + 1);
      // 新しい日付のほうを「前回」として残す。
      if (log.date >= current.lastDate) {
        current.lastDate = log.date;
        current.grams = meal.grams;
        current.mealType = meal.mealType ?? current.mealType;
      }
    }
  }

  const suggestions: FoodSuggestion[] = [];
  for (const [foodId, item] of tally) {
    const food = findFood(foodId);
    // 成分表から引けない食品は候補に出さない。
    if (food == null) continue;

    // 何度も同じ分量で食べているなら、その分量を初期値にする。
    let grams = item.grams;
    let best = 0;
    for (const [candidate, count] of item.gramsCount) {
      if (count > best) {
        best = count;
        grams = candidate;
      }
    }

    suggestions.push({
      food,
      count: item.count,
      grams: best >= 2 ? grams : item.grams,
      mealType: item.mealType,
      lastDate: item.lastDate,
    });
  }

  return suggestions
    .sort((a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate))
    .slice(0, limit);
}

/** その食品に前回使った分量。無ければ null。 */
export function lastAmountFor(logs: readonly DailyLog[], foodId: string): number | null {
  let found: { date: string; grams: number } | null = null;
  for (const log of logs) {
    for (const meal of log.meals) {
      if (meal.foodId !== foodId || !usableGrams(meal.grams)) continue;
      if (found == null || log.date >= found.date) found = { date: log.date, grams: meal.grams };
    }
  }
  return found?.grams ?? null;
}
