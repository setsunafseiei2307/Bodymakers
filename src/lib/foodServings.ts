/** 日常的に使う食品だけの、Today推薦用の目安量。内部計算は常にグラムで行う。 */

import type { Food } from './foods';

export interface FoodServing { foodId: string; grams: number; label: string }

export const FOOD_SERVINGS: readonly FoodServing[] = [
  { foodId: '01088', grams: 150, label: '茶碗1杯相当（150g）' }, { foodId: '04032', grams: 150, label: '1/2丁相当（150g）' },
  { foodId: '04046', grams: 40, label: '1パック相当（40g）' }, { foodId: '06086', grams: 100, label: '100g' },
  { foodId: '06263', grams: 100, label: '100g' }, { foodId: '07107', grams: 100, label: '1本相当（100g）' },
  { foodId: '11220', grams: 150, label: '1食分（150g）' }, { foodId: '11288', grams: 120, label: '1食分（120g）' },
  { foodId: '12004', grams: 50, label: '1個相当（50g）' }, { foodId: '13003', grams: 200, label: 'コップ1杯（200g）' },
  { foodId: '13025', grams: 100, label: '1カップ相当（100g）' }, { foodId: '13053', grams: 100, label: '1カップ相当（100g）' },
  { foodId: '13054', grams: 100, label: '1カップ相当（100g）' },
] as const;

export function servingForFood(food: Food): FoodServing {
  return FOOD_SERVINGS.find((serving) => serving.foodId === food.id) ?? { foodId: food.id, grams: 100, label: '100g' };
}
