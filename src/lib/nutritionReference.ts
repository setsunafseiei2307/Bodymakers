/**
 * 厚生労働省「日本人の食事摂取基準（2025年版）」のうち、
 * Bodymakersの食品データで集計できる栄養素を画面用に参照する。
 * 値は令和6年厚生労働省告示第339号で全改された別表から転記した。
 * 妊娠・授乳、月経など現在の入力で判定できない条件は目標を返さない。
 */

import type { NutrientKey } from './foods';

export const NUTRITION_REFERENCE_SOURCE = {
  title: '日本人の食事摂取基準（2025年版）',
  publisher: '厚生労働省',
  notice: '令和6年厚生労働省告示第339号',
  url: 'https://www.mhlw.go.jp/web/t_doc?dataId=78ab4652&dataType=0',
  reportUrl: 'https://www.mhlw.go.jp/stf/newpage_44138.html',
  updated: '2025-03-25',
} as const;

export type ReferenceSex = 'male' | 'female';
export type NutritionTargetKind = 'rda' | 'ai' | 'dg-min' | 'dg-max';
export type NutritionTargetStatus = 'available' | 'unresolved';

export interface NutritionTarget {
  nutrient: NutrientKey;
  label: string;
  unit: string;
  digits: number;
  kind: NutritionTargetKind;
  value: number;
  status: NutritionTargetStatus;
  unresolvedReason?: string;
  source: typeof NUTRITION_REFERENCE_SOURCE;
}

type AgeBand = { min: number; max: number | null; label: string };
const AGE_BANDS: readonly AgeBand[] = [
  { min: 12, max: 14, label: '12〜14歳' }, { min: 15, max: 17, label: '15〜17歳' },
  { min: 18, max: 29, label: '18〜29歳' }, { min: 30, max: 49, label: '30〜49歳' },
  { min: 50, max: 64, label: '50〜64歳' }, { min: 65, max: 74, label: '65〜74歳' },
  { min: 75, max: null, label: '75歳以上' },
] as const;

const META: Partial<Record<NutrientKey, { label: string; unit: string; digits: number }>> = {
  vitaminA: { label: 'ビタミンA', unit: 'μg RAE', digits: 0 }, vitaminD: { label: 'ビタミンD', unit: 'μg', digits: 1 },
  vitaminE: { label: 'ビタミンE', unit: 'mg', digits: 1 }, vitaminK: { label: 'ビタミンK', unit: 'μg', digits: 0 },
  vitaminB1: { label: 'ビタミンB1', unit: 'mg', digits: 2 }, vitaminB2: { label: 'ビタミンB2', unit: 'mg', digits: 2 },
  vitaminB6: { label: 'ビタミンB6', unit: 'mg', digits: 2 }, vitaminB12: { label: 'ビタミンB12', unit: 'μg', digits: 1 },
  folate: { label: '葉酸', unit: 'μg', digits: 0 }, pantothenic: { label: 'パントテン酸', unit: 'mg', digits: 1 },
  biotin: { label: 'ビオチン', unit: 'μg', digits: 0 }, vitaminC: { label: 'ビタミンC', unit: 'mg', digits: 0 },
  potassium: { label: 'カリウム', unit: 'mg', digits: 0 }, calcium: { label: 'カルシウム', unit: 'mg', digits: 0 },
  magnesium: { label: 'マグネシウム', unit: 'mg', digits: 0 }, phosphorus: { label: 'リン', unit: 'mg', digits: 0 },
  iron: { label: '鉄', unit: 'mg', digits: 1 }, zinc: { label: '亜鉛', unit: 'mg', digits: 1 },
  copper: { label: '銅', unit: 'mg', digits: 2 }, manganese: { label: 'マンガン', unit: 'mg', digits: 1 },
  fiber: { label: '食物繊維', unit: 'g', digits: 1 }, salt: { label: '食塩相当量', unit: 'g', digits: 1 },
};

type ReferenceRow = { nutrient: NutrientKey; kind: NutritionTargetKind; male: readonly number[]; female: readonly number[]; femaleUnresolved?: boolean };
const rows: readonly ReferenceRow[] = [
  { nutrient: 'vitaminA', kind: 'rda', male: [800,900,850,900,900,850,800], female: [700,650,650,700,700,700,650] },
  { nutrient: 'vitaminD', kind: 'ai', male: [9,9,9,9,9,9,9], female: [9,9,9,9,9,9,9] },
  { nutrient: 'vitaminE', kind: 'ai', male: [6.5,7,6.5,6.5,6.5,7.5,7], female: [6,6,5,6,6,7,6] },
  { nutrient: 'vitaminK', kind: 'ai', male: [140,150,150,150,150,150,150], female: [150,150,150,150,150,150,150] },
  { nutrient: 'vitaminB1', kind: 'rda', male: [1.1,1.2,1.1,1.2,1.1,1,1], female: [1,1,0.8,0.9,0.8,0.8,0.7] },
  { nutrient: 'vitaminB2', kind: 'rda', male: [1.6,1.7,1.6,1.7,1.6,1.4,1.4], female: [1.4,1.4,1.2,1.2,1.2,1.1,1.1] },
  { nutrient: 'vitaminB6', kind: 'rda', male: [1.4,1.5,1.5,1.5,1.5,1.4,1.4], female: [1.3,1.3,1.2,1.2,1.2,1.2,1.2] },
  { nutrient: 'vitaminB12', kind: 'ai', male: [4,4,4,4,4,4,4], female: [4,4,4,4,4,4,4] },
  { nutrient: 'folate', kind: 'rda', male: [230,240,240,240,240,240,240], female: [230,240,240,240,240,240,240] },
  { nutrient: 'pantothenic', kind: 'ai', male: [7,7,6,6,6,6,6], female: [6,6,5,5,5,5,5] },
  { nutrient: 'biotin', kind: 'ai', male: [50,50,50,50,50,50,50], female: [50,50,50,50,50,50,50] },
  { nutrient: 'vitaminC', kind: 'rda', male: [90,100,100,100,100,100,100], female: [90,100,100,100,100,100,100] },
  { nutrient: 'potassium', kind: 'dg-min', male: [2600,3000,3000,3000,3000,3000,3000], female: [2400,2600,2600,2600,2600,2600,2600] },
  { nutrient: 'calcium', kind: 'rda', male: [1000,800,800,750,750,750,750], female: [800,650,650,650,650,650,600] },
  { nutrient: 'magnesium', kind: 'rda', male: [290,360,340,380,370,350,330], female: [290,310,280,290,290,280,270] },
  { nutrient: 'phosphorus', kind: 'ai', male: [1200,1200,1000,1000,1000,1000,1000], female: [1100,1000,800,800,800,800,800] },
  { nutrient: 'iron', kind: 'rda', male: [9,9,7,7.5,7,7,6.5], female: [8,6.5,6,6.5,6.5,6,5.5], femaleUnresolved: true },
  { nutrient: 'zinc', kind: 'rda', male: [8.5,10,9,9.5,9.5,9,9], female: [8.5,8,7.5,8,8,7.5,7] },
  { nutrient: 'copper', kind: 'rda', male: [0.8,0.9,0.8,0.9,0.9,0.8,0.8], female: [0.8,0.7,0.7,0.7,0.7,0.7,0.7] },
  { nutrient: 'manganese', kind: 'ai', male: [3.5,3.5,3.5,3.5,3.5,3.5,3.5], female: [3,3,3,3,3,3,3] },
  { nutrient: 'fiber', kind: 'dg-min', male: [17,19,20,22,22,21,20], female: [16,18,18,18,18,18,17] },
  { nutrient: 'salt', kind: 'dg-max', male: [10,9,7,7,7,7,7], female: [10,9,7,7,7,7,7] },
];

export function nutritionAgeBand(age: number): AgeBand | null {
  if (!Number.isInteger(age) || age < 12) return null;
  return AGE_BANDS.find((band) => age >= band.min && (band.max == null || age <= band.max)) ?? null;
}

/** RDAを優先し、RDAがない栄養素はAI、DGが設定されているものはDGとして返す。 */
export function nutritionTargets(sex: ReferenceSex, age: number): NutritionTarget[] {
  const band = nutritionAgeBand(age);
  if (band == null) return [];
  const index = AGE_BANDS.indexOf(band);
  return rows.flatMap((row) => {
    const meta = META[row.nutrient];
    if (meta == null) return [];
    const unresolved = sex === 'female' && row.femaleUnresolved;
    return [{ nutrient: row.nutrient, ...meta, kind: row.kind, value: (sex === 'male' ? row.male : row.female)[index]!, status: unresolved ? 'unresolved' : 'available', ...(unresolved ? { unresolvedReason: '月経の有無で公式基準値が異なるため、現在の入力だけでは目安を決めません。' } : {}), source: NUTRITION_REFERENCE_SOURCE }];
  });
}

export function nutritionTargetFor(nutrient: NutrientKey, sex: ReferenceSex, age: number): NutritionTarget | null {
  return nutritionTargets(sex, age).find((target) => target.nutrient === nutrient) ?? null;
}
