/** 基礎代謝(BMR)・消費カロリー(TDEE)・PFCバランスの計算 */

import { isFiniteNumber } from './format';

export type Sex = 'male' | 'female';
export type BmrFormula = 'mifflin' | 'harris' | 'katch';

export interface BodyInput {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  /** 体脂肪率(%)。Katch-McArdle 式に必要 */
  bodyFatPercent?: number | null;
}

export interface ActivityLevel {
  key: string;
  label: string;
  detail: string;
  factor: number;
}

export const ACTIVITY_LEVELS: ActivityLevel[] = [
  { key: 'sedentary', label: 'ほぼ運動なし', detail: 'デスクワーク中心・週0〜1回', factor: 1.2 },
  { key: 'light', label: '軽め', detail: '週1〜3回のトレーニング', factor: 1.375 },
  { key: 'moderate', label: '普通', detail: '週3〜5回のトレーニング', factor: 1.55 },
  { key: 'active', label: '高め', detail: '週6〜7回のトレーニング', factor: 1.725 },
  { key: 'athlete', label: '非常に高い', detail: '1日2回・肉体労働あり', factor: 1.9 },
];

export interface GoalPreset {
  key: string;
  label: string;
  /** TDEE に対する増減率 */
  ratio: number;
  /** 体重1kgあたりのタンパク質(g) の推奨値 */
  protein: number;
  detail: string;
}

export const GOAL_PRESETS: GoalPreset[] = [
  { key: 'cut', label: '減量', ratio: -0.2, protein: 2.2, detail: 'TDEE −20%' },
  { key: 'slowcut', label: 'ゆっくり減量', ratio: -0.1, protein: 2.0, detail: 'TDEE −10%' },
  { key: 'maintain', label: '維持', ratio: 0, protein: 1.8, detail: 'TDEE と同じ' },
  { key: 'leanbulk', label: 'リーンバルク', ratio: 0.1, protein: 1.8, detail: 'TDEE +10%' },
  { key: 'bulk', label: '増量', ratio: 0.2, protein: 1.6, detail: 'TDEE +20%' },
];

/** 体脂肪率から除脂肪体重(kg) */
export function leanBodyMass(weightKg: number, bodyFatPercent: number): number | null {
  if (!isFiniteNumber(weightKg) || !isFiniteNumber(bodyFatPercent)) return null;
  if (weightKg <= 0 || bodyFatPercent < 0 || bodyFatPercent >= 100) return null;
  return weightKg * (1 - bodyFatPercent / 100);
}

/** BMI */
export function bmi(weightKg: number, heightCm: number): number | null {
  if (!isFiniteNumber(weightKg) || !isFiniteNumber(heightCm)) return null;
  if (weightKg <= 0 || heightCm <= 0) return null;
  const m = heightCm / 100;
  return weightKg / (m * m);
}

/** 基礎代謝。katch は体脂肪率が必要で、無ければ null */
export function calcBMR(input: BodyInput, formula: BmrFormula = 'mifflin'): number | null {
  const { sex, age, heightCm, weightKg, bodyFatPercent } = input;
  if (!isFiniteNumber(age) || !isFiniteNumber(heightCm) || !isFiniteNumber(weightKg)) return null;
  if (age <= 0 || age > 120 || heightCm <= 50 || heightCm > 260 || weightKg <= 0 || weightKg > 400) {
    return null;
  }

  if (formula === 'katch') {
    if (bodyFatPercent == null) return null;
    const lbm = leanBodyMass(weightKg, bodyFatPercent);
    if (lbm == null) return null;
    return 370 + 21.6 * lbm;
  }

  if (formula === 'harris') {
    return sex === 'male'
      ? 88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * age
      : 447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.33 * age;
  }

  // Mifflin-St Jeor（現在もっとも誤差が小さいとされる式）
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

export interface MacroResult {
  bmr: number;
  tdee: number;
  targetCalories: number;
  protein: { grams: number; kcal: number; percent: number };
  fat: { grams: number; kcal: number; percent: number };
  carbs: { grams: number; kcal: number; percent: number };
  /** 体重が週あたり何kg動く想定か（7200kcal ≒ 体脂肪1kg） */
  weeklyWeightChangeKg: number;
  /** 目標カロリーが基礎代謝を下回っている等の注意 */
  warnings: string[];
}

export interface MacroOptions {
  /** 体重1kgあたりのタンパク質(g) */
  proteinPerKg?: number;
  /** 総カロリーに占める脂質の割合(%) */
  fatPercent?: number;
  /** 脂質の下限（体重1kgあたりg）。ホルモン維持のため 0.7〜0.9 が目安 */
  minFatPerKg?: number;
}

/**
 * 体脂肪1kgぶんのエネルギー(kcal)。
 *
 * 出典によって幅がある値で、単一の公式定数ではない。
 * - 厚生労働省 e-ヘルスネットの解説は「約7,000kcal」
 * - 脂肪組織の約8割が脂質という前提での計算値が 9kcal/g × 1000g × 0.8 = 7,200kcal
 * - 原典とされる Wishnofsky (1958) は 3,500kcal/lb ≒ 7,700kcal/kg
 *
 * 当サイトは日本で最も広く使われている 7,200 を採る。
 * どれを使っても1割前後の差が出るため、画面には必ず「目安」であることと
 * この幅を併記する（数字だけを独り歩きさせない）。
 */
export const KCAL_PER_KG_FAT = 7200;

/**
 * BMR → TDEE → 目標カロリー → PFC を一括で計算する。
 * 目標カロリーが基礎代謝を下回る場合は警告を返す（計算自体は行う）。
 */
export function calcMacros(
  input: BodyInput,
  activityFactor: number,
  goalRatio: number,
  formula: BmrFormula = 'mifflin',
  options: MacroOptions = {},
): MacroResult | null {
  const bmrValue = calcBMR(input, formula);
  if (bmrValue == null || !isFiniteNumber(activityFactor) || activityFactor <= 0) return null;

  const proteinPerKg = options.proteinPerKg ?? 2.0;
  const fatPercent = options.fatPercent ?? 25;
  const minFatPerKg = options.minFatPerKg ?? 0.7;

  const tdee = bmrValue * activityFactor;
  const targetCalories = tdee * (1 + goalRatio);

  const proteinGrams = Math.max(0, input.weightKg * proteinPerKg);
  const proteinKcal = proteinGrams * 4;

  let fatGrams = (targetCalories * (fatPercent / 100)) / 9;
  const minFatGrams = input.weightKg * minFatPerKg;
  if (fatGrams < minFatGrams) fatGrams = minFatGrams;
  const fatKcal = fatGrams * 9;

  const carbsKcal = Math.max(0, targetCalories - proteinKcal - fatKcal);
  const carbsGrams = carbsKcal / 4;

  const warnings: string[] = [];
  if (targetCalories < bmrValue) {
    warnings.push('目標カロリーが基礎代謝を下回っています。減量幅を小さくするか、活動量を見直してください。');
  }
  if (input.sex === 'male' && targetCalories < 1500) {
    warnings.push('1日1500kcalを下回る設定です。長期間続ける前に専門家に相談してください。');
  }
  if (input.sex === 'female' && targetCalories < 1200) {
    warnings.push('1日1200kcalを下回る設定です。長期間続ける前に専門家に相談してください。');
  }
  if (proteinKcal + fatKcal > targetCalories) {
    warnings.push('タンパク質と脂質だけで目標カロリーを超えています。どちらかの設定を下げてください。');
  }

  return {
    bmr: bmrValue,
    tdee,
    targetCalories,
    protein: {
      grams: proteinGrams,
      kcal: proteinKcal,
      percent: (proteinKcal / targetCalories) * 100,
    },
    fat: { grams: fatGrams, kcal: fatKcal, percent: (fatKcal / targetCalories) * 100 },
    carbs: { grams: carbsGrams, kcal: carbsKcal, percent: (carbsKcal / targetCalories) * 100 },
    weeklyWeightChangeKg: ((targetCalories - tdee) * 7) / KCAL_PER_KG_FAT,
    warnings,
  };
}

/** 目標体重に到達するまでのおおよその週数 */
export function weeksToGoal(
  currentKg: number,
  goalKg: number,
  weeklyChangeKg: number,
): number | null {
  if (!isFiniteNumber(currentKg) || !isFiniteNumber(goalKg) || !isFiniteNumber(weeklyChangeKg)) {
    return null;
  }
  const diff = goalKg - currentKg;
  if (Math.abs(diff) < 1e-9) return 0;
  if (Math.abs(weeklyChangeKg) < 1e-9) return null;
  if (Math.sign(diff) !== Math.sign(weeklyChangeKg)) return null;
  return diff / weeklyChangeKg;
}
