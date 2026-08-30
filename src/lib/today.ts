/**
 * 1日ぶんの記録をまとめる。
 *
 * 食べたもの（食品×グラム）と動いたもの（活動×分）を足し合わせ、
 * 摂取・消費・その差し引きを出す。
 *
 * 【二重計上を避ける】
 * TDEE を「基礎代謝 × 活動レベル」で出すと、その係数の中に運動ぶんが
 * すでに含まれている。そこへ運動の消費カロリーを足すと二重に数えることになる。
 * そこでこのツールでは、土台を「基礎代謝 × 1.2（ほぼ運動なし）」に固定し、
 * 運動ぶんはユーザーが入れた活動から別に足す。画面にもその旨を出す。
 *
 * 【欠損の扱い】
 * 成分表で未測定の成分は null のまま扱い、0 とみなして足さない。
 * 何件が未測定だったかを返し、画面で「データなし」と示せるようにする。
 */

import { isFiniteNumber } from './format';
import { findFood, scaleFood, type NutrientKey } from './foods';
import { burnedKcal, findActivity } from './mets';
import { KCAL_PER_KG_FAT, calcBMR, type BodyInput } from './nutrition';

/** 運動をしない日の消費を基礎代謝の何倍と見るか。運動ぶんはここに含めない。 */
export const SEDENTARY_FACTOR = 1.2;

export interface MealEntry {
  /** 成分表の食品番号 */
  foodId: string;
  grams: number;
}

export interface ExerciseEntry {
  activityId: string;
  minutes: number;
}

export type NutrientTotals = Record<NutrientKey, number>;

export interface IntakeSummary {
  totals: NutrientTotals;
  /** 成分表で未測定だったため合計に入れられなかった件数（成分ごと） */
  missing: Partial<Record<NutrientKey, number>>;
  items: { foodId: string; name: string; grams: number; kcal: number | null }[];
}

export interface ExerciseSummary {
  kcal: number;
  items: { activityId: string; label: string; minutes: number; kcal: number }[];
}

const NUTRIENT_KEYS: NutrientKey[] = ['kcal', 'protein', 'fat', 'carbs', 'fiber', 'salt'];

/** 食べたものを合計する。 */
export function summarizeIntake(entries: readonly MealEntry[]): IntakeSummary {
  const totals = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0])) as NutrientTotals;
  const missing: Partial<Record<NutrientKey, number>> = {};
  const items: IntakeSummary['items'] = [];

  for (const entry of entries) {
    const food = findFood(entry.foodId);
    if (food == null || !isFiniteNumber(entry.grams) || entry.grams < 0) continue;

    const scaled = scaleFood(food, entry.grams);
    if (scaled == null) continue;

    for (const key of NUTRIENT_KEYS) {
      const value = scaled[key];
      if (value == null) missing[key] = (missing[key] ?? 0) + 1;
      else totals[key] += value;
    }
    items.push({ foodId: food.id, name: food.name, grams: entry.grams, kcal: scaled.kcal });
  }

  return { totals, missing, items };
}

/** 動いたものを合計する。 */
export function summarizeExercise(
  entries: readonly ExerciseEntry[],
  weightKg: number,
): ExerciseSummary {
  const items: ExerciseSummary['items'] = [];
  let kcal = 0;

  for (const entry of entries) {
    const activity = findActivity(entry.activityId);
    if (activity == null) continue;
    const burned = burnedKcal(activity.mets, entry.minutes, weightKg);
    if (burned == null) continue;
    kcal += burned;
    items.push({
      activityId: activity.id,
      label: activity.label,
      minutes: entry.minutes,
      kcal: burned,
    });
  }

  return { kcal, items };
}

export interface DayBalance {
  /** 摂取カロリー */
  intakeKcal: number;
  /** 運動以外の消費（基礎代謝 × 1.2） */
  baseKcal: number;
  /** 運動ぶんの消費 */
  exerciseKcal: number;
  /** 消費の合計 */
  burnKcal: number;
  /** 摂取 − 消費。マイナスなら赤字 */
  balanceKcal: number;
  /** この収支が30日続いた場合の体重変化(kg)。マイナスなら減る */
  monthlyChangeKg: number;
}

/**
 * 収支を出す。基礎代謝の計算に必要な情報が足りなければ null。
 *
 * 「この調子で1か月」は、同じ食事と運動が30日続いた場合の計算値でしかない。
 * 実際には体重が減れば基礎代謝も下がるため、そのままの割合では進まない。
 * 画面にはその注記を必ず添えること。
 */
export function dayBalance(
  body: BodyInput,
  intakeKcal: number,
  exerciseKcal: number,
): DayBalance | null {
  if (!isFiniteNumber(intakeKcal) || !isFiniteNumber(exerciseKcal)) return null;
  const bmr = calcBMR(body);
  if (bmr == null) return null;

  const baseKcal = bmr * SEDENTARY_FACTOR;
  const burnKcal = baseKcal + exerciseKcal;
  const balanceKcal = intakeKcal - burnKcal;

  return {
    intakeKcal,
    baseKcal,
    exerciseKcal,
    burnKcal,
    balanceKcal,
    monthlyChangeKg: (balanceKcal * 30) / KCAL_PER_KG_FAT,
  };
}

/**
 * 筋トレで動かした部位。
 *
 * 計算で求まるものではなく、利用者が選んだ内容をそのまま持つだけ。
 * メッツ表には部位の情報が無いため、ここを推測で埋めることはしない。
 */
export const MUSCLE_GROUPS = ['胸', '背中', '肩', '腕', '脚', '体幹'] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
