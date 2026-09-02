/**
 * 1日の栄養目標を決める、唯一の場所。
 *
 * これまで Today・Plan・Record・Home がそれぞれ
 * 「dietPlanがあればそれ、無ければPersonal Plan」と別々に書いていた。
 * 調整を足すとずれるので、計算はここへ集約する。
 *
 * 目標 = Planが出したbaseline + 実績から積み上げたoffset。
 * Planのカロリーは書き換えない。offsetを0にすればいつでも元に戻る。
 */

import { buildPersonalPlan } from '../diagnosis/plan';
import type { BodymakersData } from '../storage';
import { MAX_OFFSET_KCAL, MIN_OFFSET_KCAL } from './engine';

/** たんぱく質と脂質の1gあたりのカロリー。差分を炭水化物で吸収するのに使う。 */
const KCAL_PER_CARB_GRAM = 4;

export interface NutritionTarget {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  /** Planが出した、調整前のカロリー。 */
  baselineCalories: number;
  /** いま効いている調整。 */
  offsetKcal: number;
  source: 'diet-plan' | 'personal-plan';
}

export interface NutritionAdjustmentEvent {
  id: string;
  date: string;
  /** 変更前後の目標カロリー。履歴からそのまま読めるようにしておく。 */
  fromCalories: number;
  toCalories: number;
  deltaKcal: number;
  reason: string;
  periodKey: string;
}

export interface NutritionAdjustments {
  version: 1;
  /** Planのカロリーに足す量。 */
  offsetKcal: number;
  /**
   * どのPlanに対する調整か。
   * Planを作り直したり目的を変えたら別のキーになり、古い調整は無効になる。
   */
  planKey: string;
  /** 最後に調整した週。同じ週に続けて調整しないための印。 */
  lastPeriodKey: string;
  history: NutritionAdjustmentEvent[];
}

export const NUTRITION_HISTORY_LIMIT = 20;

export function emptyNutritionAdjustments(): NutritionAdjustments {
  return { version: 1, offsetKcal: 0, planKey: '', lastPeriodKey: '', history: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clampOffset(value: number): number {
  return Math.max(MIN_OFFSET_KCAL, Math.min(MAX_OFFSET_KCAL, Math.round(value)));
}

function normalizeEvent(value: unknown): NutritionAdjustmentEvent | null {
  if (!isRecord(value)) return null;
  if (!finite(value.deltaKcal) || !finite(value.fromCalories) || !finite(value.toCalories)) return null;
  return {
    id: typeof value.id === 'string' ? value.id : `${String(value.date ?? '')}:${value.deltaKcal}`,
    date: typeof value.date === 'string' ? value.date : '',
    fromCalories: Math.round(value.fromCalories),
    toCalories: Math.round(value.toCalories),
    deltaKcal: Math.round(value.deltaKcal),
    reason: typeof value.reason === 'string' ? value.reason : '',
    periodKey: typeof value.periodKey === 'string' ? value.periodKey : '',
  };
}

/** 旧データにこの項目は無い。その場合は調整なしとして読む。 */
export function normalizeNutritionAdjustments(value: unknown): NutritionAdjustments {
  if (!isRecord(value) || value.version !== 1) return emptyNutritionAdjustments();
  return {
    version: 1,
    offsetKcal: finite(value.offsetKcal) ? clampOffset(value.offsetKcal) : 0,
    planKey: typeof value.planKey === 'string' ? value.planKey.slice(0, 200) : '',
    lastPeriodKey: typeof value.lastPeriodKey === 'string' ? value.lastPeriodKey.slice(0, 40) : '',
    history: Array.isArray(value.history)
      ? value.history
          .map(normalizeEvent)
          .filter((event): event is NutritionAdjustmentEvent => event != null)
          .slice(-NUTRITION_HISTORY_LIMIT)
      : [],
  };
}

/**
 * いまのPlanを指すキー。
 *
 * 診断をやり直すと createdAt が変わり、目的を変えれば goal が変わる。
 * どちらの場合も別のPlanとして扱い、前の調整を持ち越さない。
 */
export function planKeyFor(data: BodymakersData): string {
  if (data.personalPlan != null) {
    return `personal:${data.personalPlan.input.goal}:${data.personalPlan.createdAt}`;
  }
  if (data.dietPlan != null) return `diet:${data.dietPlan.mode}:${data.dietPlan.createdAt}`;
  return '';
}

/** その日が属する週。月曜の日付をキーにする。 */
export function periodKeyFor(dateKeyValue: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKeyValue);
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  if (Number.isNaN(date.getTime())) return '';
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * いま効いている調整。
 * Planが変わっていたら、保存されていても使わない。
 */
export function activeOffsetKcal(data: BodymakersData): number {
  const adjustments = data.nutritionAdjustments;
  if (adjustments.offsetKcal === 0) return 0;
  const planKey = planKeyFor(data);
  if (planKey === '' || adjustments.planKey !== planKey) return 0;
  return clampOffset(adjustments.offsetKcal);
}

/** Planが出した、調整前の目標。 */
export function baselineNutritionTarget(
  data: BodymakersData,
): { calories: number; protein: number; fat: number; carbs: number; source: 'diet-plan' | 'personal-plan' } | null {
  if (data.dietPlan != null) {
    return {
      calories: data.dietPlan.targetCalories,
      protein: data.dietPlan.proteinGrams,
      fat: data.dietPlan.fatGrams,
      carbs: data.dietPlan.carbsGrams,
      source: 'diet-plan',
    };
  }
  if (data.personalPlan != null) {
    const nutrition = buildPersonalPlan(data.personalPlan.input).nutrition;
    if (nutrition != null) {
      return {
        calories: nutrition.calories,
        protein: nutrition.protein,
        fat: nutrition.fat,
        carbs: nutrition.carbs,
        source: 'personal-plan',
      };
    }
  }
  return null;
}

function safe(value: number, min = 0): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.round(value));
}

/**
 * 画面に出す1日の目標。Today・Plan・Record・Reviewはすべてこれを使う。
 *
 * カロリーの差分は炭水化物で吸収する。たんぱく質と脂質はPlanのまま動かさない。
 * たんぱく質を削ると、目的そのものが変わってしまうため。
 */
export function resolveNutritionTarget(data: BodymakersData): NutritionTarget | null {
  const baseline = baselineNutritionTarget(data);
  if (baseline == null) return null;
  if (!Number.isFinite(baseline.calories) || baseline.calories <= 0) return null;

  const offsetKcal = activeOffsetKcal(data);
  const calories = safe(baseline.calories + offsetKcal, 800);
  // 実際に動いたぶんだけを炭水化物へ渡す（下限で丸められた場合を考慮）。
  const appliedKcal = calories - baseline.calories;
  const carbs = safe(baseline.carbs + appliedKcal / KCAL_PER_CARB_GRAM, 0);

  return {
    calories,
    protein: safe(baseline.protein),
    fat: safe(baseline.fat),
    carbs,
    baselineCalories: safe(baseline.calories),
    offsetKcal: calories - safe(baseline.calories),
    source: baseline.source,
  };
}

/** 目標が変わっている理由。変わっていなければ null。 */
export function nutritionTargetReason(target: NutritionTarget | null): string | null {
  if (target == null || target.offsetKcal === 0) return null;
  const sign = target.offsetKcal > 0 ? '+' : '−';
  return `直近2週間の記録をもとに、Planの${target.baselineCalories}kcalから${sign}${Math.abs(target.offsetKcal)}kcal調整しています。`;
}
