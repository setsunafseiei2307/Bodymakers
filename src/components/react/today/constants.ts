/**
 * Today の画面が共有する表。
 *
 * TodayTool.tsx のモジュール直下にあったものを、画面を分割したのに伴って
 * ここへ移しただけ。中身は変えていない。
 */

import type { NutrientKey } from '../../../lib/foods';
import type { MealType } from '../../../lib/today';

/** 検索していないときに出す候補の数 */
export const SUGGEST_LIMIT = 8;

/** 追加した食品の初期グラム数 */
export const DEFAULT_GRAMS = 100;

export const MEAL_OPTIONS: { value: MealType; label: string }[] = [
  { value: 'breakfast', label: '朝食' }, { value: 'lunch', label: '昼食' },
  { value: 'dinner', label: '夕食' }, { value: 'snack', label: '間食' },
];

export const TODAY_MICRONUTRIENTS: { key: NutrientKey; label: string; unit: string; digits: number }[] = [
  { key: 'vitaminA', label: 'ビタミンA', unit: 'μg RAE', digits: 0 }, { key: 'vitaminD', label: 'ビタミンD', unit: 'μg', digits: 1 },
  { key: 'vitaminB1', label: 'ビタミンB1', unit: 'mg', digits: 2 }, { key: 'vitaminB2', label: 'ビタミンB2', unit: 'mg', digits: 2 },
  { key: 'vitaminB6', label: 'ビタミンB6', unit: 'mg', digits: 2 }, { key: 'vitaminB12', label: 'ビタミンB12', unit: 'μg', digits: 1 },
  { key: 'folate', label: '葉酸', unit: 'μg', digits: 0 }, { key: 'vitaminC', label: 'ビタミンC', unit: 'mg', digits: 0 },
  { key: 'potassium', label: 'カリウム', unit: 'mg', digits: 0 }, { key: 'calcium', label: 'カルシウム', unit: 'mg', digits: 0 },
  { key: 'magnesium', label: 'マグネシウム', unit: 'mg', digits: 0 }, { key: 'iron', label: '鉄', unit: 'mg', digits: 1 },
  { key: 'zinc', label: '亜鉛', unit: 'mg', digits: 1 },
];
