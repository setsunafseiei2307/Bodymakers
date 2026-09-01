/** Todayの栄養進捗と食品推薦。外部API・AIは使わず、成分表の値だけで計算する。 */

import { commonFoods, scaleFood, type Food, type NutrientKey, type NutrientValues } from './foods';
import { servingForFood, type FoodServing } from './foodServings';
import { nutritionTargets, type NutritionTarget, type ReferenceSex } from './nutritionReference';

export interface NutrientProgress extends NutritionTarget {
  intake: number;
  percent: number | null;
  remaining: number | null;
  state: 'unresolved' | 'below' | 'met' | 'within' | 'over';
}

export interface FoodRecommendation {
  food: Food;
  serving: FoodServing;
  score: number;
  contributions: { nutrient: NutrientProgress; value: number }[];
  reason: string;
}

export function nutritionProgress(totals: NutrientValues | Record<NutrientKey, number>, sex: ReferenceSex, age: number): NutrientProgress[] {
  return nutritionTargets(sex, age).map((target) => {
    const intake = totals[target.nutrient] ?? 0;
    if (target.status === 'unresolved') return { ...target, intake, percent: null, remaining: null, state: 'unresolved' };
    if (target.kind === 'dg-max') {
      const remaining = Math.max(0, target.value - intake);
      return { ...target, intake, percent: target.value === 0 ? null : (intake / target.value) * 100, remaining, state: intake > target.value ? 'over' : 'within' };
    }
    const remaining = Math.max(0, target.value - intake);
    return { ...target, intake, percent: target.value === 0 ? null : (intake / target.value) * 100, remaining, state: intake >= target.value ? 'met' : 'below' };
  });
}

/** 目安までの距離が大きい栄養素を最大3つ選ぶ。上限型と条件未確定は推薦対象にしない。 */
export function nutritionPriorities(progress: readonly NutrientProgress[], limit = 3): NutrientProgress[] {
  return progress
    .filter((item) => item.status === 'available' && item.kind !== 'dg-max' && item.remaining != null && item.remaining > 0)
    .sort((a, b) => (a.percent ?? 100) - (b.percent ?? 100))
    .slice(0, limit);
}

function isEverydayFood(food: Food): boolean {
  if (!food.common || food.kcal == null || food.kcal > 500) return false;
  return !/(調味|香辛|油脂|酒類|アルコール|乾燥|粉末|だし|ソース|しょうゆ|塩)/.test(`${food.category} ${food.name} ${food.officialName}`);
}

/** 1食分で優先栄養素をどれだけ埋めるか。複数項目に寄与するほど上位になる。 */
export function recommendFoods(
  totals: NutrientValues | Record<NutrientKey, number>,
  sex: ReferenceSex,
  age: number,
  limit = 6,
): FoodRecommendation[] {
  const priorities = nutritionPriorities(nutritionProgress(totals, sex, age));
  if (priorities.length === 0) return [];
  return commonFoods()
    .filter(isEverydayFood)
    .flatMap((food) => {
      const serving = servingForFood(food);
      const values = scaleFood(food, serving.grams);
      if (values == null) return [];
      const contributions = priorities.flatMap((nutrient) => {
        const value = values[nutrient.nutrient];
        return value == null || value <= 0 ? [] : [{ nutrient, value }];
      });
      if (contributions.length === 0) return [];
      const score = contributions.reduce((sum, item) => sum + Math.min(1, item.value / (item.nutrient.remaining ?? item.nutrient.value)), 0)
        - Math.max(0, (food.kcal ?? 0) * serving.grams / 100 - 350) / 1000;
      const labels = contributions.slice().sort((a, b) => b.value / (b.nutrient.remaining ?? b.nutrient.value) - a.value / (a.nutrient.remaining ?? a.nutrient.value)).slice(0, 2).map((item) => item.nutrient.label);
      return [{ food, serving, score, contributions, reason: `${labels.join('と')}を補いやすい` }];
    })
    .sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name, 'ja'))
    .slice(0, limit);
}
